/**
 * Model-vision OCR: when the scanned pages have to be read by the model itself.
 *
 * The host half already knows how to render PDF pages (unpdf + @napi-rs/canvas, see
 * ocr.ts). This module feeds those page images to ctx.llm as image content blocks and
 * asks the model to transcribe each page verbatim. It is an *engine choice*, not a
 * replacement: pages that already carry a text layer keep their text, exactly like
 * the Windows OCR path, and the caller decides which engine to run.
 *
 * Why it exists: the Windows recogniser on this machine only ships zh-Hans-CN, so
 * English scans, formulas and dense two-column layouts lose accuracy. The model's
 * vision route (deepseek-flash declares inputModalities ['text','image']) reads those
 * pages much better - at the cost of tokens and latency. `auto` mode therefore runs
 * the free local engine first and only falls back here when it produced nothing.
 */
import { getDocumentProxy, renderPageAsImage } from 'unpdf'
import {
  cleanOcrPageText,
  joinPages,
  nonSpaceLength,
  readPageTextLayer,
  MIN_PAGE_CHARS,
  type PdfProxy,
} from './ocr.js'
import { isCredentialFailure, type LlmTarget } from './llm-target.js'
import type { LlmService } from './types.js'

export interface VisionAttachments {
  saveImages: (inputs: Array<{ data: Uint8Array; mediaType: string; name?: string }>) => Promise<unknown[]>
}

export interface VisionOcrDeps {
  getLlm: () => LlmService | null
  getAttachments: () => VisionAttachments | null
  provider: string
  /** Image-capable model id; null falls back to deepseek-flash. */
  model: string | null
  /** Optional live route list (harness default first). Overrides provider/model when present. */
  getTargets?: () => Promise<LlmTarget[]>
  markGood?: (target: LlmTarget) => void
  markFailed?: (provider: string) => void
}

export interface VisionOcrOptions {
  /** Pages to consider from page 1. Default 20 (each page is one model call). */
  maxPages?: number
  /** pdf.js render scale. Default 1.6 (enough detail, keeps PNGs small). */
  scale?: number
  /** Parallel transcription calls. Default 2. */
  concurrency?: number
  /** Hard wall-clock budget. Default 240 s. */
  timeoutMs?: number
}

export interface VisionOcrResult {
  text: string
  pages: number
  ocrPages: number
  engine: 'model-vision' | 'none'
  language: string
  ms: number
  note?: string
}

const DEFAULT_MAX_PAGES = 20
const HARD_MAX_PAGES = 120
const DEFAULT_SCALE = 1.6
const DEFAULT_CONCURRENCY = 2
const DEFAULT_TIMEOUT_MS = 240_000
const MIN_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 900_000
/** Per-page wall clock, so one stuck call cannot eat the whole budget. */
const PAGE_TIMEOUT_MS = 90_000
const FALLBACK_MODEL = 'deepseek-flash'

const TRANSCRIBE_PROMPT = [
  '这是一篇学术论文中某一页的截图。请逐字转录本页全部可见文字（正文、图表标题、页眉页脚都可以），保持原有段落顺序。',
  '要求：只输出转录出的文字本身；不要总结、不要解释、不要加任何前后说明；不要用 markdown 代码块；不要重复页面编号。',
  '数学公式与上下标用可读的纯文本近似表示（例如 x^2、a_i、α）；表格按行用空格或竖线分隔。',
  '如果本页几乎没有文字（纯图页 / 整页图片），只输出一个空字符串。',
].join('')

export async function ocrPdfWithVision(
  buffer: Uint8Array,
  deps: VisionOcrDeps,
  options: VisionOcrOptions = {},
): Promise<VisionOcrResult> {
  const startedAt = Date.now()
  const maxPages = clampInt(options.maxPages, DEFAULT_MAX_PAGES, 1, HARD_MAX_PAGES)
  const scale = clampNumber(options.scale, DEFAULT_SCALE, 0.8, 3)
  const concurrency = clampInt(options.concurrency, DEFAULT_CONCURRENCY, 1, 4)
  const timeoutMs = clampInt(options.timeoutMs, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const notes: string[] = []
  let pdf: PdfProxy | null = null
  try {
    pdf = await getDocumentProxy(buffer)
    const totalPages = typeof pdf.numPages === 'number' ? pdf.numPages : 0
    const limitedPages = Math.min(totalPages, maxPages)
    if (limitedPages === 0) return fail(startedAt, totalPages, 'PDF has no pages')
    if (totalPages > limitedPages) notes.push('only first ' + limitedPages + '/' + totalPages + ' pages')

    const llm = deps.getLlm()
    const attachments = deps.getAttachments()
    if (llm === null || typeof llm.prepareCall !== 'function') return fail(startedAt, totalPages, 'ctx.llm is unavailable in this host')
    if (attachments === null) return fail(startedAt, totalPages, 'ctx.attachments is unavailable in this host')
    const model = deps.model !== null && deps.model !== '' ? deps.model : FALLBACK_MODEL

    // 1) Pages that already have a usable text layer keep their own text.
    const pageTexts = await readPageTextLayer(pdf)
    const slots: Array<{ page: number; text: string }> = []
    const targets: number[] = []
    for (let page = 1; page <= limitedPages; page += 1) {
      const layer = pageTexts[page - 1] ?? ''
      if (nonSpaceLength(layer) >= MIN_PAGE_CHARS) slots.push({ page, text: layer })
      else {
        slots.push({ page, text: '' })
        targets.push(page)
      }
    }
    if (targets.length === 0) {
      const text = joinPages(slots.map((slot) => slot.text.trim()).filter((part) => part !== ''))
      return {
        text,
        pages: totalPages,
        ocrPages: 0,
        engine: text === '' ? 'none' : 'model-vision',
        language: 'auto',
        ms: Date.now() - startedAt,
        note: 'all considered pages already carry a text layer; no model call was needed',
      }
    }

    // 2) Render the scan pages (sequential: one pdf.js document proxy).
    const images: Array<{ page: number; png: Uint8Array }> = []
    for (const page of targets) {
      try {
        const png = await renderPageAsImage(pdf, page, {
          canvasImport: () => import('@napi-rs/canvas'),
          scale,
          format: 'png',
        })
        images.push({ page, png })
      } catch {
        notes.push('page ' + page + ': render failed')
      }
    }
    if (images.length === 0) return fail(startedAt, totalPages, 'pdf.js could not render any page to an image')

    // 3) Pick a provider route by transcribing the first scanned page. A route whose
    // credential is missing fails here and the next candidate is tried, so a desktop
    // profile logged in through the DeepSeek account does not die on deepseek-official.
    const routes: LlmTarget[] = deps.getTargets !== undefined
      ? await deps.getTargets()
      : [{ provider: deps.provider, model }]
    if (routes.length === 0) routes.push({ provider: deps.provider, model })
    const byPage = new Map<number, string>()
    let inFlightUsage = ''
    let targetIndex = 0
    let chosen: LlmTarget | null = null
    let routeError = ''
    const probe = images[0] ?? null
    while (probe !== null && targetIndex < routes.length) {
      const candidate = routes[targetIndex]
      try {
        const [ref] = await attachments.saveImages([{ data: probe.png, mediaType: 'image/png', name: 'page-' + probe.page + '.png' }])
        const outcome = await withTimeout(transcribePage(llm, candidate.provider, candidate.model, ref, probe.page), PAGE_TIMEOUT_MS)
        const pageText = cleanOcrPageText(outcome.text)
        if (outcome.usage !== '') inFlightUsage = outcome.usage
        if (nonSpaceLength(pageText) >= MIN_PAGE_CHARS) byPage.set(probe.page, pageText)
        chosen = candidate
        deps.markGood?.(candidate)
        break
      } catch (error) {
        routeError = errorMessage(error)
        if (routeUnusable(error) && targetIndex < routes.length - 1) {
          deps.markFailed?.(candidate.provider)
          notes.push('route ' + candidate.provider + '/' + candidate.model + ' unusable: ' + routeError)
          targetIndex += 1
          continue
        }
        break
      }
    }
    if (chosen === null) return fail(startedAt, totalPages, 'no model route could read a scanned page: ' + routeError.slice(0, 300))

    // 4) Transcribe the rest in parallel with a bounded pool and a per-page watchdog.
    let cursor = 0
    let timedOut = false
    let routeLost = false
    const worker = async (): Promise<void> => {
      for (;;) {
        if (timedOut || routeLost) return
        const index = cursor
        cursor += 1
        const image = images[index]
        if (image === undefined) return
        if (byPage.has(image.page)) continue
        if (Date.now() - startedAt > timeoutMs) {
          timedOut = true
          return
        }
        try {
          const [ref] = await attachments.saveImages([{ data: image.png, mediaType: 'image/png', name: 'page-' + image.page + '.png' }])
          const outcome = await withTimeout(
            transcribePage(llm, chosen.provider, chosen.model, ref, image.page),
            PAGE_TIMEOUT_MS,
          )
          const pageText = cleanOcrPageText(outcome.text)
          if (outcome.usage !== '') inFlightUsage = outcome.usage
          if (nonSpaceLength(pageText) >= MIN_PAGE_CHARS) byPage.set(image.page, pageText)
        } catch (error) {
          notes.push('page ' + image.page + ': ' + errorMessage(error))
          if (routeUnusable(error)) {
            routeLost = true
            deps.markFailed?.(chosen.provider)
            return
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, images.length) }, () => worker()))
    if (timedOut) notes.push('overall timeout after ' + Math.round(timeoutMs / 1000) + 's')
    if (routeLost) notes.push('provider route ' + chosen.provider + ' stopped answering mid-run')

    // 4) Assemble page-ordered text.
    const parts: string[] = []
    for (const slot of slots) {
      const pageText = byPage.get(slot.page) ?? slot.text
      if (pageText.trim() !== '') parts.push(pageText.trim())
    }
    const text = joinPages(parts)
    const ocrPages = byPage.size
    const measurable = 'model ' + chosen.provider + '/' + chosen.model + ', ' + ocrPages + '/' + targets.length + ' scan pages' + (inFlightUsage !== '' ? ', ' + inFlightUsage : '')
    if (text === '') return fail(startedAt, totalPages, 'model produced no usable text (' + measurable + ')')
    return {
      text,
      pages: totalPages,
      ocrPages,
      engine: 'model-vision',
      language: 'auto',
      ms: Date.now() - startedAt,
      note: [measurable].concat(notes).join('; '),
    }
  } catch (error) {
    return fail(startedAt, 0, errorMessage(error))
  }
}

interface PageTranscription {
  text: string
  usage: string
}

async function transcribePage(
  llm: LlmService,
  provider: string,
  model: string,
  ref: unknown,
  page: number,
): Promise<PageTranscription> {
  const base = { provider, model, maxTokens: 3000, temperature: 0 }
  let call
  try {
    call = await llm.prepareCall!(base, undefined, (controls: Record<string, unknown>) => ({ ...controls, reasoningEffort: 'off' }))
  } catch {
    call = await llm.prepareCall!(base)
  }
  const options: Record<string, unknown> = {
    ...call.config,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', attachment: ref },
          { type: 'text', text: TRANSCRIBE_PROMPT + ' 这是第 ' + page + ' 页。' },
        ],
      },
    ],
  }
  let text = ''
  let usage = ''
  for await (const chunk of call.stream(options)) {
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    else if (chunk.type === 'usage') {
      const raw = chunk as unknown as { inputTokens?: number; outputTokens?: number; usage?: { inputTokens?: number; outputTokens?: number } }
      const input = raw.usage?.inputTokens ?? raw.inputTokens
      const output = raw.usage?.outputTokens ?? raw.outputTokens
      if (typeof input === 'number' || typeof output === 'number') usage = 'tokens ' + (input ?? '?') + ' in / ' + (output ?? '?') + ' out'
    } else if (chunk.type === 'finish') {
      const reason = chunk.reason as { kind?: string; failure?: { message?: string } } | null
      if (reason !== null && typeof reason === 'object' && reason.kind === 'error') {
        const failure = reason.failure as { code?: string; message?: string } | undefined
        const error = new Error(failure?.message ?? 'LLM request failed') as Error & { code?: string }
        if (typeof failure?.code === 'string') error.code = failure.code
        throw error
      }
    }
  }
  return { text, usage }
}

function routeUnusable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  if (isCredentialFailure(code)) return true
  const message = errorMessage(error)
  return /CREDENTIAL|AUTH|SIGN_?IN|no API key|UNAUTHORIZED|unauthenticated|401/i.test(message)
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('page transcription timed out after ' + Math.round(ms / 1000) + 's')), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

function fail(startedAt: number, pages: number, note: string): VisionOcrResult {
  return { text: '', pages, ocrPages: 0, engine: 'none', language: 'auto', ms: Date.now() - startedAt, note }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}
