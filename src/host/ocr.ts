/**
 * Scanned / image-only PDF OCR for the host half.
 *
 * Windows ships a usable OCR engine (Windows.Media.Ocr) with Chinese support, but
 * it is a WinRT API that is only reachable from PowerShell (Windows PowerShell 5.1
 * loads System.Runtime.WindowsRuntime; PowerShell 7 cannot). So the design is:
 *
 *   PDF buffer -> pdf.js (unpdf, bundled) renders the first N pages to PNG with
 *   @napi-rs/canvas -> one long-lived PowerShell process runs Windows.Media.Ocr
 *   over the PNGs -> UTF-8 (no BOM) JSON -> this module cleans + joins the text.
 *
 * Pages that already carry a real text layer are not OCR'd: their text is taken
 * verbatim, which keeps born-digital / mixed PDFs (some text pages, some scans)
 * fast and accurate. Pages whose OCR result has fewer than MIN_PAGE_CHARS
 * non-space characters are treated as blank and dropped.
 *
 * Everything is best-effort: ocrPdfBuffer() never throws. Only when it produces no
 * usable text at all does it return engine:'none' with a short note, and the import
 * pipeline decides between "needs OCR" and "failed".
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { definePDFJSModule, extractText, getDocumentProxy, renderPageAsImage } from 'unpdf'
// Load pdf.js through a static import so tsdown inlines it into lib/index.js,
// exactly like pdf.ts does. Without it the dynamic import('unpdf/pdfjs') would be
// unresolvable in the installed plugin (no runtime node_modules).
import * as pdfjsNamespace from '../../node_modules/unpdf/dist/pdfjs.mjs'

// Register the bundled pdf.js with unpdf before any rendering happens. Registering
// twice (pdf.ts does the same) is harmless: the loader is a plain module-level slot.
definePDFJSModule(async () => pdfjsNamespace)

export interface OcrOptions {
  /** Pages to consider, from page 1 onwards. Default 30 (pipeline passes 40). */
  maxPages?: number
  /** pdf.js render scale. Default 2.0 (~72 dpi * 2). */
  scale?: number
  /** Preferred Windows OCR language tags, most specific first. */
  languages?: string[]
  /** Hard wall-clock budget for the OCR process. Default 180 s. */
  timeoutMs?: number
}

export interface OcrResult {
  /** OCR text (plus verbatim text of pages that already had a text layer). */
  text: string
  /** Total pages in the PDF. */
  pages: number
  /** Pages that produced usable OCR text. */
  ocrPages: number
  engine: 'windows-ocr' | 'none'
  /** Windows OCR language actually used, e.g. 'zh-Hans-CN'. */
  language: string
  /** Wall-clock milliseconds for the whole call (render + OCR). */
  ms: number
  /** Human-readable diagnostics: page counts, blank pages, timeout, errors. */
  note?: string
}

export interface OcrProbe {
  available: boolean
  languages: string[]
  engine: 'windows-ocr' | 'none'
}

export type PdfProxy = Awaited<ReturnType<typeof getDocumentProxy>>

interface RawOcrPage {
  name: string
  text: string
  error: string
  ms: number
  chars: number
}

interface RawOcrJson {
  ok?: boolean
  done?: boolean
  engine?: string
  language?: string
  error?: string
  availableLanguages?: unknown
  pages?: unknown
}

const DEFAULT_MAX_PAGES = 30
const HARD_MAX_PAGES = 200
const DEFAULT_SCALE = 2
const DEFAULT_TIMEOUT_MS = 180_000
const MIN_TIMEOUT_MS = 5_000
const MAX_TIMEOUT_MS = 600_000
/** Pages with fewer non-space characters than this count as blank / unusable. */
export const MIN_PAGE_CHARS = 60
const DEFAULT_LANGUAGES = ['zh-Hans-CN', 'zh-Hans', 'zh-CN', 'en-US', 'en-GB', 'en']
/** Keep the temp work dir (rendered PNGs + JSON) for debugging when set to 1. */
const KEEP_TEMP_ENV = 'LITGRAPH_OCR_KEEP_TEMP'
/** Set to 1 to pretend the machine has no OCR engine (tests / slow hosts). */
const DISABLE_ENV = 'LITGRAPH_OCR_DISABLE'

function ocrDisabled(): boolean {
  return process.env[DISABLE_ENV] === '1'
}

let probePromise: Promise<OcrProbe> | null = null

/**
 * Windows OCR capability probe (cached for the process lifetime). Pipeline / a
 * status route can show language availability in the UI.
 */
export async function probeOcr(): Promise<OcrProbe> {
  if (probePromise === null) probePromise = runProbe()
  return probePromise
}

async function runProbe(): Promise<OcrProbe> {
  if (ocrDisabled()) return { available: false, languages: [], engine: 'none' }
  if (process.platform !== 'win32') return { available: false, languages: [], engine: 'none' }
  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), 'litgraph-ocr-probe-'))
    const scriptPath = join(dir, 'probe.ps1')
    const outJson = join(dir, 'probe.json')
    await writeFile(scriptPath, PROBE_SCRIPT, 'utf8')
    await runPowerShellFile(scriptPath, ['-OutputJson', outJson], 20_000)
    const parsed = await readJsonFile(outJson)
    if (parsed === null) return { available: false, languages: [], engine: 'none' }
    const languages = toStringArray(parsed.availableLanguages)
    const available = parsed.available === true && languages.length > 0
    return { available, languages, engine: available ? 'windows-ocr' : 'none' }
  } catch {
    return { available: false, languages: [], engine: 'none' }
  } finally {
    if (dir !== null) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * OCR the first pages of a PDF buffer. Never throws.
 */
export async function ocrPdfBuffer(buffer: Uint8Array, options: OcrOptions = {}): Promise<OcrResult> {
  const startedAt = Date.now()
  const maxPages = clampInt(options.maxPages, DEFAULT_MAX_PAGES, 1, HARD_MAX_PAGES)
  const scale = clampNumber(options.scale, DEFAULT_SCALE, 0.5, 3)
  const timeoutMs = clampInt(options.timeoutMs, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const languages = normalizeLanguages(options.languages)
  const notes: string[] = []
  const measures: string[] = []
  let workDir: string | null = null
  let pdf: PdfProxy | null = null
  let totalPages = 0
  let limitedPages = 0
  let ocrAttempted = 0
  let ocrPages = 0
  let textPages = 0
  let blankPages = 0
  let failedPages = 0
  let engine: 'windows-ocr' | 'none' = 'none'
  let language = ''
  let keepTemp = false

  if (ocrDisabled()) return fail(startedAt, 0, 'OCR disabled via ' + DISABLE_ENV)
  if (process.platform !== 'win32') return fail(startedAt, 0, 'Windows OCR is only available on Windows')

  try {
    workDir = await mkdtemp(join(tmpdir(), 'litgraph-ocr-'))
    keepTemp = process.env[KEEP_TEMP_ENV] === '1'
    pdf = await getDocumentProxy(buffer)
    totalPages = typeof pdf.numPages === 'number' ? pdf.numPages : 0
    limitedPages = Math.min(totalPages, maxPages)
    if (limitedPages === 0) return fail(startedAt, totalPages, 'PDF has no pages')
    if (totalPages > limitedPages) {
      notes.push('only first ' + limitedPages + '/' + totalPages + ' pages (maxPages=' + maxPages + ')')
    }

    // 1) Read the text layer once. Pages with a usable layer keep their own text and
    //    are not rendered - mixed PDFs stay fast and keep their original quality.
    const pageTexts = await readPageTextLayer(pdf)
    const slots: Array<{ page: number; kind: 'text' | 'ocr' | 'blank'; text: string }> = []
    const ocrTargets: number[] = []
    for (let page = 1; page <= limitedPages; page += 1) {
      const layer = pageTexts[page - 1] ?? ''
      if (nonSpaceLength(layer) >= MIN_PAGE_CHARS) {
        slots.push({ page, kind: 'text', text: layer })
        textPages += 1
      } else {
        slots.push({ page, kind: 'ocr', text: '' })
        ocrTargets.push(page)
      }
    }
    ocrAttempted = ocrTargets.length

    // 2) Render scan pages to PNG (sequential: pdf.js shares one document proxy).
    if (ocrTargets.length > 0) {
      const rendered: number[] = []
      for (const page of ocrTargets) {
        try {
          const png = await renderPageAsImage(pdf, page, {
            canvasImport: () => import('@napi-rs/canvas'),
            scale,
            format: 'png',
          })
          await writeFile(join(workDir, pageImageName(page)), png)
          rendered.push(page)
        } catch {
          failedPages += 1
        }
      }
      if (rendered.length === 0) {
        notes.push('pdf.js could not render any page to an image')
      } else {
        // 3) One PowerShell process OCRs every rendered page and flushes JSON after
        //    each page, so a timeout kill still yields the pages already recognised.
        const scriptPath = join(workDir, 'windows-ocr.ps1')
        const outJson = join(workDir, 'ocr-result.json')
        await writeFile(scriptPath, OCR_SCRIPT, 'utf8')
        const run = await runPowerShellFile(
          scriptPath,
          ['-InputDir', workDir, '-OutputJson', outJson, '-Languages', languages.join(',')],
          timeoutMs,
        )
        const parsed = await readJsonFile(outJson)
        if (parsed !== null && parsed.ok === true) {
          language = typeof parsed.language === 'string' ? parsed.language : ''
          const byName = new Map<string, RawOcrPage>()
          for (const raw of normalizeOcrPages(parsed.pages)) byName.set(raw.name, raw)
          for (const slot of slots) {
            if (slot.kind !== 'ocr') continue
            const raw = byName.get(pageImageStem(slot.page))
            if (raw === undefined || raw.error !== '') {
              failedPages += 1
              continue
            }
            const pageText = cleanOcrPageText(raw.text)
            ocrPages += 1
            if (nonSpaceLength(pageText) < MIN_PAGE_CHARS) {
              blankPages += 1
              slot.kind = 'blank'
            } else {
              slot.text = pageText
            }
          }
          if (run.timedOut) notes.push('OCR timeout after ' + Math.round(timeoutMs / 1000) + 's; kept ' + ocrPages + ' pages')
          else if (parsed.done !== true) notes.push('OCR process stopped before the last page')
          if (run.code !== 0 && run.stderr.trim() !== '') notes.push('powershell: ' + firstLine(run.stderr))
        } else {
          const rawError = parsed !== null && typeof parsed.error === 'string' ? parsed.error : ''
          const message = rawError !== '' ? rawError : run.stderr.trim() !== '' ? run.stderr.trim() : 'OCR script produced no JSON result'
          notes.push('OCR failed: ' + firstLine(message))
          if (run.timedOut) notes.push('OCR timeout after ' + Math.round(timeoutMs / 1000) + 's')
        }
      }
    } else {
      notes.push('all considered pages already carry a text layer; nothing to render')
    }

    // 4) Assemble page-ordered text. Blank pages are dropped but keep their slot.
    const parts: string[] = []
    for (const slot of slots) {
      if (slot.kind === 'blank') continue
      const pageText = slot.text.trim()
      if (pageText !== '') parts.push(pageText)
    }
    const text = joinPages(parts)
    if (text === '') {
      engine = 'none'
      notes.push('no usable text recognized')
    } else if (ocrAttempted === 0 || ocrPages > 0) {
      engine = 'windows-ocr'
    } else {
      // OCR was attempted for every candidate page and none produced text; let the
      // caller fall back to extractPdf() instead of using a partial document.
      engine = 'none'
      notes.push('OCR produced no usable page; falling back to the text layer')
    }
    measures.push(
      'pages=' + totalPages,
      'considered=' + limitedPages,
      'ocrPages=' + ocrPages,
      'textPages=' + textPages,
      'blank=' + blankPages,
      'failed=' + failedPages,
      'scale=' + scale,
      'lang=' + (language !== '' ? language : 'none'),
    )
    if (keepTemp && workDir !== null) notes.push('temp kept: ' + workDir)
    return finish(text)
  } catch (error) {
    return fail(startedAt, totalPages, errorMessage(error))
  } finally {
    if (pdf !== null) {
      try {
        const loadingTask = (pdf as unknown as { loadingTask?: { destroy?: () => Promise<void> } }).loadingTask
        await loadingTask?.destroy?.()
      } catch {
        // best-effort cleanup
      }
    }
    if (workDir !== null && !keepTemp) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  function finish(text = ''): OcrResult {
    const note = [...measures, ...notes].join(' | ')
    return {
      text,
      pages: totalPages,
      ocrPages,
      engine,
      language,
      ms: Date.now() - startedAt,
      note: note !== '' ? note : undefined,
    }
  }

  function fail(started: number, pages: number, message: string): OcrResult {
    return {
      text: '',
      pages,
      ocrPages: 0,
      engine: 'none',
      language: '',
      ms: Date.now() - started,
      note: 'OCR unavailable: ' + message,
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Text layer + text cleanup                                                  */
/* -------------------------------------------------------------------------- */

export async function readPageTextLayer(pdf: PdfProxy): Promise<string[]> {
  try {
    const result = await extractText(pdf, { mergePages: false })
    const pages = Array.isArray(result.text) ? result.text : [result.text]
    return pages.map((page) => normalizeLooseText(page))
  } catch {
    // A broken text layer is the same as no text layer for our purposes.
    return []
  }
}

function normalizeLooseText(raw: string): string {
  return raw.replace(/\u0000/g, ' ').replace(/\r\n?/g, '\n').trim()
}

const CJK_CHARS = '\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff'
const CJK_PUNCT = '\u3000-\u303f\uff00-\uffef\u2018-\u201f'
const CJK_ALL = CJK_CHARS + CJK_PUNCT
const CJK_OR_DIGIT = CJK_ALL + '0-9'
const CJK_PUNCT_CLASS = '[' + CJK_PUNCT + ']'
const CJK_ALL_CLASS = '[' + CJK_ALL + ']'
const CJK_OR_DIGIT_CLASS = '[' + CJK_OR_DIGIT + ']'
// Windows OCR's Chinese models emit one "word" per character, so OcrResult.Text is
// "多 柔 性 体 系 统 的 振 动 智 能 控 制 研 究". Rejoin CJK-to-CJK spaces, CJK
// punctuation spaces and digit groups; keep Latin word spaces intact.
const RE_CJK_CJK = new RegExp('(?<=' + CJK_ALL_CLASS + ')[ \\t]+(?=' + CJK_ALL_CLASS + ')', 'g')
const RE_CJK_PUNCT_AFTER = new RegExp('(?<=' + CJK_PUNCT_CLASS + ')[ \\t]+', 'g')
const RE_CJK_PUNCT_BEFORE = new RegExp('[ \\t]+(?=' + CJK_PUNCT_CLASS + ')', 'g')
const RE_CJK_DIGIT = new RegExp('(?<=' + CJK_OR_DIGIT_CLASS + ')[ \\t]+(?=' + CJK_OR_DIGIT_CLASS + ')', 'g')
const RE_DIGIT_DIGIT = /(?<=\d)[ \t]+(?=\d)/g
// Runs of single-digit "words": "2 0 2 1 年" -> "2021 年". Only applied to pages
// that contain CJK text (Chinese cover pages space out big-font digits); English
// pages keep their "2019 2020" number pairs apart.
const RE_DIGIT_RUN = /(?<![\d.])\d(?:[ \t]\d)+(?![\d.])/g
const RE_HAS_CJK = /[\u4e00-\u9fff]/

export function cleanOcrPageText(raw: string): string {
  if (raw === '') return ''
  let text = raw.replace(/\u0000/g, ' ').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ')
  if (RE_HAS_CJK.test(text)) text = text.replace(RE_DIGIT_RUN, (run) => run.replace(/[ \t]+/g, ''))
  // Two passes: removing a space can bring new neighbours into contact.
  for (let pass = 0; pass < 2; pass += 1) {
    text = text
      .replace(RE_CJK_CJK, '')
      .replace(RE_CJK_PUNCT_AFTER, '')
      .replace(RE_CJK_PUNCT_BEFORE, '')
      .replace(RE_CJK_DIGIT, '')
      .replace(RE_DIGIT_DIGIT, '')
  }
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
}

export function joinPages(pages: string[]): string {
  return pages
    .map((page) => page.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim())
    .filter((page) => page !== '')
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/* -------------------------------------------------------------------------- */
/* PowerShell plumbing                                                        */
/* -------------------------------------------------------------------------- */

interface PowerShellRun {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

function runPowerShellFile(scriptPath: string, scriptArgs: string[], timeoutMs: number): Promise<PowerShellRun> {
  return new Promise((resolve) => {
    execFile(
      powershellPath(),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...scriptArgs],
      {
        windowsHide: true,
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: 16 * 1024 * 1024,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        const failure = error as (Error & { killed?: boolean; code?: unknown }) | null
        const code = failure === null ? 0 : typeof failure.code === 'number' ? failure.code : null
        resolve({
          code,
          stdout: typeof stdout === 'string' ? stdout : '',
          stderr: typeof stderr === 'string' ? stderr : '',
          timedOut: failure !== null && failure.killed === true,
        })
      },
    )
  })
}

function powershellPath(): string {
  if (process.platform !== 'win32') return 'powershell.exe'
  const root = process.env['SystemRoot'] ?? process.env['windir'] ?? 'C:\\Windows'
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

async function readJsonFile(filePath: string): Promise<RawOcrJson | null> {
  try {
    const raw = await readFile(filePath, 'utf8')
    if (raw.trim() === '') return null
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return null
    return parsed as RawOcrJson
  } catch {
    return null
  }
}

function normalizeOcrPages(raw: unknown): RawOcrPage[] {
  const list: unknown[] = Array.isArray(raw) ? raw : raw === null || raw === undefined ? [] : [raw]
  const pages: RawOcrPage[] = []
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    pages.push({
      name: typeof record['name'] === 'string' ? record['name'] : '',
      text: typeof record['text'] === 'string' ? record['text'] : '',
      error: typeof record['error'] === 'string' ? record['error'] : '',
      ms: typeof record['ms'] === 'number' ? record['ms'] : 0,
      chars: typeof record['chars'] === 'number' ? record['chars'] : 0,
    })
  }
  return pages
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value === 'string' && value !== '') return [value]
  return []
}

function pageImageName(page: number): string {
  return 'page-' + String(page).padStart(3, '0') + '.png'
}

function pageImageStem(page: number): string {
  return 'page-' + String(page).padStart(3, '0')
}

/* -------------------------------------------------------------------------- */
/* Small utilities                                                            */
/* -------------------------------------------------------------------------- */

export function nonSpaceLength(text: string): number {
  return text.replace(/\s/g, '').length
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function normalizeLanguages(languages: string[] | undefined): string[] {
  const wanted = (languages ?? DEFAULT_LANGUAGES)
    .map((tag) => tag.trim())
    .filter((tag) => /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(tag))
  return wanted.length > 0 ? wanted : DEFAULT_LANGUAGES
}

function firstLine(text: string): string {
  const line = text.trim().split(/\r?\n/, 1)[0] ?? ''
  return line.length > 240 ? line.slice(0, 240) + '...' : line
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/* -------------------------------------------------------------------------- */
/* Embedded PowerShell: one process OCRs every rendered page.                 */
/* Keep this script ASCII-only: Windows PowerShell 5.1 reads BOM-less .ps1    */
/* files as ANSI, so non-ASCII literals would be mangled.                     */
/* -------------------------------------------------------------------------- */

const OCR_SCRIPT = [
  'param(',
  '  [Parameter(Mandatory=$true)][string]$InputDir,',
  '  [Parameter(Mandatory=$true)][string]$OutputJson,',
  "  [string]$Languages = 'zh-Hans-CN,zh-Hans,zh-CN,en-US,en-GB,en'",
  ')',
  '$ErrorActionPreference = "Stop"',
  "$ProgressPreference = 'SilentlyContinue'",
  '',
  'function Write-Json([string]$path, [hashtable]$payload) {',
  '  $json = $payload | ConvertTo-Json -Depth 8 -Compress',
  '  $tmp = $path + ".tmp"',
  '  [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding($false)))',
  '  Move-Item -LiteralPath $tmp -Destination $path -Force',
  '}',
  '',
  'try {',
  '  Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  '  $null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]',
  '  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]',
  '  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]',
  '  $null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime]',
  '  $null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Foundation, ContentType = WindowsRuntime]',
  '} catch {',
  '  Write-Json $OutputJson @{ ok = $false; error = ("Windows OCR types unavailable: " + $_.Exception.Message); pages = @(); language = "" }',
  '  exit 10',
  '}',
  '',
  "$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
  'if ($null -eq $asTaskGeneric) {',
  '  Write-Json $OutputJson @{ ok = $false; error = "AsTask helper not found"; pages = @(); language = "" }',
  '  exit 11',
  '}',
  'function Await($WinRtTask, $ResultType) {',
  '  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)',
  '  $netTask = $asTask.Invoke($null, @($WinRtTask))',
  '  $netTask.Wait(-1) | Out-Null',
  '  $netTask.Result',
  '}',
  '',
  '$available = New-Object System.Collections.ArrayList',
  'try { foreach ($l in [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages) { [void]$available.Add([string]$l.LanguageTag) } } catch { }',
  '$chosen = ""',
  "foreach ($tag in ($Languages -split ',')) {",
  '  $want = $tag.Trim()',
  '  if ($want.Length -eq 0) { continue }',
  '  foreach ($a in $available) { if ($a -eq $want) { $chosen = $want; break } }',
  '  if ($chosen.Length -gt 0) { break }',
  '}',
  'if ($chosen.Length -eq 0 -and $available.Count -gt 0) { $chosen = [string]$available[0] }',
  'if ($chosen.Length -eq 0) {',
  '  Write-Json $OutputJson @{ ok = $false; error = "No Windows OCR recognizer language is installed"; pages = @(); language = ""; availableLanguages = @($available) }',
  '  exit 12',
  '}',
  "$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($chosen))",
  'if ($null -eq $engine) {',
  '  Write-Json $OutputJson @{ ok = $false; error = ("OcrEngine could not be created for " + $chosen); pages = @(); language = $chosen; availableLanguages = @($available) }',
  '  exit 13',
  '}',
  '',
  '$pages = New-Object System.Collections.ArrayList',
  '$files = @(Get-ChildItem -LiteralPath $InputDir -Filter "*.png" | Sort-Object Name)',
  'foreach ($f in $files) {',
  '  $pageName = $f.BaseName',
  '  $t0 = Get-Date',
  '  $pageText = ""',
  '  $pageError = ""',
  '  try {',
  '    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($f.FullName)) ([Windows.Storage.StorageFile])',
  '    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])',
  '    try {',
  '      $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])',
  '      $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])',
  '      $ocrResult = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])',
  '      $lineTexts = New-Object System.Collections.ArrayList',
  '      foreach ($line in $ocrResult.Lines) { [void]$lineTexts.Add([string]$line.Text) }',
  '      if ($lineTexts.Count -gt 0) {',
  '        $sep = [string][char]13 + [string][char]10',
  '        $pageText = [string]::Join($sep, @($lineTexts))',
  '      } else {',
  '        $pageText = [string]$ocrResult.Text',
  '      }',
  '    } finally { $stream.Dispose() }',
  '  } catch { $pageError = [string]$_.Exception.Message }',
  '  $elapsed = [int]((Get-Date) - $t0).TotalMilliseconds',
  '  $entry = @{ name = $pageName; ms = $elapsed; chars = $pageText.Length }',
  '  if ($pageError.Length -gt 0) { $entry.error = $pageError } else { $entry.text = $pageText }',
  '  [void]$pages.Add($entry)',
  '  Write-Json $OutputJson @{ ok = $true; engine = "windows-ocr"; language = $chosen; availableLanguages = @($available); pages = @($pages) }',
  '}',
  'Write-Json $OutputJson @{ ok = $true; done = $true; engine = "windows-ocr"; language = $chosen; availableLanguages = @($available); pages = @($pages) }',
  'exit 0',
].join('\n') + '\n'

const PROBE_SCRIPT = [
  'param(',
  '  [Parameter(Mandatory=$true)][string]$OutputJson',
  ')',
  '$ErrorActionPreference = "Stop"',
  "$ProgressPreference = 'SilentlyContinue'",
  '',
  'function Write-Json([string]$path, [hashtable]$payload) {',
  '  $json = $payload | ConvertTo-Json -Depth 6 -Compress',
  '  $tmp = $path + ".tmp"',
  '  [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding($false)))',
  '  Move-Item -LiteralPath $tmp -Destination $path -Force',
  '}',
  '',
  'try {',
  '  Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  '  $null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]',
  '  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]',
  '} catch {',
  '  Write-Json $OutputJson @{ available = $false; languages = @(); engine = "none"; error = ("Windows OCR types unavailable: " + $_.Exception.Message) }',
  '  exit 10',
  '}',
  '',
  '$langs = New-Object System.Collections.ArrayList',
  'try { foreach ($l in [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages) { [void]$langs.Add([string]$l.LanguageTag) } } catch { }',
  '$maxDim = 0',
  'try { $maxDim = [int][Windows.Media.Ocr.OcrEngine]::MaxImageDimension } catch { }',
  '$engine = $null',
  'foreach ($tag in $langs) { try { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new([string]$tag)); if ($null -ne $engine) { break } } catch { } }',
  '$engineTag = "none"',
  'if ($null -ne $engine) { $engineTag = "windows-ocr" }',
  'Write-Json $OutputJson @{ available = ($null -ne $engine); availableLanguages = @($langs); languages = @($langs); engine = $engineTag; maxImageDimension = $maxDim }',
  'exit 0',
].join('\n') + '\n'
