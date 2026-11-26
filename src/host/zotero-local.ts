/**
 * Zotero 本地 API 客户端（Zotero 8+ 的本地读写接口）。
 *
 * 只解决两件事：
 *  1) 把 LiterGraph 里的文献和 Zotero 条目对上（标题归一化匹配），拿到条目/附件 key；
 *  2) 把「最后阅读时间」和「所属集合」写回 Zotero，让 Zotero 的列表能反映阅读与分类。
 *
 * 读请求不需要鉴权；写请求必须带 Zotero-API-Key 和 Zotero-Server-ID 两个头，
 * key 由 POST /api/local/authorize 弹窗获取（用户点 Always Allow 后可长期复用）。
 */
import type { StoredPaper } from './types.js'

const LOCAL_BASE = 'http://127.0.0.1:23119'
const API_VERSION = '3'
const AUTHORIZE_TIMEOUT_MS = 180000
const REQUEST_TIMEOUT_MS = 6000
const PAGE_SIZE = 100
const MAX_ITEMS = 5000

export class ZoteroLocalError extends Error {
  readonly status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ZoteroLocalError'
    this.status = status
  }
}

export interface ZoteroCollection {
  key: string
  name: string
  parentKey: string | null
}

/** One matched Zotero identity, cached on the paper. */
export interface ZoteroLink {
  key: string
  attachmentKey: string | null
  collections: string[]
  lastRead: number | null
  dateModified: string
}

interface ZoteroItemJson {
  key?: unknown
  version?: unknown
  data?: Record<string, unknown>
}

export interface ZoteroLocalItem {
  key: string
  version: number
  itemType: string
  title: string
  parentKey: string | null
  collections: string[]
  contentType: string
  filename: string
  lastRead: number | null
  dateModified: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

let serverIdCache = ''

async function fetchLocal(pathname: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  let response: Response
  try {
    response = await fetch(LOCAL_BASE + pathname, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { ...(init.headers as Record<string, string> | undefined) },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ZoteroLocalError('Zotero 本地 API 不可用（' + message + '）', 0)
  }
  const serverId = response.headers.get('zotero-server-id') ?? ''
  if (serverId !== '') serverIdCache = serverId
  return response
}

async function serverId(): Promise<string> {
  if (serverIdCache !== '') return serverIdCache
  const response = await fetchLocal('/api/users/0/items?limit=1&format=json')
  if (!response.ok) throw new ZoteroLocalError('Zotero 本地 API 返回 HTTP ' + response.status, response.status)
  await response.arrayBuffer()
  if (serverIdCache === '') throw new ZoteroLocalError('Zotero 没有返回 Zotero-Server-ID', 0)
  return serverIdCache
}

function writeHeaders(apiKey: string, id: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'zotero-api-key': apiKey,
    'zotero-server-id': id,
    'zotero-api-version': API_VERSION,
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim()
    return text === '' ? 'HTTP ' + response.status : 'HTTP ' + response.status + ' ' + text.slice(0, 200)
  } catch {
    return 'HTTP ' + response.status
  }
}

export async function zoteroLocalStatus(): Promise<{ available: boolean; serverId: string; version: string; userId: number }> {
  try {
    const response = await fetchLocal('/api/users/0/items?limit=1&format=json')
    const body = response.ok ? ((await response.json()) as unknown) : null
    const userId =
      body !== null && typeof body === 'object' && Array.isArray(body) && body.length > 0
        ? Number(
            ((body[0] as { library?: { id?: unknown } }).library?.id) ?? 0,
          ) || 0
        : 0
    return {
      available: response.ok,
      serverId: serverIdCache,
      version: response.headers.get('x-zotero-version') ?? '',
      userId,
    }
  } catch {
    return { available: false, serverId: '', version: '', userId: 0 }
  }
}

async function readItems(): Promise<ZoteroLocalItem[]> {
  const items: ZoteroLocalItem[] = []
  for (let start = 0; start < MAX_ITEMS; start += PAGE_SIZE) {
    const response = await fetchLocal(
      '/api/users/0/items?limit=' + PAGE_SIZE + '&start=' + start + '&format=json',
    )
    if (!response.ok) throw new ZoteroLocalError('读取 Zotero 条目失败：' + (await readError(response)), response.status)
    const page = (await response.json()) as ZoteroItemJson[]
    if (!Array.isArray(page)) throw new ZoteroLocalError('Zotero 返回的条目不是数组', 0)
    for (const entry of page) {
      const data = entry.data ?? {}
      const key = asString(data.key) || asString(entry.key)
      if (key === '') continue
      items.push({
        key,
        version: typeof entry.version === 'number' ? entry.version : 0,
        itemType: asString(data.itemType),
        title: asString(data.title),
        parentKey: asString(data.parentItem) || null,
        collections: Array.isArray(data.collections) ? data.collections.filter((v): v is string => typeof v === 'string') : [],
        contentType: asString(data.contentType),
        filename: asString(data.filename),
        lastRead: typeof data.lastRead === 'number' ? data.lastRead : null,
        dateModified: asString(data.dateModified),
      })
    }
    if (page.length < PAGE_SIZE) break
  }
  return items
}

export async function listZoteroCollections(): Promise<ZoteroCollection[]> {
  const response = await fetchLocal('/api/users/0/collections?limit=' + PAGE_SIZE + '&format=json')
  if (!response.ok) throw new ZoteroLocalError('读取 Zotero 分类失败：' + (await readError(response)), response.status)
  const page = (await response.json()) as ZoteroItemJson[]
  if (!Array.isArray(page)) return []
  return page
    .map((entry) => {
      const data = entry.data ?? {}
      const key = asString(data.key) || asString(entry.key)
      const name = asString(data.name)
      const parentKey = asString(data.parentCollection) || null
      return { key, name, parentKey }
    })
    .filter((collection) => collection.key !== '' && collection.name !== '')
}

/** 标题归一化：小写、只保留字母数字与中文，用于跨库匹配。 */
export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
    .slice(0, 120)
}

interface ParentRecord {
  key: string
  collections: string[]
  dateModified: string
  attachmentKey: string | null
  lastRead: number | null
}

/** Build parent-item records with their best PDF attachment and newest lastRead. */
export function buildZoteroRecords(items: ZoteroLocalItem[]): Map<string, ParentRecord> {
  const parents = new Map<string, ParentRecord>()
  const titles = new Map<string, string>()
  for (const item of items) {
    if (item.itemType === 'attachment' || item.itemType === 'note' || item.itemType === 'annotation') continue
    if (item.parentKey !== null) continue
    parents.set(item.key, {
      key: item.key,
      collections: [...item.collections],
      dateModified: item.dateModified,
      attachmentKey: null,
      lastRead: null,
    })
    const normalized = normalizeTitle(item.title)
    if (normalized !== '') titles.set(normalized, item.key)
  }
  for (const item of items) {
    if (item.itemType !== 'attachment') continue
    const parentKey = item.parentKey
    if (parentKey === null) continue
    const parent = parents.get(parentKey)
    if (parent === undefined) continue
    const isPdf = item.contentType === 'application/pdf' || /\.pdf$/i.test(item.filename)
    if (!isPdf) continue
    if (parent.attachmentKey === null) parent.attachmentKey = item.key
    if (item.lastRead !== null && (parent.lastRead === null || item.lastRead > parent.lastRead)) {
      parent.lastRead = item.lastRead
    }
  }
  return parents
}

/** Matching helper exposed for tests. */
export function matchZoteroToPaper(
  paper: { title: string; zotero?: { key: string } },
  byTitle: Map<string, ParentRecord>,
): ParentRecord | null {
  const existingKey = paper.zotero?.key ?? ''
  if (existingKey !== '') {
    for (const record of byTitle.values()) if (record.key === existingKey) return record
  }
  const normalized = normalizeTitle(paper.title)
  if (normalized === '') return null
  return byTitle.get(normalized) ?? null
}

/** Refresh zotero linkage for all papers; returns the number of matched papers. */
export async function syncZoteroLinks(
  papers: StoredPaper[],
): Promise<{ matched: number; total: number; links: Record<string, ZoteroLink>; items: number }> {
  const items = await readItems()
  const parents = buildZoteroRecords(items)
  const byTitle = new Map<string, ParentRecord>()
  for (const item of items) {
    if (item.parentKey !== null) continue
    if (item.itemType === 'attachment' || item.itemType === 'note' || item.itemType === 'annotation') continue
    const normalized = normalizeTitle(item.title)
    const record = parents.get(item.key)
    if (normalized !== '' && record !== undefined) byTitle.set(normalized, record)
  }
  const links: Record<string, ZoteroLink> = {}
  for (const paper of papers) {
    const record = matchZoteroToPaper(paper, byTitle)
    if (record === null) continue
    links[paper.id] = {
      key: record.key,
      attachmentKey: record.attachmentKey,
      collections: record.collections,
      lastRead: record.lastRead,
      dateModified: record.dateModified,
    }
  }
  return { matched: Object.keys(links).length, total: papers.length, links, items: items.length }
}

/** Ask Zotero for a local API key; the user picks Allow / Always Allow in a modal. */
export async function authorizeZotero(appName = 'LitGraph'): Promise<{ key: string; remember: boolean }> {
  const id = await serverId()
  // Zotero shows a modal and waits for the user, so this one must not use the
  // short request timeout: the dialog may stay open for minutes.
  const response = await fetchLocal('/api/local/authorize', {
    method: 'POST',
    headers: writeHeaders('', id),
    body: JSON.stringify({ appName }),
  }, AUTHORIZE_TIMEOUT_MS)
  if (!response.ok) throw new ZoteroLocalError('Zotero 授权失败：' + (await readError(response)), response.status)
  const body = (await response.json()) as { key?: unknown; remember?: unknown }
  const key = asString(body.key)
  if (key === '') throw new ZoteroLocalError('Zotero 没有返回 API key', 0)
  return { key, remember: body.remember === true }
}

async function itemVersion(key: string): Promise<{ version: number; lastRead: number | null }> {
  const response = await fetchLocal('/api/users/0/items/' + encodeURIComponent(key) + '?format=json')
  if (!response.ok) throw new ZoteroLocalError('读取 Zotero 条目失败：' + (await readError(response)), response.status)
  const body = (await response.json()) as ZoteroItemJson
  const data = body.data ?? {}
  return {
    version: typeof body.version === 'number' ? body.version : 0,
    lastRead: typeof data.lastRead === 'number' ? data.lastRead : null,
  }
}

async function patchItem(key: string, patch: Record<string, unknown>, apiKey: string): Promise<void> {
  if (apiKey === '') throw new ZoteroLocalError('还没有授权 LitGraph 修改 Zotero', 401)
  const id = await serverId()
  const version = (await itemVersion(key)).version
  const response = await fetchLocal('/api/users/0/items/' + encodeURIComponent(key), {
    method: 'PATCH',
    headers: writeHeaders(apiKey, id),
    body: JSON.stringify({ ...patch, version }),
  })
  if (!response.ok) {
    const message = await readError(response)
    const status = response.status
    if (status === 401 || status === 403) {
      throw new ZoteroLocalError('Zotero 授权已失效，请重新授权（' + message + '）', 401)
    }
    throw new ZoteroLocalError('写入 Zotero 失败：' + message, status)
  }
}

/**
 * Record that the user just read this item.
 *
 * Zotero bumps the attachment's lastRead itself when its reader hands the PDF
 * over, but a read never touches the parent item's dateModified (the library's
 * 修改日期 column), so with an API key we stamp that too. Returns unix seconds.
 */
export async function markZoteroRead(attachmentKey: string, apiKey: string, parentKey = ''): Promise<number> {
  const nowMs = Date.now()
  const now = Math.floor(nowMs / 1000)
  if (parentKey !== '') {
    await patchItem(parentKey, { dateModified: new Date(nowMs).toISOString() }, apiKey)
  } else {
    await patchItem(attachmentKey, { lastRead: now }, apiKey)
  }
  return now
}

/** Replace the parent item's collection membership. */
export async function setZoteroCollections(parentKey: string, collections: string[], apiKey: string): Promise<void> {
  await patchItem(parentKey, { collections }, apiKey)
}
