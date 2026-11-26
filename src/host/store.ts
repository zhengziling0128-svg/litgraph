/**
 * On-disk library store.
 *
 * Layout under config.dataRoot (default <DSH_HOME>/litgraph):
 *
 *   library.json              single JSON index: { version, updatedAt, taxonomy, papers[] }
 *   papers/<id>/meta.json     canonical per-paper copy (survives index rebuilds)
 *   papers/<id>/fulltext.txt  extracted text (enables local full-text search later)
 *   sources/<sha256>.pdf      content-addressed original PDF (dedupe, keepSourcePdf)
 *   tmp/                      in-flight uploads streamed to disk before adoption
 *
 * Writes are serialized through mutate(): one in-process queue + an mtime drift check
 * that reloads the index when another process wrote it. Each write is atomic
 * (temp file + fsync + rename). This is deliberate: the spike showed the bundled
 * dsh-storage-json backend is single-process and has no cross-process lock either,
 * and using it would require importing an official package that is not resolvable
 * from a profile-installed plugin.
 */
import { mkdir, readFile, rename, rm, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  ImportJob,
  LitgraphConfig,
  StoredPaper,
  Taxonomy,
  TaxonomyEntry,
} from './types.js'
import { atomicWriteFile, nowIso, readJsonFile, sha256Hex } from './util.js'

interface LibraryFile {
  version: number
  updatedAt: string
  taxonomy: Taxonomy
  papers: StoredPaper[]
  settings?: LibrarySettings
}

export type TaxonomyMode = 'free' | 'fixed'

export type InsightScope = 'cluster' | 'group' | 'all'

export type OcrEngine = 'auto' | 'windows' | 'model'

export interface LibrarySettings {
  /** 'free' = the model may grow new categories (v1 behaviour); 'fixed' = pick from the built-in tree. */
  taxonomyMode: TaxonomyMode
  /** Scanned-page reader. Undefined means "use the host config / env default". */
  ocrEngine?: OcrEngine
  /** Graph cluster granularity: 1 coarse, 2 balanced (default), 3 fine. */
  clusterLevel?: 1 | 2 | 3
  /** easyScholar secret key override; empty/undefined falls back to the host config. */
  metricsSecretKey?: string
  /** Background journal-metric lookups (default true). */
  metricsEnabled?: boolean
  /** Local Zotero API key (obtained via /api/local/authorize); empty means "not authorized yet". */
  zoteroApiKey?: string
  /** 洞察默认作用域: current cluster / whole discipline / all papers. */
  insightScope?: InsightScope
  /** "近期"窗口（年）用于趋势判定，默认 3。 */
  insightRecentYears?: number
  /** 灵感卡是否可一键存进证据论文的笔记。 */
  insightSaveNotes?: boolean
  /** 打开洞察时是否后台补齐其它聚类的缓存（默认 false，只生成当前聚类）。 */
  insightPrecompute?: boolean
}

const DEFAULT_SETTINGS: LibrarySettings = {
  taxonomyMode: 'free',
  clusterLevel: 2,
  metricsEnabled: true,
  insightScope: 'cluster',
  insightRecentYears: 3,
  insightSaveNotes: true,
  insightPrecompute: false,
}

export interface TaxonomyUpdate {
  created: string[]
  promoted: string[]
  counts: Record<string, number>
}

const LIBRARY_VERSION = 1

function emptyTaxonomy(): Taxonomy {
  return { version: 1, updatedAt: new Date(0).toISOString(), categories: [] }
}

function normalizeCategoryPath(raw: string): string {
  return raw
    .split('>')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 4)
    .join(' > ')
}

export class LibraryStore {
  readonly root: string
  readonly papersDir: string
  readonly sourcesDir: string
  readonly tmpDir: string
  readonly libraryPath: string
  private papers = new Map<string, StoredPaper>()
  private jobs = new Map<string, ImportJob>()
  private taxonomy: Taxonomy = emptyTaxonomy()
  private settings: LibrarySettings = { ...DEFAULT_SETTINGS }
  private ready: Promise<void> | null = null
  private loadedMtimeMs = 0
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(readonly config: LitgraphConfig) {
    this.root = config.dataRoot
    this.papersDir = join(this.root, 'papers')
    this.sourcesDir = join(this.root, 'sources')
    this.tmpDir = join(this.root, 'tmp')
    this.libraryPath = join(this.root, 'library.json')
  }

  ensure(): Promise<void> {
    this.ready ??= this.initOnce()
    return this.ready
  }

  private async initOnce(): Promise<void> {
    await mkdir(this.papersDir, { recursive: true })
    await mkdir(this.sourcesDir, { recursive: true })
    await mkdir(this.tmpDir, { recursive: true })
    await this.reloadLibrary()
  }

  private async mtimeOf(file: string): Promise<number> {
    try {
      return (await stat(file)).mtimeMs
    } catch {
      return 0
    }
  }

  private async reloadLibrary(): Promise<void> {
    let data: LibraryFile | null = null
    try {
      data = await readJsonFile<LibraryFile>(this.libraryPath)
    } catch (error) {
      console.warn('[litgraph] library.json is corrupt, starting from an empty index:', error)
    }
    this.papers = new Map<string, StoredPaper>()
    this.taxonomy = emptyTaxonomy()
    this.settings = { ...DEFAULT_SETTINGS }
    if (data !== null && typeof data === 'object') {
      const rawSettings = (data as { settings?: unknown }).settings
      if (rawSettings !== null && typeof rawSettings === 'object') {
        const raw = rawSettings as {
          taxonomyMode?: unknown
          ocrEngine?: unknown
          clusterLevel?: unknown
          metricsSecretKey?: unknown
          metricsEnabled?: unknown
          zoteroApiKey?: unknown
          insightScope?: unknown
          insightRecentYears?: unknown
          insightSaveNotes?: unknown
          insightPrecompute?: unknown
        }
        if (raw.taxonomyMode === 'free' || raw.taxonomyMode === 'fixed') {
          this.settings = { ...this.settings, taxonomyMode: raw.taxonomyMode }
        }
        if (raw.ocrEngine === 'auto' || raw.ocrEngine === 'windows' || raw.ocrEngine === 'model') {
          this.settings = { ...this.settings, ocrEngine: raw.ocrEngine }
        }
        if (raw.clusterLevel === 1 || raw.clusterLevel === 2 || raw.clusterLevel === 3) {
          this.settings = { ...this.settings, clusterLevel: raw.clusterLevel }
        }
        if (typeof raw.metricsSecretKey === 'string' && raw.metricsSecretKey.trim() !== '') {
          this.settings = { ...this.settings, metricsSecretKey: raw.metricsSecretKey.trim().slice(0, 200) }
        }
        if (typeof raw.metricsEnabled === 'boolean') {
          this.settings = { ...this.settings, metricsEnabled: raw.metricsEnabled }
        }
        if (typeof raw.zoteroApiKey === 'string' && raw.zoteroApiKey.trim() !== '') {
          this.settings = { ...this.settings, zoteroApiKey: raw.zoteroApiKey.trim().slice(0, 200) }
        }
        if (raw.insightScope === 'cluster' || raw.insightScope === 'group' || raw.insightScope === 'all') {
          this.settings = { ...this.settings, insightScope: raw.insightScope }
        }
        if (typeof raw.insightRecentYears === 'number' && raw.insightRecentYears >= 1 && raw.insightRecentYears <= 30) {
          this.settings = { ...this.settings, insightRecentYears: Math.round(raw.insightRecentYears) }
        }
        if (typeof raw.insightSaveNotes === 'boolean') {
          this.settings = { ...this.settings, insightSaveNotes: raw.insightSaveNotes }
        }
        if (typeof raw.insightPrecompute === 'boolean') {
          this.settings = { ...this.settings, insightPrecompute: raw.insightPrecompute }
        }
      }
      if (Array.isArray(data.papers)) {
        for (const paper of data.papers) {
          if (paper !== null && typeof paper === 'object' && typeof paper.id === 'string') {
            this.papers.set(paper.id, paper)
          }
        }
      }
      if (data.taxonomy !== null && typeof data.taxonomy === 'object' && Array.isArray(data.taxonomy.categories)) {
        this.taxonomy = data.taxonomy
      }
    }
    // A paper left in 'processing' means the host died mid-pipeline; surface it.
    for (const paper of this.papers.values()) {
      if (paper.status === 'processing') {
        paper.status = 'failed'
        paper.parseNote = 'interrupted: host restarted while this paper was being processed'
        paper.updatedAt = nowIso()
      }
    }
    this.loadedMtimeMs = await this.mtimeOf(this.libraryPath)
  }

  /** Reload when another process (or a previous run) touched the index behind us. */
  private async detectExternalChange(): Promise<void> {
    if (this.loadedMtimeMs === 0) return
    const current = await this.mtimeOf(this.libraryPath)
    if (current > this.loadedMtimeMs) await this.reloadLibrary()
  }

  private async saveLibrary(): Promise<void> {
    const payload: LibraryFile = {
      version: LIBRARY_VERSION,
      updatedAt: nowIso(),
      taxonomy: this.taxonomy,
      papers: [...this.papers.values()],
      settings: this.settings,
    }
    await atomicWriteFile(this.libraryPath, JSON.stringify(payload))
    this.loadedMtimeMs = await this.mtimeOf(this.libraryPath)
  }

  /** Serialized read-modify-write transaction. */
  async mutate<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      await this.ensure()
      await this.detectExternalChange()
      const result = await fn()
      await this.saveLibrary()
      return result
    }
    const queued = this.writeChain.then(run, run)
    this.writeChain = queued.then(
      () => undefined,
      () => undefined,
    )
    return queued
  }

  private async refresh(): Promise<void> {
    await this.ensure()
    await this.detectExternalChange()
  }

  // -- papers ---------------------------------------------------------------

  async listPapers(): Promise<StoredPaper[]> {
    await this.refresh()
    return [...this.papers.values()]
  }

  async getPaper(id: string): Promise<StoredPaper | null> {
    await this.refresh()
    return this.papers.get(id) ?? null
  }

  async findBySha(sha256: string): Promise<StoredPaper | null> {
    await this.refresh()
    for (const paper of this.papers.values()) {
      if (paper.sha256 === sha256) return paper
    }
    return null
  }

  async putPaper(paper: StoredPaper): Promise<StoredPaper> {
    return this.mutate(async () => {
      const normalized: StoredPaper = { ...paper, updatedAt: nowIso() }
      this.papers.set(normalized.id, normalized)
      await this.writePaperMeta(normalized)
      return normalized
    })
  }

  async updatePaper(id: string, patch: Partial<StoredPaper>): Promise<StoredPaper | null> {
    return this.mutate(async () => {
      const current = this.papers.get(id)
      if (current === undefined) return null
      const next: StoredPaper = { ...current, ...patch, id, updatedAt: nowIso() }
      this.papers.set(id, next)
      await this.writePaperMeta(next)
      return next
    })
  }

  async removePaper(id: string): Promise<StoredPaper | null> {
    const removed = await this.mutate(() => {
      const current = this.papers.get(id) ?? null
      this.papers.delete(id)
      return current
    })
    if (removed === null) return null
    try {
      await rm(join(this.papersDir, id), { recursive: true, force: true })
    } catch (error) {
      console.warn('[litgraph] failed to remove paper dir for', id, error)
    }
    if (this.config.keepSourcePdf) await this.deleteSourceIfUnreferenced(removed.sha256)
    return removed
  }

  async countByStatus(): Promise<Record<string, number>> {
    await this.refresh()
    const counts: Record<string, number> = {}
    for (const paper of this.papers.values()) counts[paper.status] = (counts[paper.status] ?? 0) + 1
    return counts
  }

  private async writePaperMeta(paper: StoredPaper): Promise<void> {
    const dir = join(this.papersDir, paper.id)
    await mkdir(dir, { recursive: true })
    await atomicWriteFile(join(dir, 'meta.json'), JSON.stringify(paper, null, 2))
  }

  // -- extracted text -------------------------------------------------------

  async savePaperText(id: string, text: string): Promise<void> {
    const dir = join(this.papersDir, id)
    await mkdir(dir, { recursive: true })
    await atomicWriteFile(join(dir, 'fulltext.txt'), text)
  }

  async readPaperText(id: string): Promise<string | null> {
    try {
      return await readFile(join(this.papersDir, id, 'fulltext.txt'), 'utf8')
    } catch {
      return null
    }
  }

  // -- original PDFs --------------------------------------------------------

  newTmpPath(prefix = 'upload'): string {
    return join(this.tmpDir, prefix + '-' + randomUUID() + '.part')
  }

  sourcePath(sha256: string): string {
    return join(this.sourcesDir, sha256 + '.pdf')
  }

  async hasSource(sha256: string): Promise<boolean> {
    try {
      await stat(this.sourcePath(sha256))
      return true
    } catch {
      return false
    }
  }

  /** Move a fully streamed temp file into the content-addressed source store. */
  async adoptSource(tmpPath: string, sha256: string): Promise<{ path: string; adopted: boolean }> {
    await mkdir(this.sourcesDir, { recursive: true })
    const target = this.sourcePath(sha256)
    if (await this.hasSource(sha256)) {
      try {
        await unlink(tmpPath)
      } catch {
        // best effort
      }
      return { path: target, adopted: false }
    }
    try {
      await rename(tmpPath, target)
    } catch (error) {
      // last resort: copy through the caller-provided path (caller already validated size)
      try {
        const bytes = await readFile(tmpPath)
        await atomicWriteFile(target, bytes)
        await unlink(tmpPath)
      } catch {
        throw error
      }
    }
    return { path: target, adopted: true }
  }

  async readSource(sha256: string): Promise<Buffer> {
    return readFile(this.sourcePath(sha256))
  }

  async deleteSourceIfUnreferenced(sha256: string): Promise<void> {
    await this.ensure()
    for (const paper of this.papers.values()) {
      if (paper.sha256 === sha256) return
    }
    try {
      await unlink(this.sourcePath(sha256))
    } catch {
      // already gone
    }
  }

  async cleanupTmp(): Promise<void> {
    try {
      const { readdir } = await import('node:fs/promises')
      const entries = await readdir(this.tmpDir)
      const now = Date.now()
      for (const entry of entries) {
        const file = join(this.tmpDir, entry)
        try {
          const info = await stat(file)
          if (now - info.mtimeMs > 24 * 60 * 60 * 1000) await unlink(file)
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  // -- import jobs (in-memory; a restart clears them, papers keep their status) --

  createJob(paperId: string | null, message: string): ImportJob {
    const stamp = nowIso()
    const job: ImportJob = {
      id: randomUUID(),
      state: 'queued',
      progress: 0.02,
      message,
      paperId,
      createdAt: stamp,
      updatedAt: stamp,
    }
    this.jobs.set(job.id, job)
    // keep the map bounded even if a client never polls
    if (this.jobs.size > 500) {
      const oldest = [...this.jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
      if (oldest !== undefined) this.jobs.delete(oldest.id)
    }
    return job
  }

  updateJob(id: string, patch: Partial<Omit<ImportJob, 'id' | 'createdAt'>>): ImportJob | null {
    const job = this.jobs.get(id)
    if (job === undefined) return null
    Object.assign(job, patch, { updatedAt: nowIso() })
    return job
  }

  getJob(id: string): ImportJob | null {
    return this.jobs.get(id) ?? null
  }

  jobCount(): number {
    return this.jobs.size
  }

  // -- taxonomy -------------------------------------------------------------

  async getTaxonomy(): Promise<Taxonomy> {
    await this.refresh()
    return this.taxonomy
  }

  async taxonomyPaths(limit = 120): Promise<string[]> {
    await this.refresh()
    return this.taxonomy.categories
      .filter((entry) => entry.status === 'active' || entry.count > 0)
      .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
      .slice(0, limit)
      .map((entry) => entry.path)
  }

  // -- library settings -----------------------------------------------------

  async getSettings(): Promise<LibrarySettings> {
    await this.refresh()
    return { ...this.settings }
  }

  async updateSettings(patch: Partial<LibrarySettings>): Promise<LibrarySettings> {
    return this.mutate(() => {
      if (patch.taxonomyMode === 'free' || patch.taxonomyMode === 'fixed') {
        this.settings = { ...this.settings, taxonomyMode: patch.taxonomyMode }
      }
      if (patch.ocrEngine === 'auto' || patch.ocrEngine === 'windows' || patch.ocrEngine === 'model') {
        this.settings = { ...this.settings, ocrEngine: patch.ocrEngine }
      }
      if (patch.clusterLevel === 1 || patch.clusterLevel === 2 || patch.clusterLevel === 3) {
        this.settings = { ...this.settings, clusterLevel: patch.clusterLevel }
      }
      if (typeof patch.metricsSecretKey === 'string') {
        const trimmed = patch.metricsSecretKey.trim().slice(0, 200)
        this.settings = { ...this.settings, metricsSecretKey: trimmed === '' ? undefined : trimmed }
      }
      if (typeof patch.metricsEnabled === 'boolean') {
        this.settings = { ...this.settings, metricsEnabled: patch.metricsEnabled }
      }
      if (typeof patch.zoteroApiKey === 'string') {
        const trimmed = patch.zoteroApiKey.trim().slice(0, 200)
        this.settings = { ...this.settings, zoteroApiKey: trimmed === '' ? undefined : trimmed }
      }
      if (patch.insightScope === 'cluster' || patch.insightScope === 'group' || patch.insightScope === 'all') {
        this.settings = { ...this.settings, insightScope: patch.insightScope }
      }
      if (typeof patch.insightRecentYears === 'number' && patch.insightRecentYears >= 1 && patch.insightRecentYears <= 30) {
        this.settings = { ...this.settings, insightRecentYears: Math.round(patch.insightRecentYears) }
      }
      if (typeof patch.insightSaveNotes === 'boolean') {
        this.settings = { ...this.settings, insightSaveNotes: patch.insightSaveNotes }
      }
      if (typeof patch.insightPrecompute === 'boolean') {
        this.settings = { ...this.settings, insightPrecompute: patch.insightPrecompute }
      }
      return { ...this.settings }
    })
  }

  /**
   * Count category usage. A category proposed by the LLM starts as 'proposed' and is
   * promoted to 'active' the second time any paper uses it — this is the stability
   * mechanism against one-off hallucinated categories.
   */
  async updateTaxonomy(categories: string[]): Promise<TaxonomyUpdate> {
    return this.mutate(() => {
      const stamp = nowIso()
      const created: string[] = []
      const promoted: string[] = []
      const counts: Record<string, number> = {}
      const seen = new Set<string>()
      for (const raw of categories) {
        const path = normalizeCategoryPath(raw)
        if (!path || seen.has(path)) continue
        seen.add(path)
        const existing = this.taxonomy.categories.find((entry) => entry.path === path)
        if (existing === undefined) {
          const entry: TaxonomyEntry = { path, count: 1, status: 'proposed', firstSeen: stamp, lastSeen: stamp }
          this.taxonomy.categories.push(entry)
          created.push(path)
          counts[path] = 1
        } else {
          existing.count += 1
          existing.lastSeen = stamp
          if (existing.status === 'proposed' && existing.count >= 2) {
            existing.status = 'active'
            promoted.push(path)
          }
          counts[path] = existing.count
        }
      }
      this.taxonomy.updatedAt = stamp
      return { created, promoted, counts }
    })
  }
}

export function hashUpload(buffer: Uint8Array): string {
  return sha256Hex(buffer)
}
