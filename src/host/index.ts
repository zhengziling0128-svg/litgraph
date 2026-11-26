/**
 * dsh-litgraph host half: HTTP routes, storage, import pipeline.
 *
 * RPC contract (see _recon/host-plugin-api.md): the official webServer service,
 * exact routes, Node-style handlers. Every registration sits inside ctx.effect so
 * an HMR reload disposes the old registrations instead of throwing
 * "webserver: duplicate exact route".
 */
import { createReadStream, createWriteStream, promises as fsp } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, resolve as resolvePath } from 'node:path'
import { resolveConfig } from './config.js'
import { categoryTop, type GraphData } from './graph.js'
import { LlmAnalyzer } from './llm.js'
import { LlmTargetResolver, type DefaultSelectionReader } from './llm-target.js'
import { buildInsight, InsightError, type InsightScope } from './insights.js'
import { fetchJournalMetrics, metricsEnabledFor, metricsSecretKeyFor } from './metrics.js'
import { ocrPdfBuffer, probeOcr } from './ocr.js'
import { openPaper } from './open.js'
import { LitgraphPipeline, PipelineError } from './pipeline.js'
import { LibraryStore, type LibrarySettings } from './store.js'
import type { LitgraphConfig, LlmService, StoredPaper } from './types.js'
import { clampInt, errorMessage } from './util.js'
import { PLUGIN_BUILD, hostBundleHash } from './version.js'
import type { VisionAttachments } from './vision-ocr.js'
import { ZoteroScanError, importZoteroSelection, scanZoteroLibrary } from './zotero.js'
import {
  authorizeZotero,
  listZoteroCollections,
  setZoteroCollections,
  syncZoteroLinks,
  zoteroLocalStatus,
  ZoteroLocalError,
  type ZoteroCollection,
} from './zotero-local.js'

export const name = 'dsh-litgraph'
export const inject = ['webServer', 'llm', 'attachments']

interface ExactWebRoute {
  kind: 'exact'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => unknown
}

interface WebServerService {
  register(route: ExactWebRoute): () => void
}

interface WebContext {
  webServer: WebServerService
  llm?: LlmService | null
  get?: (name: string) => unknown
  effect?: (callback: () => void | (() => void), label?: string) => () => void
  logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void }
}

interface RouteContext {
  store: LibraryStore
  pipeline: LitgraphPipeline
  config: LitgraphConfig
}

type RouteHandler = (req: IncomingMessage, res: ServerResponse, context: RouteContext) => Promise<void>

interface RouteDefinition {
  path: string
  methods: string[]
  handler: RouteHandler
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

// -- low-level helpers -------------------------------------------------------

function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://127.0.0.1')
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value)
}

function respondJson(res: ServerResponse, status: number, value: unknown): void {
  if (!res.headersSent) {
    res.statusCode = status
    for (const [header, headerValue] of Object.entries(JSON_HEADERS)) res.setHeader(header, headerValue)
  }
  res.end(status === 204 ? undefined : jsonBody(value))
}

function headerValue(req: IncomingMessage, name: string): string | null {
  const raw = req.headers[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : null
}

function isAllowedOrigin(origin: string): boolean {
  if (origin === 'file://' || origin.startsWith('file://')) return true
  if (origin === 'null') return false
  try {
    const url = new URL(origin)
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]' || url.hostname === '::1'
    return loopback && (url.protocol === 'http:' || url.protocol === 'https:')
  } catch {
    return false
  }
}

/** webServer itself does not authenticate; fence cross-site browser requests here. */
function guard(req: IncomingMessage, res: ServerResponse, methods: string[]): boolean {
  const origin = headerValue(req, 'origin')
  if (origin !== null && origin !== '' && !isAllowedOrigin(origin)) {
    respondJson(res, 403, { error: 'forbidden origin' })
    return false
  }
  if (origin !== null && origin !== '') {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('vary', 'origin')
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('access-control-allow-methods', methods.join(', '))
    res.setHeader('access-control-allow-headers', 'content-type, x-litgraph-filename')
    res.setHeader('access-control-max-age', '600')
    res.end()
    return false
  }
  if (!methods.includes(req.method ?? 'GET')) {
    res.setHeader('allow', methods.join(', '))
    respondJson(res, 405, { error: 'method not allowed', method: req.method, allow: methods })
    return false
  }
  return true
}

async function readJsonBody(req: IncomingMessage, maxBytes = 256 * 1024): Promise<unknown> {
  return await new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk: Buffer | string) => {
      if (settled) return
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      size += bytes.length
      if (size > maxBytes) {
        fail(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(bytes)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim()
        resolve(text === '' ? {} : JSON.parse(text))
      } catch (error) {
        reject(new Error('invalid JSON body: ' + errorMessage(error)))
      }
    })
    req.on('error', (error) => fail(error))
  })
}

function readUploadName(req: IncomingMessage): string {
  const raw = headerValue(req, 'x-litgraph-filename') ?? 'paper.pdf'
  let decoded = raw.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // header was not URI-encoded; keep as-is
  }
  const flat = basename(decoded.replace(/\\/g, '/'))
  const cleaned = flat.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200)
  return cleaned === '' ? 'paper.pdf' : cleaned
}

async function streamToFile(req: IncomingMessage, tmpPath: string, maxBytes: number): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const out = createWriteStream(tmpPath)
    let size = 0
    let settled = false
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      out.destroy()
      try {
        req.destroy()
      } catch {
        // ignore
      }
      void fsp.unlink(tmpPath).catch(() => undefined)
      reject(error)
    }
    req.on('data', (chunk: Buffer | string) => {
      if (settled) return
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      size += bytes.length
      if (size > maxBytes) {
        fail(new PipelineError('TOO_LARGE', 'PDF is larger than the upload limit'))
        return
      }
      if (!out.write(bytes)) {
        req.pause()
        out.once('drain', () => req.resume())
      }
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      out.end(() => resolve(size))
    })
    req.on('error', (error) => fail(error))
    req.on('aborted', () => fail(new PipelineError('CLIENT_ABORTED', 'upload aborted by the client')))
    out.on('error', (error) => fail(error))
  })
}

// -- papers view helpers -----------------------------------------------------

function comparePapers(a: StoredPaper, b: StoredPaper, sort: string): number {
  if (sort === 'title') return a.title.localeCompare(b.title, 'zh-Hans-CN')
  if (sort === 'year') return (a.year ?? 0) - (b.year ?? 0)
  if (sort === 'addedAt') return a.addedAt.localeCompare(b.addedAt)
  return a.updatedAt.localeCompare(b.updatedAt)
}

function paperMatchesQuery(paper: StoredPaper, query: string): boolean {
  const needle = query.toLowerCase()
  const haystack = [paper.title, paper.summary, paper.abstract, paper.venue, paper.method, ...paper.authors, ...paper.keywords]
    .join('\n')
    .toLowerCase()
  return haystack.includes(needle)
}

function paperListItem(paper: StoredPaper, clusterId: string | undefined): Record<string, unknown> {
  return {
    id: paper.id,
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    venue: paper.venue,
    categories: paper.categories,
    status: paper.status,
    updatedAt: paper.updatedAt,
    addedAt: paper.addedAt,
    fileName: paper.fileName,
    size: paper.size,
    clusterId: clusterId ?? null,
    tags: paper.tags ?? [],
    starred: paper.starred === true,
    lastRead: paper.zotero?.lastRead ?? null,
    rating: paper.rating ?? 0,
    metrics:
      paper.metrics === undefined
        ? null
        : {
            impactFactor: paper.metrics.impactFactor,
            jcrQuartile: paper.metrics.jcrQuartile,
            casPartition: paper.metrics.casPartition,
            casTop: paper.metrics.casTop,
          },
  }
}

// -- route handlers ----------------------------------------------------------

const ROUTES: RouteDefinition[] = []

function route(path: string, methods: string[], handler: RouteHandler): void {
  ROUTES.push({ path, methods, handler })
}

route('/api/litgraph/status', ['GET', 'HEAD'], async (req, res, { pipeline, config }) => {
  const payload = await pipeline.status()
  respondJson(res, 200, {
    ...payload,
    build: PLUGIN_BUILD,
    hostHash: await hostBundleHash(),
    ocrEngine: config.ocrEngine,
  })
})

route('/api/litgraph/graph', ['GET', 'HEAD'], async (req, res, { pipeline }) => {
  const graph: GraphData = await pipeline.getGraph()
  respondJson(res, 200, graph)
})

route('/api/litgraph/papers', ['GET', 'HEAD'], async (req, res, { store, pipeline }) => {
  const url = requestUrl(req)
  const sortInput = url.searchParams.get('sort') ?? 'updatedAt'
  const sort = ['updatedAt', 'addedAt', 'title', 'year'].includes(sortInput) ? sortInput : 'updatedAt'
  const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc'
  const page = clampInt(url.searchParams.get('page'), 1, 1_000_000, 1)
  const pageSize = clampInt(url.searchParams.get('pageSize'), 1, 200, 50)
  const query = (url.searchParams.get('q') ?? '').trim()
  const cluster = (url.searchParams.get('cluster') ?? '').trim()
  const starredOnly = url.searchParams.get('starred') === '1' || url.searchParams.get('starred') === 'true'
  const tag = (url.searchParams.get('tag') ?? '').trim()
  const minRating = clampInt(url.searchParams.get('minRating'), 0, 5, 0)
  const graph = await pipeline.getGraph()
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  let papers = await store.listPapers()
  if (query !== '') papers = papers.filter((paper) => paperMatchesQuery(paper, query))
  if (cluster !== '') papers = papers.filter((paper) => nodeById.get(paper.id)?.clusterId === cluster)
  if (starredOnly) papers = papers.filter((paper) => paper.starred === true)
  if (tag !== '') {
    const needle = tag.toLowerCase()
    papers = papers.filter((paper) => (paper.tags ?? []).some((value) => value.toLowerCase() === needle))
  }
  if (minRating > 0) papers = papers.filter((paper) => (paper.rating ?? 0) >= minRating)
  papers.sort((a, b) => comparePapers(a, b, sort) * (order === 'asc' ? 1 : -1))
  const total = papers.length
  const start = (page - 1) * pageSize
  const items = papers.slice(start, start + pageSize).map((paper) => paperListItem(paper, nodeById.get(paper.id)?.clusterId))
  respondJson(res, 200, { items, total, page, pageSize, sort, order })
})

route('/api/litgraph/paper', ['GET', 'HEAD'], async (req, res, { store, pipeline }) => {
  const id = requestUrl(req).searchParams.get('id') ?? ''
  const paper = id === '' ? null : await store.getPaper(id)
  if (paper === null) {
    respondJson(res, 404, { error: 'paper not found', id })
    return
  }
  const graph = await pipeline.getGraph()
  const node = graph.nodes.find((candidate) => candidate.id === paper.id)
  respondJson(res, 200, {
    ...paper,
    clusterId: node?.clusterId ?? null,
    clusterLabel: node?.clusterLabel ?? categoryTop(paper),
    degree: node?.degree ?? 0,
  })
})

route('/api/litgraph/paper', ['DELETE'], async (req, res, { store, pipeline }) => {
  const id = requestUrl(req).searchParams.get('id') ?? ''
  const removed = id === '' ? null : await store.removePaper(id)
  if (removed === null) {
    respondJson(res, 404, { error: 'paper not found', id })
    return
  }
  pipeline.invalidateGraph()
  respondJson(res, 200, { ok: true, id })
})

route('/api/litgraph/paper', ['PATCH'], async (req, res, { store }) => {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    respondJson(res, 400, { error: errorMessage(error) })
    return
  }
  if (body === null || typeof body !== 'object') {
    respondJson(res, 400, { error: 'expected a JSON object body' })
    return
  }
  const input = body as { id?: unknown; notes?: unknown; tags?: unknown; starred?: unknown; rating?: unknown }
  const id = typeof input.id === 'string' ? input.id : ''
  if (id === '') {
    respondJson(res, 400, { error: 'id is required' })
    return
  }
  const patch: { notes?: string; tags?: string[]; starred?: boolean; rating?: number } = {}
  if (input.notes !== undefined) {
    if (typeof input.notes !== 'string') {
      respondJson(res, 400, { error: 'notes must be a string' })
      return
    }
    patch.notes = input.notes.slice(0, 20000)
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== 'string')) {
      respondJson(res, 400, { error: 'tags must be an array of strings' })
      return
    }
    const seen = new Set<string>()
    const tags: string[] = []
    for (const raw of input.tags as string[]) {
      const value = raw.trim().replace(/\s+/g, ' ').slice(0, 40)
      if (value === '') continue
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      tags.push(value)
      if (tags.length >= 24) break
    }
    patch.tags = tags
  }
  if (input.starred !== undefined) {
    if (typeof input.starred !== 'boolean') {
      respondJson(res, 400, { error: 'starred must be a boolean' })
      return
    }
    patch.starred = input.starred
  }
  if (input.rating !== undefined) {
    if (typeof input.rating !== 'number' || !Number.isInteger(input.rating) || input.rating < 0 || input.rating > 5) {
      respondJson(res, 400, { error: 'rating must be an integer between 0 and 5' })
      return
    }
    patch.rating = input.rating
  }
  if (Object.keys(patch).length === 0) {
    respondJson(res, 400, { error: 'nothing to update' })
    return
  }
  const updated = await store.updatePaper(id, patch)
  if (updated === null) {
    respondJson(res, 404, { error: 'paper not found', id })
    return
  }
  respondJson(res, 200, { ok: true, paper: updated })
})

route('/api/litgraph/settings', ['GET', 'HEAD', 'PUT'], async (req, res, { store }) => {
  if (req.method === 'PUT') {
    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch (error) {
      respondJson(res, 400, { error: errorMessage(error) })
      return
    }
    const input =
      body !== null && typeof body === 'object'
        ? (body as {
            taxonomyMode?: unknown
            ocrEngine?: unknown
            clusterLevel?: unknown
            metricsSecretKey?: unknown
            metricsEnabled?: unknown
            insightScope?: unknown
            insightRecentYears?: unknown
            insightSaveNotes?: unknown
            insightPrecompute?: unknown
          })
        : {}
    const patch: Partial<LibrarySettings> = {}
    if (input.taxonomyMode !== undefined) {
      if (input.taxonomyMode !== 'free' && input.taxonomyMode !== 'fixed') {
        respondJson(res, 400, { error: "taxonomyMode must be 'free' or 'fixed'" })
        return
      }
      patch.taxonomyMode = input.taxonomyMode
    }
    if (input.ocrEngine !== undefined) {
      if (input.ocrEngine !== 'auto' && input.ocrEngine !== 'windows' && input.ocrEngine !== 'model') {
        respondJson(res, 400, { error: "ocrEngine must be 'auto', 'windows' or 'model'" })
        return
      }
      patch.ocrEngine = input.ocrEngine
    }
    if (input.clusterLevel !== undefined) {
      if (input.clusterLevel !== 1 && input.clusterLevel !== 2 && input.clusterLevel !== 3) {
        respondJson(res, 400, { error: 'clusterLevel must be 1, 2 or 3' })
        return
      }
      patch.clusterLevel = input.clusterLevel
    }
    if (input.metricsSecretKey !== undefined) {
      if (typeof input.metricsSecretKey !== 'string') {
        respondJson(res, 400, { error: 'metricsSecretKey must be a string' })
        return
      }
      patch.metricsSecretKey = input.metricsSecretKey.trim().slice(0, 200)
    }
    if (input.metricsEnabled !== undefined) {
      if (typeof input.metricsEnabled !== 'boolean') {
        respondJson(res, 400, { error: 'metricsEnabled must be a boolean' })
        return
      }
      patch.metricsEnabled = input.metricsEnabled
    }
    if (input.insightScope !== undefined) {
      if (input.insightScope !== 'cluster' && input.insightScope !== 'group' && input.insightScope !== 'all') {
        respondJson(res, 400, { error: "insightScope must be 'cluster', 'group' or 'all'" })
        return
      }
      patch.insightScope = input.insightScope
    }
    if (input.insightRecentYears !== undefined) {
      if (
        typeof input.insightRecentYears !== 'number' ||
        !Number.isFinite(input.insightRecentYears) ||
        input.insightRecentYears < 1 ||
        input.insightRecentYears > 30
      ) {
        respondJson(res, 400, { error: 'insightRecentYears must be a number between 1 and 30' })
        return
      }
      patch.insightRecentYears = Math.round(input.insightRecentYears)
    }
    if (input.insightSaveNotes !== undefined) {
      if (typeof input.insightSaveNotes !== 'boolean') {
        respondJson(res, 400, { error: 'insightSaveNotes must be a boolean' })
        return
      }
      patch.insightSaveNotes = input.insightSaveNotes
    }
    if (input.insightPrecompute !== undefined) {
      if (typeof input.insightPrecompute !== 'boolean') {
        respondJson(res, 400, { error: 'insightPrecompute must be a boolean' })
        return
      }
      patch.insightPrecompute = input.insightPrecompute
    }
    if (Object.keys(patch).length === 0) {
      respondJson(res, 400, { error: 'nothing to update' })
      return
    }
    const settings = await store.updateSettings(patch)
    respondJson(res, 200, { ok: true, settings })
    return
  }
  const settings = await store.getSettings()
  respondJson(res, 200, { ok: true, settings })
})

route('/api/litgraph/insight', ['GET', 'HEAD'], async (req, res, { store, pipeline }) => {
  const url = requestUrl(req)
  const settings = await store.getSettings()
  const scopeParam = url.searchParams.get('scope')
  const scope: InsightScope =
    scopeParam === 'cluster' || scopeParam === 'group' || scopeParam === 'all'
      ? scopeParam
      : settings.insightScope ?? 'cluster'
  const clusterId = url.searchParams.get('cluster') ?? url.searchParams.get('clusterId')
  const yearsParam = Number(url.searchParams.get('recentYears'))
  const recentYears =
    Number.isFinite(yearsParam) && yearsParam >= 1
      ? Math.min(30, Math.round(yearsParam))
      : settings.insightRecentYears ?? 3
  const refreshParam = url.searchParams.get('refresh')
  const refresh = refreshParam === '1' || refreshParam === 'true'
  try {
    const payload = await buildInsight(
      { store, graph: await pipeline.getGraph(), analyzer: pipeline.analyzerService },
      { scope, clusterId: clusterId !== null && clusterId !== '' ? clusterId : null, recentYears, refresh },
    )
    respondJson(res, 200, payload)
  } catch (error) {
    if (error instanceof InsightError) {
      respondJson(res, error.code === 'NO_PAPERS' || error.code === 'NO_CLUSTER' ? 422 : 400, {
        ok: false,
        code: error.code,
        error: error.message,
      })
      return
    }
    respondJson(res, 502, { ok: false, code: 'INSIGHT_FAILED', error: errorMessage(error) })
  }
})

route('/api/litgraph/open', ['POST'], async (req, res, { store }) => {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    respondJson(res, 400, { error: errorMessage(error) })
    return
  }
  if (body === null || typeof body !== 'object') {
    respondJson(res, 400, { error: 'expected a JSON object body' })
    return
  }
  const id = typeof (body as { id?: unknown }).id === 'string' ? (body as { id: string }).id : ''
  if (id === '') {
    respondJson(res, 400, { error: 'id is required' })
    return
  }
  const paper = await store.getPaper(id)
  if (paper === null) {
    respondJson(res, 404, { ok: false, via: 'none', error: 'paper not found', id })
    return
  }
  const outcome = await openPaper(paper, store)
  if (outcome.ok) {
    respondJson(res, 200, outcome)
    return
  }
  // 'no file' is a 404 for the client; a failed OS launch is data, never a 500.
  respondJson(res, outcome.via === 'none' ? 404 : 200, outcome)
})

route('/api/litgraph/metrics/refresh', ['POST'], async (req, res, { pipeline }) => {
  let body: unknown = {}
  try {
    body = await readJsonBody(req)
  } catch (error) {
    respondJson(res, 400, { error: errorMessage(error) })
    return
  }
  const input = body !== null && typeof body === 'object' ? (body as { ids?: unknown; force?: unknown }) : {}
  let ids: string[] | undefined
  if (input.ids !== undefined) {
    if (!Array.isArray(input.ids) || input.ids.some((id) => typeof id !== 'string')) {
      respondJson(res, 400, { error: 'ids must be an array of strings' })
      return
    }
    ids = (input.ids as string[]).map((id) => id.trim()).filter((id) => id !== '')
  }
  respondJson(res, 200, await pipeline.refreshMetrics(ids, input.force === true))
})

route('/api/litgraph/metrics/probe', ['GET', 'HEAD'], async (req, res, { store, config }) => {
  const venue = (requestUrl(req).searchParams.get('venue') ?? '').trim()
  if (venue === '') {
    respondJson(res, 400, { ok: false, error: 'venue is required' })
    return
  }
  const settings = await store.getSettings()
  if (!metricsEnabledFor(config, settings)) {
    respondJson(res, 200, { ok: false, venue, error: 'metrics are disabled' })
    return
  }
  const secretKey = metricsSecretKeyFor(config, settings)
  try {
    const metrics = await fetchJournalMetrics(venue, secretKey, { force: true })
    respondJson(res, 200, { ok: true, venue, metrics })
  } catch (error) {
    respondJson(res, 200, { ok: false, venue, error: errorMessage(error) })
  }
})

route('/api/litgraph/ocr/probe', ['GET', 'HEAD'], async (req, res) => {
  respondJson(res, 200, { ok: true, ...(await probeOcr()) })
})

route('/api/litgraph/retry-failed', ['POST'], async (req, res, { pipeline }) => {
  respondJson(res, 200, await pipeline.retryFailedPapers())
})

route('/api/litgraph/zotero/scan', ['POST'], async (req, res) => {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    respondJson(res, 400, { error: errorMessage(error) })
    return
  }
  const input = body !== null && typeof body === 'object' ? (body as { dataDir?: unknown }) : {}
  const dataDir = typeof input.dataDir === 'string' && input.dataDir.trim() !== '' ? input.dataDir.trim() : undefined
  try {
    const result = await scanZoteroLibrary({ dataDir })
    respondJson(res, 200, result)
  } catch (error) {
    if (error instanceof ZoteroScanError) {
      const status = error.code === 'NO_DATA_DIR' || error.code === 'NO_DATABASE' ? 422 : 500
      respondJson(res, status, { error: error.message, code: error.code })
      return
    }
    throw error
  }
})

route('/api/litgraph/zotero/import', ['POST'], async (req, res, { pipeline }) => {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    respondJson(res, 400, { error: errorMessage(error) })
    return
  }
  if (body === null || typeof body !== 'object') {
    respondJson(res, 400, { error: 'expected a JSON object body' })
    return
  }
  const input = body as { keys?: unknown; mode?: unknown }
  if (!Array.isArray(input.keys) || input.keys.some((key) => typeof key !== 'string')) {
    respondJson(res, 400, { error: 'keys must be an array of strings' })
    return
  }
  const mode = input.mode === 'meta' ? 'meta' : 'pdf'
  try {
    const result = await importZoteroSelection(input.keys as string[], mode, {
      importFile: async (tmpPath, fileName, size, provenance) => {
        const imported = await pipeline.importFile(tmpPath, fileName, size, provenance)
        return { jobId: imported.jobId, paperId: imported.paperId, duplicate: imported.duplicate }
      },
      importMetadata: async (item) => {
        const imported = await pipeline.importZoteroMetadata({
          key: item.key,
          itemType: item.itemType,
          title: item.title,
          creators: item.creators,
          year: item.year,
          venue: item.venue,
          doi: item.doi,
          abstract: item.abstract,
          tags: item.tags,
          collections: item.collections,
          fileName: item.attachment?.fileName,
          attachmentFileName: item.attachment?.fileName,
        })
        return { paperId: imported.paperId, duplicate: imported.duplicate }
      },
    })
    respondJson(res, 200, result)
  } catch (error) {
    if (error instanceof ZoteroScanError) {
      respondJson(res, 422, { error: error.message, code: error.code })
      return
    }
    throw error
  }
})

route('/api/litgraph/zotero/state', ['GET', 'HEAD'], async (req, res, { store }) => {
  const settings = await store.getSettings()
  let available = false
  let version = ''
  let userId = 0
  let collections: ZoteroCollection[] = []
  let error = ''
  try {
    const status = await zoteroLocalStatus()
    available = status.available
    version = status.version
    userId = status.userId
    if (available) collections = await listZoteroCollections()
  } catch (caught) {
    error = errorMessage(caught)
  }
  respondJson(res, 200, {
    ok: available,
    available,
    version,
    userId,
    collections,
    authorized: (settings.zoteroApiKey ?? '') !== '',
    error,
  })
})

route('/api/litgraph/zotero/authorize', ['POST'], async (req, res, { store }) => {
  try {
    const result = await authorizeZotero('LitGraph')
    await store.updateSettings({ zoteroApiKey: result.key })
    respondJson(res, 200, { ok: true, remembered: result.remember })
  } catch (caught) {
    const status = caught instanceof ZoteroLocalError && caught.status > 0 ? caught.status : 500
    respondJson(res, status === 429 ? 429 : 500, { ok: false, error: errorMessage(caught) })
  }
})

route('/api/litgraph/zotero/sync', ['POST'], async (req, res, { store }) => {
  try {
    const papers = await store.listPapers()
    const result = await syncZoteroLinks(papers)
    let updated = 0
    for (const paper of papers) {
      const link = result.links[paper.id]
      if (link === undefined) continue
      await store.updatePaper(paper.id, { zotero: link })
      updated += 1
    }
    respondJson(res, 200, { ok: true, matched: result.matched, total: result.total, items: result.items, updated })
  } catch (caught) {
    const status = caught instanceof ZoteroLocalError && caught.status > 0 ? caught.status : 500
    respondJson(res, 200, { ok: false, matched: 0, total: 0, error: errorMessage(caught) })
    void status
  }
})

route('/api/litgraph/paper/zotero', ['PUT'], async (req, res, { store }) => {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    respondJson(res, 400, { error: errorMessage(error) })
    return
  }
  const input = body !== null && typeof body === 'object' ? (body as { id?: unknown; collections?: unknown }) : {}
  const id = typeof input.id === 'string' ? input.id : ''
  if (id === '') {
    respondJson(res, 400, { error: 'id is required' })
    return
  }
  if (!Array.isArray(input.collections)) {
    respondJson(res, 400, { error: 'collections must be an array of collection keys' })
    return
  }
  const collections: string[] = []
  for (const value of input.collections) {
    if (typeof value !== 'string') {
      respondJson(res, 400, { error: 'collections must contain strings' })
      return
    }
    const key = value.trim()
    if (key === '' || collections.includes(key)) continue
    if (key.length > 12) {
      respondJson(res, 400, { error: 'invalid collection key: ' + key })
      return
    }
    collections.push(key)
    if (collections.length >= 40) break
  }
  const paper = await store.getPaper(id)
  if (paper === null) {
    respondJson(res, 404, { ok: false, error: 'paper not found', id })
    return
  }
  const zotero = paper.zotero
  if (zotero === undefined || zotero.key === '') {
    respondJson(res, 409, {
      ok: false,
      code: 'NOT_LINKED',
      error: '这篇文献还没有匹配到 Zotero 条目，先在详情里点「同步 Zotero」',
    })
    return
  }
  const settings = await store.getSettings()
  const apiKey = settings.zoteroApiKey ?? ''
  if (apiKey === '') {
    respondJson(res, 409, {
      ok: false,
      code: 'NEED_AUTH',
      error: '需要先授权 LitGraph 修改 Zotero（会弹出 Zotero 确认框，选「Always Allow」）',
    })
    return
  }
  try {
    await setZoteroCollections(zotero.key, collections, apiKey)
  } catch (caught) {
    const authFailure = caught instanceof ZoteroLocalError && caught.status === 401
    if (authFailure) await store.updateSettings({ zoteroApiKey: '' })
    respondJson(res, authFailure ? 409 : 502, {
      ok: false,
      code: authFailure ? 'NEED_AUTH' : 'WRITE_FAILED',
      error: errorMessage(caught),
    })
    return
  }
  const updated = await store.updatePaper(id, { zotero: { ...zotero, collections } })
  respondJson(res, 200, { ok: true, paper: updated })
})
route('/api/litgraph/job', ['GET', 'HEAD'], async (req, res, { store }) => {
  const id = requestUrl(req).searchParams.get('id') ?? ''
  const job = id === '' ? null : store.getJob(id)
  if (job === null) {
    respondJson(res, 404, { error: 'job not found', id })
    return
  }
  respondJson(res, 200, job)
})

route('/api/litgraph/upload', ['POST'], async (req, res, { store, pipeline, config }) => {
  const fileName = readUploadName(req)
  // apply() starts the pipeline without blocking; make sure the data directories
  // exist before we open a temp file under <dataRoot>/tmp (start() is idempotent).
  await pipeline.start()
  const tmpPath = store.newTmpPath('upload')
  let size: number
  try {
    size = await streamToFile(req, tmpPath, config.maxUploadBytes)
    const result = await pipeline.importFile(tmpPath, fileName, size)
    respondJson(res, 202, { ok: true, jobId: result.jobId, paperId: result.paperId, duplicate: result.duplicate })
  } catch (error) {
    await fsp.unlink(tmpPath).catch(() => undefined)
    if (error instanceof PipelineError) {
      const status = error.code === 'TOO_LARGE' ? 413 : error.code === 'NOT_A_PDF' || error.code === 'EMPTY_UPLOAD' ? 400 : 500
      respondJson(res, status, { error: error.message, code: error.code })
      return
    }
    throw error
  }
})

route('/api/litgraph/file', ['GET', 'HEAD'], async (req, res, { store, config }) => {
  const id = requestUrl(req).searchParams.get('id') ?? ''
  const paper = id === '' ? null : await store.getPaper(id)
  if (paper === null) {
    respondJson(res, 404, { error: 'paper not found', id })
    return
  }
  if (!paper.hasFile) {
    respondJson(res, 404, { error: 'source pdf not available', id })
    return
  }
  const filePath = store.sourcePath(paper.sha256)
  const resolvedSource = resolvePath(filePath)
  if (!resolvedSource.startsWith(resolvePath(store.sourcesDir) + '\\') && resolvedSource !== resolvePath(store.sourcesDir)) {
    respondJson(res, 404, { error: 'source pdf not available', id })
    return
  }
  let info
  try {
    info = await fsp.stat(resolvedSource)
  } catch {
    respondJson(res, 404, { error: 'source pdf missing on disk', id })
    return
  }
  const encodedName = encodeURIComponent(paper.fileName).replace(/['()]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase())
  res.statusCode = 200
  res.setHeader('content-type', 'application/pdf')
  res.setHeader('content-length', String(info.size))
  res.setHeader('cache-control', 'private, max-age=0, no-store')
  res.setHeader('content-disposition', "inline; filename*=UTF-8''" + encodedName)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(resolvedSource)
  stream.on('error', (error) => {
    console.warn('[litgraph] failed to stream source pdf', error)
    if (!res.headersSent) respondJson(res, 500, { error: 'failed to stream source pdf' })
    else res.destroy()
  })
  stream.pipe(res)
})

// -- plugin entry ------------------------------------------------------------

export function apply(ctx: WebContext, rawConfig?: Partial<LitgraphConfig>): void {
  const config = resolveConfig(rawConfig)
  const store = new LibraryStore(config)
  const getLlm = (): LlmService | null => {
    if (ctx.llm !== null && ctx.llm !== undefined) return ctx.llm
    if (typeof ctx.get === 'function') {
      const service = ctx.get('llm')
      if (service !== null && service !== undefined) return service as LlmService
    }
    return null
  }
  const getAttachments = (): VisionAttachments | null => {
    const direct = (ctx as unknown as { attachments?: VisionAttachments }).attachments
    if (direct !== undefined && direct !== null && typeof direct.saveImages === 'function') return direct
    if (typeof ctx.get === 'function') {
      const service = ctx.get('attachments')
      if (service !== undefined && service !== null && typeof (service as VisionAttachments).saveImages === 'function') return service as VisionAttachments
    }
    return null
  }
  // Which provider route serves the calls is decided at call time, not by a hard-coded
  // default: env/profile override first, then the harness' agent default model, then
  // the built-in route, then every other registered provider.
  const readDefaultSelection: DefaultSelectionReader = () => {
    try {
      if (typeof ctx.get !== 'function') return null
      const service = ctx.get('agentDefaultModel') as
        | { currentSelection?: () => { provider?: string; model?: string } | null }
        | null
        | undefined
      const selection = service?.currentSelection?.()
      return selection ?? null
    } catch (error) {
      return null
    }
  }
  const targetResolver = new LlmTargetResolver(getLlm, config, readDefaultSelection)
  const analyzer = new LlmAnalyzer(getLlm, config, targetResolver)
  const pipeline = new LitgraphPipeline(store, analyzer, config, {
    getLlm,
    getAttachments,
    provider: config.llmProvider,
    model: config.llmModel,
    getTargets: () => targetResolver.candidates(),
    markGood: (target) => targetResolver.markGood(target),
    markFailed: (provider) => targetResolver.markFailed(provider),
  })
  const routeContext: RouteContext = { store, pipeline, config }
  const register = (): (() => void) => {
    const disposers: Array<() => void> = []
    // The web server's exact-route table is keyed by path, so several definitions
    // for one path (e.g. GET+HEAD and DELETE on /api/litgraph/paper) must be merged
    // into a single registration and dispatched by method here.
    const groups = new Map<string, { path: string; methods: string[]; handlers: Map<string, RouteHandler>; fallback: RouteHandler }>()
    for (const definition of ROUTES) {
      let group = groups.get(definition.path)
      if (group === undefined) {
        group = { path: definition.path, methods: [], handlers: new Map(), fallback: definition.handler }
        groups.set(definition.path, group)
      }
      for (const method of definition.methods) {
        if (!group.methods.includes(method)) group.methods.push(method)
        if (!group.handlers.has(method)) group.handlers.set(method, definition.handler)
      }
    }
    for (const group of groups.values()) {
      const handlerFor = (req: IncomingMessage): RouteHandler => {
        const method = (req.method ?? 'GET').toUpperCase()
        const direct = group.handlers.get(method)
        if (direct !== undefined) return direct
        const getHandler = group.handlers.get('GET')
        return getHandler ?? group.fallback
      }
      disposers.push(
        ctx.webServer.register({
          kind: 'exact',
          path: group.path,
          handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
            try {
              if (!guard(req, res, group.methods)) return
              await handlerFor(req)(req, res, routeContext)
            } catch (error) {
              console.warn('[litgraph] route ' + group.path + ' failed:', error)
              if (!res.headersSent) respondJson(res, 500, { error: errorMessage(error) })
              else res.destroy()
            }
          },
        }),
      )
    }
    console.info('[litgraph] registered ' + groups.size + ' routes; data root = ' + config.dataRoot)
    return () => {
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch (error) {
          console.warn('[litgraph] route dispose failed', error)
        }
      }
    }
  }
  if (typeof ctx.effect === 'function') ctx.effect(register, 'litgraph: routes')
  else register()
  void pipeline.start().catch((error) => {
    console.warn('[litgraph] pipeline start failed:', error)
  })
}

export { ROUTES }
