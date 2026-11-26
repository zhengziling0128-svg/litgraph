/**
 * Same-origin /api/litgraph/* client.
 *
 * The host half registers these as exact Fetch routes through
 * ctx.connection.fetch.register(); the browser is already authenticated with the
 * shell's signed cookie, so a plain same-origin fetch is owner-authenticated.
 */
import type {
  GraphPayload,
  ImportJob,
  InsightPayload,
  InsightScope,
  LibrarySettings,
  PapersPage,
  PapersQuery,
  PaperDetail,
  PaperListItem,
  PaperPatch,
  MetricsRefreshResult,
  OpenResult,
  SettingsPayload,
  SortKey,
  SortOrder,
  StatusPayload,
  UpdatePaperResult,
  UploadAccepted,
  ZoteroState,
  ZoteroSyncResult,
} from './types'

const BASE = '/api/litgraph'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

async function requestJSON<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(BASE + path, init)
  } catch (error) {
    throw new ApiError('无法连接宿主路由（' + describe(error) + '）', 0)
  }
  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.text()).trim().slice(0, 240)
    } catch {
      // ignore body read failures
    }
    throw new ApiError(
      'HTTP ' + response.status + (detail ? ' · ' + detail : ''),
      response.status,
    )
  }
  try {
    return (await response.json()) as T
  } catch (error) {
    throw new ApiError('宿主返回了非法 JSON（' + describe(error) + '）', response.status)
  }
}

export function fetchGraph(signal?: AbortSignal): Promise<GraphPayload> {
  return requestJSON<GraphPayload>('/graph', { signal })
}

export function fetchStatus(signal?: AbortSignal): Promise<StatusPayload> {
  return requestJSON<StatusPayload>('/status', { signal })
}

export function fetchPapers(query: PapersQuery, signal?: AbortSignal): Promise<PapersPage> {
  const params = new URLSearchParams()
  params.set('sort', query.sort)
  params.set('order', query.order)
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  if (query.q) params.set('q', query.q)
  if (query.cluster) params.set('cluster', query.cluster)
  if (query.tag) params.set('tag', query.tag)
  if (query.starred === true) params.set('starred', '1')
  if (typeof query.minRating === 'number' && query.minRating >= 1) {
    params.set('minRating', String(Math.round(query.minRating)))
  }
  return requestJSON<PapersPage>('/papers?' + params.toString(), { signal })
}

export function fetchPaper(id: string, signal?: AbortSignal): Promise<PaperDetail> {
  return requestJSON<PaperDetail>('/paper?id=' + encodeURIComponent(id), { signal })
}

/**
 * PATCH the user-editable fields of one paper (notes / tags / starred / rating).
 * The host clamps rating to an integer 0..5.
 */
export function updatePaper(id: string, patch: PaperPatch): Promise<UpdatePaperResult> {
  return requestJSON<UpdatePaperResult>('/paper', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  })
}

/**
 * Open the original attachment of one paper. The host tries the Zotero linked
 * file first and falls back to the stored PDF; the client must never open the
 * file URL itself (the shell decides how to hand it to the OS).
 */
export function openPaper(id: string): Promise<OpenResult> {
  return requestJSON<OpenResult>('/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
}

/**
 * Queue journal-metric lookups (EasyScholar). Omit ids to refresh every paper
 * that has metrics enabled; already-fresh records are counted as skipped.
 */
export function refreshMetrics(
  ids?: string[],
  options: { force?: boolean } = {},
): Promise<MetricsRefreshResult> {
  const body: { ids?: string[]; force?: boolean } = {}
  if (ids !== undefined && ids.length > 0) body.ids = ids
  if (options.force === true) body.force = true
  return requestJSON<MetricsRefreshResult>('/metrics/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export interface InsightQuery {
  scope?: InsightScope
  clusterId?: string | null
  recentYears?: number
  /** Bypass the on-disk cache and ask the model again. */
  refresh?: boolean
}

/** 数据库内论文研究趋势 for one scope (GET /api/litgraph/insight). */
export function fetchInsight(query: InsightQuery = {}, signal?: AbortSignal): Promise<InsightPayload> {
  const params = new URLSearchParams()
  if (query.scope) params.set('scope', query.scope)
  if (typeof query.clusterId === 'string' && query.clusterId !== '') params.set('cluster', query.clusterId)
  if (typeof query.recentYears === 'number') params.set('recentYears', String(query.recentYears))
  if (query.refresh === true) params.set('refresh', '1')
  const suffix = params.toString()
  return requestJSON<InsightPayload>('/insight' + (suffix === '' ? '' : '?' + suffix), { signal })
}

export function fetchSettings(signal?: AbortSignal): Promise<SettingsPayload> {
  return requestJSON<SettingsPayload>('/settings', { signal })
}

export function saveSettings(patch: Partial<LibrarySettings>): Promise<SettingsPayload> {
  return requestJSON<SettingsPayload>('/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export interface FilterQuery {
  sort?: SortKey
  order?: SortOrder
  q?: string
  cluster?: string
  tag?: string
  starred?: boolean
  minRating?: number
}

/**
 * Walk every /papers page for the current filter (used by the BibTeX export).
 * Sorted by title so the page walk is stable while the export runs.
 */
export async function fetchAllPapers(
  filters: FilterQuery = {},
  onProgress?: (fetched: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PaperListItem[]> {
  const pageSize = 100
  const collected: PaperListItem[] = []
  let total = Number.POSITIVE_INFINITY
  for (let page = 1; page <= 500 && collected.length < total; page += 1) {
    const data = await fetchPapers(
      {
        sort: filters.sort ?? 'title',
        order: filters.order ?? 'asc',
        page,
        pageSize,
        q: filters.q ?? '',
        cluster: filters.cluster ?? '',
        tag: filters.tag,
        starred: filters.starred,
        minRating: filters.minRating,
      },
      signal,
    )
    total = data.total
    if (data.items.length === 0) break
    for (const item of data.items) collected.push(item)
    onProgress?.(Math.min(collected.length, total), total)
  }
  return collected.slice(0, Number.isFinite(total) ? total : collected.length)
}

/** Load full details for a list of paper ids with bounded concurrency. */
export async function fetchPaperDetails(
  ids: string[],
  options: {
    concurrency?: number
    onProgress?: (done: number, total: number) => void
    signal?: AbortSignal
  } = {},
): Promise<PaperDetail[]> {
  const concurrency = Math.max(1, Math.min(12, options.concurrency ?? 6))
  const results: Array<PaperDetail | null> = new Array(ids.length).fill(null)
  let next = 0
  let done = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      if (index >= ids.length) return
      if (options.signal?.aborted === true) return
      try {
        results[index] = await fetchPaper(ids[index], options.signal)
      } catch {
        results[index] = null
      }
      done += 1
      options.onProgress?.(done, ids.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()))
  return results.filter((paper): paper is PaperDetail => paper !== null)
}

export function deletePaper(id: string): Promise<{ ok: boolean; id: string }> {
  return requestJSON<{ ok: boolean; id: string }>('/paper?id=' + encodeURIComponent(id), {
    method: 'DELETE',
  })
}

export function fetchJob(id: string, signal?: AbortSignal): Promise<ImportJob> {
  return requestJSON<ImportJob>('/job?id=' + encodeURIComponent(id), { signal })
}

export async function uploadPaper(file: File): Promise<UploadAccepted> {
  let response: Response
  try {
    response = await fetch(BASE + '/upload', {
      method: 'POST',
      headers: {
        'content-type': file.type || 'application/pdf',
        'x-litgraph-filename': encodeURIComponent(file.name),
      },
      body: file,
    })
  } catch (error) {
    throw new ApiError('上传失败：无法连接宿主路由（' + describe(error) + '）', 0)
  }
  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.text()).trim().slice(0, 240)
    } catch {
      // ignore
    }
    throw new ApiError('上传失败：HTTP ' + response.status + (detail ? ' · ' + detail : ''), response.status)
  }
  return (await response.json()) as UploadAccepted
}

export function fileUrl(id: string): string {
  return BASE + '/file?id=' + encodeURIComponent(id)
}

export function isPdf(file: File): boolean {
  if (file.type === 'application/pdf') return true
  return /\.pdf$/i.test(file.name)
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
  return (size / (1024 * 1024)).toFixed(2) + ' MB'
}

export function formatDate(iso: string): string {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return iso || '—'
  try {
    return new Date(time).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return new Date(time).toISOString().slice(0, 16).replace('T', ' ')
  }
}

/** Live Zotero local-API status: collections, availability, whether writes are authorized. */
export function fetchZoteroState(): Promise<ZoteroState> {
  return requestJSON<ZoteroState>('/zotero/state')
}

/** Ask Zotero for a write key; the user confirms in a Zotero modal. */
export function authorizeZotero(): Promise<{ ok: boolean; remembered?: boolean; error?: string }> {
  return requestJSON<{ ok: boolean; remembered?: boolean; error?: string }>('/zotero/authorize', {
    method: 'POST',
  })
}

/** Re-match every paper against the Zotero library (title match) and cache keys/collections. */
export function syncZotero(): Promise<ZoteroSyncResult> {
  return requestJSON<ZoteroSyncResult>('/zotero/sync', { method: 'POST' })
}

/** Replace the paper's Zotero collection membership (writes through to Zotero). */
export function setPaperCollections(
  id: string,
  collections: string[],
): Promise<{ ok: boolean; paper?: PaperDetail; code?: string; error?: string }> {
  return requestJSON<{ ok: boolean; paper?: PaperDetail; code?: string; error?: string }>('/paper/zotero', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, collections }),
  })
}