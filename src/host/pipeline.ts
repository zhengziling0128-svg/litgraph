/**
 * Import pipeline: streamed upload -> text extraction -> LLM metadata -> taxonomy/graph.
 *
 * A job walks queued -> parsing -> extracting -> graphing -> done/failed. The job map
 * lives in memory (LibraryStore), the paper record is persisted, so a host restart
 * surfaces half-processed papers as 'failed' instead of showing fake progress.
 */
import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { basename } from 'node:path'
import type {
  AnalyzeResult,
  LitgraphConfig,
  PaperRelation,
  ParsedPayload,
  RelationHint,
  StoredPaper,
} from './types.js'
import { categoryTop, buildGraph, type GraphData } from './graph.js'
import { LlmAnalyzeError, LlmAnalyzer, type AnalyzeInput } from './llm.js'
import { ocrPdfBuffer } from './ocr.js'
import { ocrPdfWithVision, type VisionOcrDeps } from './vision-ocr.js'
import { extractPdf, PdfError } from './pdf.js'
import { fetchJournalMetrics, metricsEnabledFor, metricsSecretKeyFor } from './metrics.js'
import { LibraryStore } from './store.js'
import { errorCode, errorMessage, nowIso, sha256Hex, truncateText } from './util.js'

export class PipelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'PipelineError'
  }
}

export interface RetryFailedResult {
  ok: true
  retried: Array<{ paperId: string; jobId: string }>
  skipped: string[]
}

export interface ImportResult {
  jobId: string
  paperId: string
  duplicate: boolean
  size: number
}

/** Zotero provenance handed along by the Zotero import route. */
export interface ImportProvenance {
  zoteroKey: string
  attachmentKey: string | null
}

/** Map the route payload onto the persisted paper.zotero link (never invents a key). */
function zoteroLinkOf(provenance?: ImportProvenance): StoredPaper['zotero'] | undefined {
  if (provenance === undefined) return undefined
  const key = typeof provenance.zoteroKey === 'string' ? provenance.zoteroKey.trim().slice(0, 100) : ''
  if (key === '') return undefined
  const rawAttachment = typeof provenance.attachmentKey === 'string' ? provenance.attachmentKey.trim().slice(0, 100) : ''
  return { key, attachmentKey: rawAttachment === '' ? null : rawAttachment }
}

export interface StatusPayload {
  ok: true
  mode: 'host'
  paperCount: number
  clusterCount: number
  byStatus: Record<string, number>
  storage: { dataRoot: string; keepSourcePdf: boolean; saveText: boolean; jobs: number }
}

/** A Zotero record passed in by the Zotero importer (host half). */
export interface ZoteroMetadataInput {
  key?: string
  itemType?: string
  title: string
  creators?: string[]
  authors?: string[]
  year?: number | null
  venue?: string
  doi?: string
  abstract?: string
  tags?: string[]
  collections?: string[]
  fileName?: string
  attachmentFileName?: string
}

export interface MetadataImportResult {
  paperId: string
  duplicate: boolean
  jobId: string
}

/** Result shape shared by the Windows OCR engine and the model-vision engine. */
interface OcrOutcome {
  text: string
  pages: number
  ocrPages: number
  engine: string
  language: string
  ms: number
  note?: string
}

const MIN_TEXT_CHARS = 200
const MAX_TITLE_CHARS = 500
const MAX_OCR_PAGES = 40
/** Model OCR costs one call per page, so keep it far below the local engine's budget. */
const MAX_VISION_PAGES = 20

function titleFromFileName(fileName: string): string {
  const stem = basename(fileName).replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim()
  return (stem || 'Untitled paper').slice(0, MAX_TITLE_CHARS)
}

function normalizeUserTags(raw: string[] | undefined): string[] {
  if (raw === undefined) return []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const item of raw) {
    const value = item.trim().replace(/\s+/g, ' ').slice(0, 40)
    if (value === '') continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(value)
    if (tags.length >= 24) break
  }
  return tags
}

/** Drops every ' | metrics: <reason>' segment so a retry never stacks notes. */
function stripMetricsNote(note: string): string {
  return note.replace(/\s*\|\s*metrics:[^|]*/gu, '').trim()
}

function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export class LitgraphPipeline {
  private graphCache: GraphData | null = null
  private active = 0
  private readonly queue: Array<() => Promise<void>> = []

  constructor(
    private readonly store: LibraryStore,
    private readonly analyzer: LlmAnalyzer,
    private readonly config: LitgraphConfig,
    /** ctx.llm / ctx.attachments bridge; null in hosts that cannot do model vision. */
    private readonly vision: VisionOcrDeps | null = null,
  ) {}

  async start(): Promise<void> {
    await this.store.ensure()
    await this.store.cleanupTmp()
  }

  invalidateGraph(): void {
    this.graphCache = null
    this.graphCacheLevel = null
  }

  async getGraph(): Promise<GraphData> {
    const settings = await this.store.getSettings()
    const rawLevel = settings.clusterLevel ?? 2
    const depth = rawLevel === 1 || rawLevel === 3 ? rawLevel : 2
    if (this.graphCache !== null && this.graphCacheLevel === depth) return this.graphCache
    const papers = await this.store.listPapers()
    this.graphCache = buildGraph(papers, depth)
    this.graphCacheLevel = depth
    return this.graphCache
  }

  async status(): Promise<StatusPayload> {
    const papers = await this.store.listPapers()
    const byStatus = await this.store.countByStatus()
    const graph = await this.getGraph()
    return {
      ok: true,
      mode: 'host',
      paperCount: papers.length,
      clusterCount: graph.clusters.length,
      byStatus,
      storage: {
        dataRoot: this.config.dataRoot,
        keepSourcePdf: this.config.keepSourcePdf,
        saveText: this.config.saveText,
        jobs: this.store.jobCount(),
      },
    }
  }

  /**
   * Called by the upload route once the body has been streamed to a temp file.
   * Validates magic bytes, dedupes by sha256, adopts the bytes into the source store
   * and enqueues background processing. Returns immediately (202 to the client).
   */
  async importFile(
    tmpPath: string,
    rawFileName: string,
    size: number,
    provenance?: ImportProvenance,
  ): Promise<ImportResult> {
    const fileName = basename(rawFileName.replace(/\\/g, '/')).slice(0, 200) || 'paper.pdf'
    const zoteroLink = zoteroLinkOf(provenance)
    if (size <= 0) {
      await unlink(tmpPath).catch(() => undefined)
      throw new PipelineError('EMPTY_UPLOAD', 'uploaded file is empty')
    }
    if (size > this.config.maxUploadBytes) {
      await unlink(tmpPath).catch(() => undefined)
      throw new PipelineError('TOO_LARGE', 'PDF is larger than the ' + Math.round(this.config.maxUploadBytes / 1024 / 1024) + ' MB limit')
    }
    const buffer = await readFile(tmpPath)
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      await unlink(tmpPath).catch(() => undefined)
      throw new PipelineError('NOT_A_PDF', 'the uploaded file is not a PDF (missing %PDF- header)')
    }
    const sha256 = sha256Hex(buffer)
    const existing = await this.store.findBySha(sha256)
    if (existing !== null) {
      // A previously failed import can be retried from the same UI: reuse the record
      // instead of answering "duplicate" for an empty, failed entry.
      if (existing.status === 'failed') {
        let keepTmp: string | null = null
        let hasFile = existing.hasFile
        if (this.config.keepSourcePdf) {
          const adopted = await this.store.adoptSource(tmpPath, sha256)
          hasFile = adopted.adopted || (await this.store.hasSource(sha256))
        } else {
          keepTmp = tmpPath
          hasFile = false
        }
        await this.store.updatePaper(existing.id, {
          status: 'processing',
          fileName,
          size,
          hasFile,
          pages: 0,
          textChars: 0,
          parseNote: '',
          llmModel: '',
          llmMs: 0,
          ...(zoteroLink !== undefined ? { zotero: zoteroLink } : {}),
          updatedAt: nowIso(),
        })
        const retryJob = this.store.createJob(existing.id, 'retry: ' + fileName)
        this.enqueue(retryJob.id, existing.id, sha256, fileName, keepTmp)
        return { jobId: retryJob.id, paperId: existing.id, duplicate: false, size }
      }
      await unlink(tmpPath).catch(() => undefined)
      const job = this.store.createJob(existing.id, 'duplicate: already in library')
      this.store.updateJob(job.id, { state: 'done', progress: 1, message: 'duplicate of "' + existing.title + '"' })
      return { jobId: job.id, paperId: existing.id, duplicate: true, size }
    }
    const paperId = 'p_' + randomUUID().replace(/-/g, '').slice(0, 16)
    const stamp = nowIso()
    const provisional: StoredPaper = {
      id: paperId,
      title: titleFromFileName(fileName),
      authors: [],
      year: null,
      venue: '',
      abstract: '',
      keywords: [],
      categories: [],
      summary: '',
      contributions: [],
      method: '',
      fileName,
      size,
      status: 'processing',
      addedAt: stamp,
      updatedAt: stamp,
      hasFile: false,
      relations: [],
      ...(zoteroLink !== undefined ? { zotero: zoteroLink } : {}),
      sha256,
      pages: 0,
      textChars: 0,
      llmModel: '',
      llmMs: 0,
    }
    let keepTmp: string | null = null
    if (this.config.keepSourcePdf) {
      const adopted = await this.store.adoptSource(tmpPath, sha256)
      provisional.hasFile = adopted.adopted || (await this.store.hasSource(sha256))
    } else {
      // Text + metadata are kept; the original PDF bytes are dropped after processing.
      keepTmp = tmpPath
      provisional.hasFile = false
    }
    await this.store.putPaper(provisional)
    const job = this.store.createJob(paperId, 'queued: ' + fileName)
    this.enqueue(job.id, paperId, sha256, fileName, keepTmp)
    return { jobId: job.id, paperId, duplicate: false, size }
  }

  /**
   * Import a Zotero *record* (no PDF). The paper is created immediately as
   * 'processing' and the LLM classifies it from title/abstract/keywords in the
   * background, exactly like a PDF import. Deduped by normalised title so a later
   * PDF import of the same work can be attached by the user (or via title match).
   */
  async importZoteroMetadata(record: ZoteroMetadataInput): Promise<MetadataImportResult> {
    const title = (record.title ?? '').trim().slice(0, MAX_TITLE_CHARS) || 'Untitled Zotero item'
    const creators = (record.authors ?? record.creators ?? [])
      .map((name) => name.trim())
      .filter((name) => name !== '')
      .slice(0, 64)
    const abstract = (record.abstract ?? '').trim().slice(0, 20000)
    const zoteroLink: StoredPaper['zotero'] | undefined =
      typeof record.key === 'string' && record.key.trim() !== ''
        ? { key: record.key.trim().slice(0, 100), attachmentKey: null }
        : undefined
    const key = titleKey(title)
    const papers = await this.store.listPapers()
    if (key !== '') {
      const existing = papers.find((paper) => titleKey(paper.title) === key)
      if (existing !== undefined) {
        // Same retry rule as importFile: a failed record gets its metadata refreshed
        // and is queued again instead of being reported as a duplicate.
        if (existing.status === 'failed') {
          await this.store.updatePaper(existing.id, {
            status: 'processing',
            fileName: (record.attachmentFileName ?? record.fileName ?? existing.fileName ?? '').slice(0, 200),
            parseNote: '',
            ...(zoteroLink !== undefined ? { zotero: zoteroLink } : {}),
            updatedAt: nowIso(),
          })
          const retryJob = this.store.createJob(existing.id, 'retry zotero record: ' + title)
          this.queue.push(() => this.processMetadata(retryJob.id, existing.id, record, abstract, creators))
          this.drain()
          return { paperId: existing.id, duplicate: false, jobId: retryJob.id }
        }
        return { paperId: existing.id, duplicate: true, jobId: '' }
      }
    }
    const paperId = 'p_' + randomUUID().replace(/-/g, '').slice(0, 16)
    const stamp = nowIso()
    const provisional: StoredPaper = {
      id: paperId,
      title,
      authors: creators,
      year: typeof record.year === 'number' && Number.isFinite(record.year) ? record.year : null,
      venue: (record.venue ?? '').slice(0, 300),
      abstract,
      keywords: [],
      categories: [],
      summary: '',
      contributions: [],
      method: '',
      fileName: (record.attachmentFileName ?? record.fileName ?? '').slice(0, 200),
      size: 0,
      status: 'processing',
      addedAt: stamp,
      updatedAt: stamp,
      hasFile: false,
      relations: [],
      sha256: '',
      pages: 0,
      textChars: abstract.replace(/\s/g, '').length,
      llmModel: '',
      llmMs: 0,
      tags: normalizeUserTags(record.tags),
      starred: false,
      ...(zoteroLink !== undefined ? { zotero: zoteroLink } : {}),
    }
    await this.store.putPaper(provisional)
    const job = this.store.createJob(paperId, 'zotero record: ' + title)
    this.queue.push(() => this.processMetadata(job.id, paperId, record, abstract, creators))
    this.drain()
    return { paperId, duplicate: false, jobId: job.id }
  }

  /**
   * Requeue every paper that previously failed (e.g. because the LLM route had no
   * credential) and let the caller show progress. PDF-backed records re-read their
   * stored source; record-only imports are re-analysed from their metadata.
   */
  async retryFailedPapers(): Promise<RetryFailedResult> {
    const papers = await this.store.listPapers()
    const failed = papers.filter((paper) => paper.status === 'failed')
    const retried: Array<{ paperId: string; jobId: string }> = []
    const skipped: string[] = []
    for (const paper of failed) {
      const stamp = nowIso()
      if (paper.sha256 !== '' && (await this.store.hasSource(paper.sha256))) {
        await this.store.updatePaper(paper.id, {
          status: 'processing',
          parseNote: '',
          llmModel: '',
          llmMs: 0,
          pages: 0,
          textChars: 0,
          updatedAt: stamp,
        })
        const job = this.store.createJob(paper.id, 'retry failed: ' + (paper.fileName || paper.title))
        this.enqueue(job.id, paper.id, paper.sha256, paper.fileName || paper.title + '.pdf', null)
        retried.push({ paperId: paper.id, jobId: job.id })
        continue
      }
      if (paper.abstract.trim() !== '' || paper.title.trim() !== '') {
        const record: ZoteroMetadataInput = {
          title: paper.title,
          authors: paper.authors,
          year: paper.year === null ? undefined : paper.year,
          venue: paper.venue,
          abstract: paper.abstract,
          tags: paper.tags,
          collections: [],
          fileName: paper.fileName,
        }
        await this.store.updatePaper(paper.id, { status: 'processing', parseNote: '', updatedAt: stamp })
        const job = this.store.createJob(paper.id, 'retry failed record: ' + paper.title)
        this.queue.push(() => this.processMetadata(job.id, paper.id, record, paper.abstract, paper.authors))
        this.drain()
        retried.push({ paperId: paper.id, jobId: job.id })
        continue
      }
      skipped.push(paper.id)
    }
    return { ok: true, retried, skipped }
  }

  // -- journal metrics -------------------------------------------------------

  /**
   * Queue a best-effort easyScholar lookup for a paper that just became ready.
   * Deliberately not awaited: metrics must never block job completion.
   */
  private scheduleMetrics(paperId: string, venue: string, force = false): void {
    const clean = venue.trim()
    if (clean === '') return
    void this.fetchMetricsFor(paperId, clean, force)
  }

  private async fetchMetricsFor(paperId: string, venue: string, force = false): Promise<void> {
    try {
      const settings = await this.store.getSettings()
      if (!metricsEnabledFor(this.config, settings)) return
      const secretKey = metricsSecretKeyFor(this.config, settings)
      const metrics = await fetchJournalMetrics(venue, secretKey, force ? { force: true } : {})
      // A successful lookup retires an earlier '| metrics: <reason>' failure note.
      const paper = await this.store.getPaper(paperId)
      const patch: { metrics: typeof metrics; parseNote?: string } = { metrics }
      if (paper !== null && paper.parseNote !== undefined) {
        const cleaned = stripMetricsNote(paper.parseNote)
        if (cleaned !== paper.parseNote) patch.parseNote = cleaned
      }
      await this.store.updatePaper(paperId, patch)
    } catch (error) {
      await this.noteMetricsFailure(paperId, errorMessage(error))
    }
  }

  /** Appends ' | metrics: <reason>' to parseNote so the UI can explain a gap. */
  private async noteMetricsFailure(paperId: string, reason: string): Promise<void> {
    try {
      const paper = await this.store.getPaper(paperId)
      if (paper === null) return
      const suffix = ' | metrics: ' + reason.replace(/\s+/g, ' ').trim().slice(0, 200)
      const parseNote = (stripMetricsNote(paper.parseNote ?? '') + suffix).slice(0, 2000)
      await this.store.updatePaper(paperId, { parseNote })
    } catch (error) {
      console.warn('[litgraph] failed to record metrics failure', error)
    }
  }

  /**
   * Queue metric lookups for ready papers with a venue but no metrics yet.
   * Returns immediately; the lookups themselves complete in the background.
   */
  async refreshMetrics(ids?: string[], force = false): Promise<{ ok: true; queued: number; skipped: number }> {
    const settings = await this.store.getSettings()
    const enabled = metricsEnabledFor(this.config, settings)
    const papers = await this.store.listPapers()
    // force = explicit "re-query" from the UI: refetch even when metrics exist.
    const eligible = (paper: StoredPaper): boolean =>
      paper.status === 'ready' &&
      paper.venue.trim() !== '' &&
      (force || paper.metrics === undefined)
    const targets: StoredPaper[] = []
    let skipped = 0
    if (ids !== undefined && ids.length > 0) {
      const byId = new Map(papers.map((paper) => [paper.id, paper]))
      const seen = new Set<string>()
      for (const raw of ids) {
        const id = typeof raw === 'string' ? raw.trim() : ''
        if (id === '' || seen.has(id)) {
          skipped += 1
          continue
        }
        seen.add(id)
        const paper = byId.get(id)
        if (paper === undefined) {
          skipped += 1
          continue
        }
        targets.push(paper)
      }
    } else {
      for (const paper of papers) {
        if (eligible(paper)) targets.push(paper)
        else skipped += 1
      }
    }
    let queued = 0
    for (const paper of targets) {
      if (!enabled || !eligible(paper)) {
        skipped += 1
        continue
      }
      this.scheduleMetrics(paper.id, paper.venue, force)
      queued += 1
    }
    return { ok: true, queued, skipped }
  }

  /** Background: classify a metadata-only (Zotero) paper with the LLM. */
  private async processMetadata(
    jobId: string,
    paperId: string,
    record: ZoteroMetadataInput,
    abstract: string,
    creators: string[],
  ): Promise<void> {
    const job = (patch: Parameters<LibraryStore['updateJob']>[1]): void => {
      this.store.updateJob(jobId, patch)
    }
    try {
      job({ state: 'extracting', progress: 0.3, message: 'LLM: classifying Zotero record' })
      const all = await this.store.listPapers()
      const existingPapers = all
        .filter((paper) => paper.id !== paperId && paper.status === 'ready' && paper.title.trim() !== '')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 40)
        .map((paper) => ({ id: paper.id, title: paper.title }))
      const existingCategories = await this.store.taxonomyPaths(120)
      const settings = await this.store.getSettings()
      const lines = [
        'Title: ' + ((record.title ?? '').trim() || 'Untitled'),
        creators.length > 0 ? 'Authors: ' + creators.join(', ') : '',
        typeof record.year === 'number' ? 'Year: ' + record.year : '',
        record.venue ? 'Venue: ' + record.venue : '',
        record.doi ? 'DOI: ' + record.doi : '',
        abstract !== '' ? 'Abstract: ' + abstract : '',
        record.tags !== undefined && record.tags.length > 0 ? 'Tags: ' + record.tags.join(', ') : '',
        record.collections !== undefined && record.collections.length > 0 ? 'Collections: ' + record.collections.join(' / ') : '',
      ].filter((line) => line !== '')
      const sliced = truncateText(lines.join('\n'), this.config.maxTextChars)
      const analyzeInput: AnalyzeInput & { taxonomyMode?: 'free' | 'fixed' } = {
        fileName: (record.fileName ?? record.title ?? 'zotero-record') + '.pdf',
        text: sliced.text,
        truncated: sliced.truncated,
        existingCategories,
        existingPapers,
      }
      analyzeInput.taxonomyMode = settings.taxonomyMode
      const result: AnalyzeResult = await this.analyzer.analyze(analyzeInput)
      const payload: ParsedPayload = result.payload
      const relations = this.relationList(payload.relations, all, paperId)
      job({ state: 'graphing', progress: 0.85, message: 'updating taxonomy and graph' })
      await this.store.updatePaper(paperId, {
        title: ((record.title ?? '').trim() || payload.title).slice(0, MAX_TITLE_CHARS),
        authors: creators.length > 0 ? creators : payload.authors,
        year: typeof record.year === 'number' ? record.year : payload.year,
        venue: record.venue !== undefined && record.venue !== '' ? record.venue : payload.venue,
        abstract: abstract !== '' ? abstract : payload.abstract,
        summary: payload.summary,
        contributions: payload.contributions,
        method: payload.method,
        keywords: payload.keywords,
        categories: payload.categories,
        relations,
        status: 'ready',
        llmModel: result.model,
        llmMs: result.ms,
        parseNote: 'zotero metadata-only import' + (record.itemType ? ' (' + record.itemType + ')' : ''),
        hasFile: false,
      })
      await this.store.updateTaxonomy(payload.categories)
      this.invalidateGraph()
      this.scheduleMetrics(paperId, record.venue !== undefined && record.venue !== '' ? record.venue : payload.venue)
      job({ state: 'done', progress: 1, message: 'ready: ' + (record.title ?? payload.title) })
    } catch (error) {
      const code = errorCode(error)
      const message = errorMessage(error)
      console.warn('[litgraph] zotero record failed paper=' + paperId + ' code=' + code + ': ' + message)
      await this.store
        .updatePaper(paperId, { status: 'failed', parseNote: code + ': ' + message })
        .catch((updateError) => {
          console.warn('[litgraph] failed to flag paper as failed', updateError)
        })
      job({ state: 'failed', progress: 1, message: code + ': ' + message })
      this.invalidateGraph()
    }
  }

  /** Resolve LLM relation hints against the library (title match, max 5, deduped). */
  private relationList(hints: RelationHint[], all: StoredPaper[], paperId: string): PaperRelation[] {
    const byTitle = new Map<string, StoredPaper>()
    for (const paper of all) {
      const key = titleKey(paper.title)
      if (key !== '' && !byTitle.has(key)) byTitle.set(key, paper)
    }
    const relations: PaperRelation[] = []
    for (const hint of hints) {
      if (relations.length >= 5) break
      const target = byTitle.get(titleKey(hint.title))
      if (target === undefined || target.id === paperId) continue
      if (relations.some((relation) => relation.paperId === target.id)) continue
      relations.push({ paperId: target.id, title: target.title, relation: hint.relation })
    }
    return relations
  }

  private enqueue(jobId: string, paperId: string, sha256: string, fileName: string, tmpPath: string | null): void {
    this.queue.push(() => this.process(jobId, paperId, sha256, fileName, tmpPath))
    this.drain()
  }

  private drain(): void {
    while (this.active < Math.max(1, this.config.concurrency) && this.queue.length > 0) {
      const task = this.queue.shift()
      if (task === undefined) break
      this.active += 1
      void task().finally(() => {
        this.active -= 1
        this.drain()
      })
    }
  }

  /**
   * Picks an OCR engine for a PDF without a text layer. The per-library setting wins
   * over the host config/env. 'model' (the default via 'auto') lets the image-capable
   * model transcribe the scan; 'auto' falls back to the free Windows recogniser when
   * the model route is unavailable or produced nothing; 'windows' forces local only.
   * Never throws: a dead engine reads back as engine 'none' with a note for the job log.
   */
  private async runOcr(readBytes: () => Promise<Uint8Array>): Promise<OcrOutcome> {
    const settings = await this.store.getSettings()
    const mode = settings.ocrEngine ?? this.config.ocrEngine
    if (mode === 'windows') return this.runLocalOcr(readBytes)
    // 'model' and 'auto' both try the model first; 'auto' additionally falls back to
    // the free local recogniser when the model route is unavailable or yields nothing.
    const vision = await this.runVisionOcr(readBytes, '')
    if (vision !== null && vision.engine !== 'none' && vision.text.trim() !== '') return vision
    if (mode === 'model') {
      return vision ?? { text: '', pages: 0, ocrPages: 0, engine: 'none', language: '', ms: 0, note: 'model OCR unavailable in this host' }
    }
    const local = await this.runLocalOcr(readBytes)
    if (local.engine !== 'none' && local.text.trim() !== '') {
      const visionNote = vision?.note ?? 'model OCR unavailable'
      return { ...local, note: 'model OCR gave nothing (' + visionNote.slice(0, 200) + '); ' + (local.note ?? '') }
    }
    return local.engine !== 'none' ? local : (vision ?? local)
  }

  private async runLocalOcr(readBytes: () => Promise<Uint8Array>): Promise<OcrOutcome> {
    let local: OcrOutcome | null = null
    try {
      local = (await ocrPdfBuffer(await readBytes(), { maxPages: MAX_OCR_PAGES })) as OcrOutcome
    } catch (error) {
      console.warn('[litgraph] local OCR threw: ' + errorMessage(error))
    }
    const localText = (local?.text ?? '').trim()
    if (local !== null && local.engine !== 'none' && localText !== '') return local
    return local ?? { text: '', pages: 0, ocrPages: 0, engine: 'none', language: '', ms: 0, note: 'local OCR failed' }
  }

  private async runVisionOcr(readBytes: () => Promise<Uint8Array>, previousNote: string): Promise<OcrOutcome | null> {
    if (this.vision === null) return null
    try {
      const result = await ocrPdfWithVision(await readBytes(), this.vision, { maxPages: MAX_VISION_PAGES })
      const note = [
        previousNote !== '' ? 'local OCR gave nothing (' + previousNote.slice(0, 160) + ')' : '',
        result.note ?? '',
      ]
        .filter((part) => part !== '')
        .join('; ')
      return {
        text: result.text,
        pages: result.pages,
        ocrPages: result.ocrPages,
        engine: result.engine,
        language: result.language,
        ms: result.ms,
        note,
      }
    } catch (error) {
      console.warn('[litgraph] model OCR threw: ' + errorMessage(error))
      return null
    }
  }

  private async process(
    jobId: string,
    paperId: string,
    sha256: string,
    fileName: string,
    tmpPath: string | null,
  ): Promise<void> {
    const job = (patch: Parameters<LibraryStore['updateJob']>[1]): void => {
      this.store.updateJob(jobId, patch)
    }
    try {
      job({ state: 'parsing', progress: 0.08, message: 'extracting text from PDF' })
      const buffer = tmpPath !== null ? await readFile(tmpPath) : await this.store.readSource(sha256)
      const extraction = await extractPdf(buffer, this.config)
      let text = extraction.text
      let textChars = extraction.nonSpaceChars
      let parseNote = extraction.note
      await this.store.updatePaper(paperId, { pages: extraction.pages, textChars, parseNote })
      let ocrFailure = ''
      if (extraction.needsOcr || extraction.nonSpaceChars < MIN_TEXT_CHARS) {
        job({
          state: 'parsing',
          progress: 0.14,
          message:
            this.config.ocrEngine === 'model'
              ? 'no text layer; asking the model to read the first pages'
              : 'no text layer; running local OCR on the first pages',
        })
        try {
          // pdf.js detaches (transfers) the ArrayBuffer it was given, so the buffer used
          // for extractPdf() is unusable by the time OCR runs - and the local engine and
          // the model fallback each need a fresh copy. Re-read the source bytes per attempt.
          const readOcrBytes = async (): Promise<Uint8Array> =>
            tmpPath !== null ? await readFile(tmpPath) : await this.store.readSource(sha256)
          const ocr = await this.runOcr(readOcrBytes)
          const ocrText = (ocr.text ?? '').trim()
          if (ocr.engine !== 'none' && ocrText !== '') {
            text = ocrText
            textChars = ocrText.replace(/\s/g, '').length
            const ocrNote = 'OCR: ' + ocr.engine + ' ' + ocr.ocrPages + '/' + ocr.pages + ' pages ' + ocr.ms + 'ms' + (ocr.language ? ' (' + ocr.language + ')' : '')
            parseNote = (extraction.note !== '' ? extraction.note + ' | ' : '') + ocrNote
            await this.store.updatePaper(paperId, { textChars, parseNote })
          } else {
            ocrFailure = ocr.note ?? 'engine=' + ocr.engine
            console.warn('[litgraph] OCR gave no text paper=' + paperId + ': ' + ocrFailure)
          }
        } catch (error) {
          ocrFailure = errorMessage(error)
          console.warn('[litgraph] OCR failed paper=' + paperId + ': ' + ocrFailure)
        }
      }
      if (textChars < MIN_TEXT_CHARS) {
        if (extraction.needsOcr) {
          if (ocrFailure !== '') parseNote = parseNote + ' | OCR failed: ' + ocrFailure.slice(0, 500)
          await this.store.updatePaper(paperId, { status: 'needs_ocr', parseNote })
          this.invalidateGraph()
          job({
            state: 'done',
            progress: 1,
            message: 'scanned PDF stored; local OCR produced no usable text' + (ocrFailure !== '' ? ': ' + ocrFailure.slice(0, 300) : ''),
          })
          return
        }
        throw new PipelineError('NO_TEXT', 'PDF has no usable text: only ' + textChars + ' non-space characters extracted')
      }
      if (this.config.saveText) {
        const capped = text.length > 2_000_000 ? text.slice(0, 2_000_000) : text
        await this.store.savePaperText(paperId, capped)
      }
      job({ state: 'extracting', progress: 0.3, message: 'LLM: extracting structured metadata' })
      const all = await this.store.listPapers()
      const existingPapers = all
        .filter((paper) => paper.id !== paperId && paper.status === 'ready' && paper.title.trim() !== '')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 40)
        .map((paper) => ({ id: paper.id, title: paper.title }))
      const existingCategories = await this.store.taxonomyPaths(120)
      const settings = await this.store.getSettings()
      const sliced = truncateText(text, this.config.maxTextChars)
      const analyzeInput: AnalyzeInput & { taxonomyMode?: 'free' | 'fixed' } = {
        fileName,
        text: sliced.text,
        truncated: sliced.truncated,
        existingCategories,
        existingPapers,
      }
      analyzeInput.taxonomyMode = settings.taxonomyMode
      const result: AnalyzeResult = await this.analyzer.analyze(analyzeInput)
      const payload: ParsedPayload = result.payload
      const relations = this.relationList(payload.relations, all, paperId)
      job({ state: 'graphing', progress: 0.85, message: 'updating taxonomy and graph' })
      await this.store.updatePaper(paperId, {
        title: payload.title,
        authors: payload.authors,
        year: payload.year,
        venue: payload.venue,
        abstract: payload.abstract,
        summary: payload.summary,
        contributions: payload.contributions,
        method: payload.method,
        keywords: payload.keywords,
        categories: payload.categories,
        relations,
        status: 'ready',
        llmModel: result.model,
        llmMs: result.ms,
        parseNote,
        hasFile: await this.store.hasSource(sha256),
      })
      await this.store.updateTaxonomy(payload.categories)
      this.invalidateGraph()
      this.scheduleMetrics(paperId, payload.venue)
      job({ state: 'done', progress: 1, message: 'ready: ' + payload.title })
    } catch (error) {
      const code = errorCode(error)
      const message = errorMessage(error)
      console.warn('[litgraph] import failed paper=' + paperId + ' code=' + code + ': ' + message)
      await this.store
        .updatePaper(paperId, { status: 'failed', parseNote: code + ': ' + message })
        .catch((updateError) => {
          console.warn('[litgraph] failed to flag paper as failed', updateError)
        })
      if (error instanceof LlmAnalyzeError && error.code === 'MISSING_CREDENTIAL') {
        job({ state: 'failed', progress: 1, message: 'LLM credential missing (' + code + '): ' + message })
      } else if (error instanceof PdfError) {
        job({ state: 'failed', progress: 1, message: code + ': ' + message })
      } else {
        job({ state: 'failed', progress: 1, message: code + ': ' + message })
      }
      this.invalidateGraph()
    } finally {
      if (tmpPath !== null) await unlink(tmpPath).catch(() => undefined)
    }
  }
}

export { categoryTop }
