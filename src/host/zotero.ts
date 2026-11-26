/**
 * dsh-litgraph · Zotero integration (host half).
 *
 * Scans the user's local Zotero library and imports selected items into LitGraph.
 * Two sources are supported:
 *
 *   1. Zotero 7's local HTTP API (127.0.0.1:23119). It only works when
 *      "Allow other applications on this computer to communicate with Zotero"
 *      is enabled in the Zotero preferences; otherwise Zotero answers HTTP 403.
 *   2. The SQLite database itself (<dataDir>/zotero.sqlite). This is the reliable
 *      path: the database is copied to the OS temp dir first and read with sql.js,
 *      so the live file is never opened for writing and never locked.
 *
 * The host never writes into the Zotero data directory (only reads it or copies out
 * of it), and every temp copy is deleted before the call returns.
 *
 * Wire contract: the client keeps a structural copy of the interfaces below in
 * src/client/zoteroApi.ts. Keep both sides in sync when a field is added.
 */
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/* -------------------------------------------------------------------------- */
/* Public wire contract                                                        */
/* -------------------------------------------------------------------------- */

/** A PDF attachment discovered on disk. path is '' when the file is missing. */
export interface ZoteroAttachment {
  /** Zotero attachment item key (the stable id used by the zotero:// open links). */
  key: string
  fileName: string
  size: number
  /** Absolute path of the PDF file, or '' when the file does not exist on disk. */
  path: string
}

/** A single paper-like Zotero item, flattened for the import dialog. */
export interface ZoteroItemSummary {
  /** Zotero item key (stable, used as the selection id). */
  key: string
  /** Zotero type name, e.g. journalArticle / conferencePaper. */
  itemType: string
  title: string
  creators: string[]
  year: number | null
  venue: string
  doi: string
  abstract: string
  tags: string[]
  /** Full collection paths, e.g. ['智能加工'] or ['A', 'A > B']. */
  collections: string[]
  attachment: ZoteroAttachment | null
}

export interface ZoteroScanResult {
  ok: true
  /** Resolved Zotero data directory (the one that was read). */
  dataDir: string
  source: 'local-api' | 'sqlite'
  items: ZoteroItemSummary[]
  /** Non-fatal notes for the UI ("提示"), in Chinese. */
  warnings: string[]
}

/** Where an imported PDF came from, persisted as paper.zotero. */
export interface ZoteroProvenance {
  /** Parent (paper) Zotero item key. */
  zoteroKey: string
  /** Attachment item key, or null when unknown / metadata-only. */
  attachmentKey: string | null
}

export interface ZoteroDeps {
  /** Hand a copied PDF to the normal LitGraph upload pipeline. */
  importFile(
    tmpPath: string,
    fileName: string,
    size: number,
    provenance?: ZoteroProvenance,
  ): Promise<{ jobId: string; paperId: string; duplicate: boolean }>
  /** Import the record without a PDF (metadata-only paper, background LLM classification). */
  importMetadata(item: ZoteroItemSummary): Promise<{ paperId: string; duplicate: boolean }>
}

export type ZoteroImportMode = 'pdf' | 'meta'

export interface ZoteroImportAccepted {
  key: string
  paperId: string
  jobId?: string
}

export interface ZoteroImportSkipped {
  key: string
  reason: string
}

export interface ZoteroImportResult {
  ok: true
  accepted: ZoteroImportAccepted[]
  skipped: ZoteroImportSkipped[]
}

/** Options for scanZoteroLibrary(); the route only forwards dataDir. */
export interface ZoteroScanOptions {
  /** Explicit Zotero data directory (or a path to zotero.sqlite). Also settable via LITGRAPH_ZOTERO_DATA_DIR. */
  dataDir?: string
  /** Override the local API base URL (tests / another port). */
  apiBaseUrl?: string
  /** Local API request timeout in ms. */
  localApiTimeoutMs?: number
  /** Set false to skip the local API and always read the SQLite copy. */
  preferLocalApi?: boolean
}

export type ZoteroErrorCode = 'NO_DATA_DIR' | 'NO_DATABASE' | 'SQLITE_FAILED' | 'INVALID_MODE'

export class ZoteroScanError extends Error {
  readonly code: ZoteroErrorCode

  constructor(code: ZoteroErrorCode, message: string) {
    super(message)
    this.name = 'ZoteroScanError'
    this.code = code
  }
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const DEFAULT_LOCAL_API_BASE = 'http://127.0.0.1:23119'
const LOCAL_API_TIMEOUT_MS = 5000
const LOCAL_API_PAGE = 100
const LOCAL_API_MAX_ITEMS = 2000
const SCAN_CACHE_MS = 2 * 60_000
const MAX_WARNINGS = 40

/** Zotero item types that can become a LitGraph paper. */
const PAPER_ITEM_TYPES = new Set<string>([
  'journalArticle',
  'magazineArticle',
  'newspaperArticle',
  'conferencePaper',
  'book',
  'bookSection',
  'thesis',
  'report',
  'preprint',
  'manuscript',
  'patent',
  'standard',
  'dataset',
  'document',
  'encyclopediaArticle',
  'dictionaryEntry',
  'webpage',
])

/** Item types we intentionally skip when scanning (notes, attachments, software, ...). */
const NON_PAPER_ITEM_TYPES = new Set<string>([
  'note',
  'attachment',
  'computerProgram',
  'annotation',
  'presentation',
  'podcast',
  'videoRecording',
  'audioRecording',
  'film',
  'tvBroadcast',
  'radioBroadcast',
  'interview',
  'letter',
  'email',
  'instantMessage',
  'forumPost',
  'blogPost',
  'artwork',
  'map',
  'case',
  'statute',
  'bill',
  'hearing',
  'regulation',
])

const VENUE_FIELDS = [
  'publicationTitle',
  'proceedingsTitle',
  'conferenceName',
  'bookTitle',
  'university',
  'institution',
  'publisher',
  'repository',
  'websiteTitle',
  'seriesTitle',
  'journalAbbreviation',
]

const WANTED_FIELDS = new Set<string>([
  'title',
  'date',
  'abstractNote',
  'DOI',
  ...VENUE_FIELDS,
])

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function dedupeWarnings(warnings: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const warning of warnings) {
    const text = warning.trim()
    if (text === '' || seen.has(text)) continue
    seen.add(text)
    output.push(text)
    if (output.length >= MAX_WARNINGS) {
      output.push('还有更多提示未显示')
      break
    }
  }
  return output
}

function expandHome(raw: string): string {
  const value = raw.trim()
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return value
}

/** Normalise a Zotero date field. Zotero 7 stores e.g. "2006-09-00 9/2006". */
export function parseZoteroYear(raw: string): number | null {
  const value = raw.trim()
  if (value === '') return null
  const leading = /^(\d{4})(?=\D|$)/.exec(value)
  const match = leading !== null ? leading : /(\d{4})/.exec(value)
  if (match === null) return null
  const year = Number.parseInt(match[1], 10)
  if (!Number.isFinite(year) || year < 1000 || year > 2200) return null
  return year
}

function normalizeDoi(raw: string): string {
  return raw.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '')
}

function formatCreatorName(firstName: string, lastName: string, singleField: boolean): string {
  const first = firstName.trim()
  const last = lastName.trim()
  if (singleField) return last || first
  if (first === '') return last
  if (last === '') return first
  if (CJK_RE.test(first + last)) return last + first
  return first + ' ' + last
}

function looksLikePdf(contentType: string, fileName: string): boolean {
  if (/pdf/i.test(contentType)) return true
  if (/\.pdf$/i.test(fileName)) return true
  return false
}

function safeFileName(raw: string): string {
  const flat = basename(String(raw ?? '').replace(/\\/g, '/'))
  const cleaned = flat.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
  return (cleaned === '' ? 'attachment.pdf' : cleaned).slice(0, 150)
}

async function statQuiet(path: string): Promise<{ size: number; isFile: boolean } | null> {
  if (path === '') return null
  try {
    const info = await stat(path)
    return { size: info.size, isFile: info.isFile() }
  } catch {
    return null
  }
}

/** Run async fn over items with a bounded number of in-flight calls. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers: Promise<void>[] = []
  const count = Math.max(1, Math.min(limit, items.length))
  for (let worker = 0; worker < count; worker += 1) {
    workers.push(
      (async () => {
        for (;;) {
          const index = cursor
          cursor += 1
          if (index >= items.length) return
          results[index] = await fn(items[index], index)
        }
      })(),
    )
  }
  await Promise.all(workers)
  return results
}

/* -------------------------------------------------------------------------- */
/* Zotero data directory resolution                                            */
/* -------------------------------------------------------------------------- */

async function zoteroPrefsDataDir(): Promise<string | null> {
  const appData = process.env.APPDATA
  if (appData === undefined || appData.trim() === '') return null
  const profilesRoot = join(appData, 'Zotero', 'Zotero', 'Profiles')
  let entries: string[] = []
  try {
    entries = await readdir(profilesRoot)
  } catch {
    return null
  }
  for (const entry of entries) {
    let content = ''
    try {
      content = await readFile(join(profilesRoot, entry, 'prefs.js'), 'utf8')
    } catch {
      continue
    }
    const match = /user_pref\(\s*"extensions\.zotero\.dataDir"\s*,\s*("(?:[^"\\]|\\.)*")\s*\)/.exec(content)
    if (match === null) continue
    try {
      const value: unknown = JSON.parse(match[1])
      if (typeof value === 'string' && value.trim() !== '') return value
    } catch {
      // Ignore malformed pref values; will fall back to the default directory.
    }
  }
  return null
}

async function defaultDataDirCandidates(): Promise<string[]> {
  const candidates: string[] = []
  const envDir = process.env.LITGRAPH_ZOTERO_DATA_DIR ?? process.env.ZOTERO_DATA_DIR
  if (envDir !== undefined && envDir.trim() !== '') candidates.push(expandHome(envDir))
  const fromPrefs = await zoteroPrefsDataDir()
  if (fromPrefs !== null) candidates.push(fromPrefs)
  candidates.push(join(homedir(), 'Zotero'))
  return [...new Set(candidates.filter((value) => value.trim() !== ''))]
}

function dataDirFromInput(raw: string): string {
  let value = expandHome(raw)
  if (/zotero\.sqlite$/i.test(value)) value = dirname(value)
  return value
}

async function resolveZoteroDataDir(explicit: string | undefined, warnings: string[]): Promise<string> {
  if (explicit !== undefined && explicit.trim() !== '') {
    const dir = dataDirFromInput(explicit)
    if (!existsSync(join(dir, 'zotero.sqlite'))) {
      throw new ZoteroScanError('NO_DATABASE', '指定的 Zotero 数据目录里没有 zotero.sqlite：' + dir)
    }
    return dir
  }
  const tried: string[] = []
  for (const candidate of await defaultDataDirCandidates()) {
    tried.push(candidate)
    if (existsSync(join(candidate, 'zotero.sqlite'))) return candidate
  }
  throw new ZoteroScanError(
    'NO_DATA_DIR',
    '没有找到 Zotero 数据目录（已尝试：' + tried.join('；') + '）。请确认 Zotero 已安装并至少打开过一次。',
  )
}

/* -------------------------------------------------------------------------- */
/* sql.js loading                                                              */
/* -------------------------------------------------------------------------- */

interface SqlJsStatement {
  bind(params: unknown[] | Record<string, unknown>): boolean
  step(): boolean
  getAsObject(): Record<string, unknown>
  free(): void
}

interface SqlJsDatabase {
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>
  prepare(sql: string): SqlJsStatement
  close(): void
}

interface SqlJsStatic {
  Database: new (data: Uint8Array) => SqlJsDatabase
}

type SqlJsFactory = (config: { wasmBinary?: Uint8Array }) => Promise<SqlJsStatic>

let sqlJsPromise: Promise<SqlJsStatic> | null = null

async function findSqlWasm(): Promise<string> {
  const override = process.env.LITGRAPH_SQLJS_WASM
  if (override !== undefined && existsSync(override)) return override
  const hereDir = dirname(fileURLToPath(import.meta.url))
  const candidates: string[] = []
  let dir = hereDir
  for (let depth = 0; depth < 6; depth += 1) {
    candidates.push(join(dir, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  try {
    const require = createRequire(import.meta.url)
    const mainPath = require.resolve('sql.js')
    candidates.push(join(dirname(mainPath), 'sql-wasm.wasm'))
  } catch {
    // sql.js is not resolvable from this file; the node_modules walk above may still find it.
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new ZoteroScanError(
    'SQLITE_FAILED',
    '找不到 sql.js 的 wasm 运行时（sql-wasm.wasm）。已尝试：' + candidates.join('；'),
  )
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlJsPromise === null) {
    sqlJsPromise = (async () => {
      const wasmPath = await findSqlWasm()
      const wasmBinary = new Uint8Array(await readFile(wasmPath))
      const moduleValue: Record<string, unknown> = (await import('sql.js')) as unknown as Record<string, unknown>
      const factory = (typeof moduleValue.default === 'function' ? moduleValue.default : moduleValue) as SqlJsFactory
      if (typeof factory !== 'function') throw new Error('sql.js 模块导出异常（没有 initSqlJs 工厂函数）')
      return await factory({ wasmBinary })
    })()
    sqlJsPromise = sqlJsPromise.catch((error: unknown) => {
      sqlJsPromise = null
      throw error
    })
  }
  return sqlJsPromise
}

function rowsOf(db: SqlJsDatabase, sql: string): Record<string, unknown>[] {
  const statement = db.prepare(sql)
  const rows: Record<string, unknown>[] = []
  try {
    while (statement.step()) rows.push(statement.getAsObject())
  } finally {
    statement.free()
  }
  return rows
}

/** Like rowsOf but tolerates a missing table/view (older Zotero schemas). */
function tryRows(db: SqlJsDatabase, sql: string): Record<string, unknown>[] {
  try {
    return rowsOf(db, sql)
  } catch {
    return []
  }
}

/**
 * Copy zotero.sqlite into a private temp directory and open the copy with sql.js.
 * The original file is only read (copyFile), never opened for writing or locked.
 */
async function copyAndOpenZoteroDatabase(sqlitePath: string): Promise<{ db: SqlJsDatabase; tempDir: string }> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const tempDir = join(tmpdir(), 'litgraph-zotero-' + randomUUID().replace(/-/g, '').slice(0, 10))
    try {
      await mkdir(tempDir, { recursive: true })
      const copyPath = join(tempDir, 'zotero.sqlite')
      await copyFile(sqlitePath, copyPath)
      const bytes = new Uint8Array(await readFile(copyPath))
      const SQL = await loadSqlJs()
      const db = new SQL.Database(bytes)
      return { db, tempDir }
    } catch (error) {
      lastError = error
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
      if (attempt === 0) await delay(200)
    }
  }
  throw new ZoteroScanError(
    'SQLITE_FAILED',
    '读取 Zotero 数据库失败：' + errorMessage(lastError) + '。如果 Zotero 正在同步，请稍后重试。',
  )
}

/* -------------------------------------------------------------------------- */
/* Attachment path resolution                                                  */
/* -------------------------------------------------------------------------- */

interface AttachmentRef {
  fileName: string
  /** Absolute path when resolvable, '' otherwise. */
  path: string
}

function isInsideDirectory(root: string, target: string): boolean {
  const normalizedRoot = resolvePath(root).toLowerCase()
  const normalizedTarget = resolvePath(target).toLowerCase()
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + sep)
}

/**
 * Resolve a Zotero attachment reference:
 *   storage:<name>      -> <dataDir>/storage/<attachmentItemKey>/<name>
 *   attachments:<name>  -> linked base dir is not stored in the DB; path unknown
 *   absolute path       -> used as-is
 */
function resolveAttachmentRef(dataDir: string, attachmentKey: string, rawPath: string): AttachmentRef {
  const raw = rawPath.trim()
  if (raw === '') return { fileName: '', path: '' }
  if (/^storage:/i.test(raw)) {
    const relative = raw.slice('storage:'.length)
    const fileName = basename(relative.replace(/\\/g, '/'))
    const storageRoot = resolvePath(dataDir, 'storage', attachmentKey)
    const full = resolvePath(storageRoot, relative)
    if (!isInsideDirectory(storageRoot, full)) return { fileName, path: '' }
    return { fileName, path: full }
  }
  if (/^attachments:/i.test(raw)) {
    return { fileName: basename(raw.slice('attachments:'.length).replace(/\\/g, '/')), path: '' }
  }
  const local = raw.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, '')
  if (isAbsolute(local)) return { fileName: basename(local), path: local }
  return { fileName: basename(local), path: resolvePath(dataDir, local) }
}

interface AttachmentCandidate {
  parentId: number | string
  /** Attachment item key (zotero:// open target). */
  key: string
  fileName: string
  resolvedPath: string
  score: number
  exists: boolean
  size: number
}

function scoreAttachment(contentType: string, fileName: string): number {
  let score = 0
  if (contentType.toLowerCase() === 'application/pdf') score += 4
  if (/\.pdf$/i.test(fileName)) score += 2
  return score
}

/** Stat candidates, then keep the best PDF per parent. Missing files are kept with path ''. */
async function pickBestAttachments(
  candidates: AttachmentCandidate[],
  warnings: string[],
): Promise<Map<number | string, ZoteroAttachment>> {
  const stats = await mapLimit(candidates, 16, (candidate) => statQuiet(candidate.resolvedPath))
  const best = new Map<number | string, AttachmentCandidate>()
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const info = stats[index]
    candidate.exists = info !== null && info.isFile
    candidate.size = candidate.exists ? info.size : 0
    const current = best.get(candidate.parentId)
    if (current === undefined || candidate.score > current.score) best.set(candidate.parentId, candidate)
  }
  const attachments = new Map<number | string, ZoteroAttachment>()
  let missing = 0
  for (const [parentId, candidate] of best) {
    attachments.set(parentId, {
      key: candidate.key,
      fileName: candidate.fileName,
      size: candidate.size,
      path: candidate.exists ? candidate.resolvedPath : '',
    })
    if (!candidate.exists) missing += 1
  }
  if (missing > 0) {
    warnings.push(missing + ' 个条目的 PDF 附件在磁盘上找不到（仍可用「仅导入记录」导入元数据）')
  }
  return attachments
}

/* -------------------------------------------------------------------------- */
/* SQLite scan                                                                 */
/* -------------------------------------------------------------------------- */

interface RawZoteroItem {
  itemID: number
  key: string
  typeName: string
}

function collectionPaths(paths: Map<number, string>, entries: Map<number, { name: string; parentID: number | null }>): Map<number, string> {
  const resolving = new Set<number>()
  const resolvePathOf = (collectionID: number): string => {
    const cached = paths.get(collectionID)
    if (cached !== undefined) return cached
    const entry = entries.get(collectionID)
    if (entry === undefined || resolving.has(collectionID)) return ''
    resolving.add(collectionID)
    const parent = entry.parentID !== null ? resolvePathOf(entry.parentID) : ''
    resolving.delete(collectionID)
    const value = parent === '' ? entry.name : parent + ' > ' + entry.name
    paths.set(collectionID, value)
    return value
  }
  for (const collectionID of entries.keys()) resolvePathOf(collectionID)
  return paths
}

async function scanViaSqlite(dataDir: string, warnings: string[]): Promise<ZoteroItemSummary[]> {
  const sqlitePath = join(dataDir, 'zotero.sqlite')
  if (existsSync(sqlitePath + '-wal')) {
    warnings.push('Zotero 数据库带有 WAL 日志，最近几分钟的改动可能还没写进主库；刚添加的条目请稍后重新扫描')
  }
  const opened = await copyAndOpenZoteroDatabase(sqlitePath)
  try {
    return await readSqliteItems(opened.db, dataDir, warnings)
  } finally {
    try {
      opened.db.close()
    } catch {
      // Already closed / failed to close; temp dir cleanup below is what matters.
    }
    await rm(opened.tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function readSqliteItems(db: SqlJsDatabase, dataDir: string, warnings: string[]): Promise<ZoteroItemSummary[]> {
  const typeNameById = new Map<number, string>()
  for (const row of tryRows(db, 'SELECT itemTypeID, typeName FROM itemTypes')) {
    const id = asNumber(row.itemTypeID)
    const name = asString(row.typeName)
    if (id !== null && name !== '') typeNameById.set(id, name)
  }
  // Custom item types (Zotero 7) live in itemTypesCombined; the merged view wins.
  for (const row of tryRows(db, 'SELECT itemTypeID, typeName FROM itemTypesCombined')) {
    const id = asNumber(row.itemTypeID)
    const name = asString(row.typeName)
    if (id !== null && name !== '' && !typeNameById.has(id)) typeNameById.set(id, name)
  }
  if (typeNameById.size === 0) {
    throw new ZoteroScanError('SQLITE_FAILED', 'Zotero 数据库结构异常：读取不到条目类型定义，可能不是有效的 zotero.sqlite')
  }

  const fieldNameById = new Map<number, string>()
  for (const row of tryRows(db, 'SELECT fieldID, fieldName FROM fields')) {
    const id = asNumber(row.fieldID)
    const name = asString(row.fieldName)
    if (id !== null && name !== '') fieldNameById.set(id, name)
  }
  for (const row of tryRows(db, 'SELECT fieldID, fieldName FROM fieldsCombined')) {
    const id = asNumber(row.fieldID)
    const name = asString(row.fieldName)
    if (id !== null && name !== '' && !fieldNameById.has(id)) fieldNameById.set(id, name)
  }
  if (fieldNameById.size === 0) {
    throw new ZoteroScanError('SQLITE_FAILED', 'Zotero 数据库结构异常：读取不到字段定义')
  }

  const deletedItems = new Set<number>()
  for (const row of tryRows(db, 'SELECT itemID FROM deletedItems')) {
    const id = asNumber(row.itemID)
    if (id !== null) deletedItems.add(id)
  }

  const rawItems: RawZoteroItem[] = []
  let skippedNonPaper = 0
  for (const row of rowsOf(db, 'SELECT itemID, itemTypeID, key FROM items ORDER BY itemID')) {
    const itemID = asNumber(row.itemID)
    const itemTypeID = asNumber(row.itemTypeID)
    const key = asString(row.key)
    if (itemID === null || itemTypeID === null || key === '') continue
    if (deletedItems.has(itemID)) continue
    const typeName = typeNameById.get(itemTypeID) ?? ''
    if (PAPER_ITEM_TYPES.has(typeName)) {
      rawItems.push({ itemID, key, typeName })
    } else if (NON_PAPER_ITEM_TYPES.has(typeName) || typeName !== '') {
      skippedNonPaper += 1
    }
  }
  if (skippedNonPaper > 0) {
    warnings.push('已跳过 ' + skippedNonPaper + ' 条非论文型 Zotero 条目（笔记、附件、软件等）')
  }
  if (rawItems.length === 0) return []

  const wantedItemIds = new Set<number>(rawItems.map((item) => item.itemID))

  // Field values: only the fields LitGraph needs are kept.
  const fieldsByItem = new Map<number, Map<string, string>>()
  for (const row of rowsOf(
    db,
    'SELECT d.itemID AS itemID, d.fieldID AS fieldID, v.value AS value FROM itemData d JOIN itemDataValues v ON v.valueID = d.valueID',
  )) {
    const itemID = asNumber(row.itemID)
    if (itemID === null || !wantedItemIds.has(itemID)) continue
    const fieldID = asNumber(row.fieldID)
    if (fieldID === null) continue
    const fieldName = fieldNameById.get(fieldID) ?? ''
    if (!WANTED_FIELDS.has(fieldName)) continue
    const value = asString(row.value)
    if (value === '') continue
    let fields = fieldsByItem.get(itemID)
    if (fields === undefined) {
      fields = new Map<string, string>()
      fieldsByItem.set(itemID, fields)
    }
    fields.set(fieldName, value)
  }

  // Creators, in Zotero display order.
  const creatorsByItem = new Map<number, string[]>()
  for (const row of tryRows(
    db,
    'SELECT ic.itemID AS itemID, ic.orderIndex AS orderIndex, c.firstName AS firstName, c.lastName AS lastName, c.fieldMode AS fieldMode FROM itemCreators ic JOIN creators c ON c.creatorID = ic.creatorID ORDER BY ic.itemID, ic.orderIndex',
  )) {
    const itemID = asNumber(row.itemID)
    if (itemID === null || !wantedItemIds.has(itemID)) continue
    const name = formatCreatorName(asString(row.firstName), asString(row.lastName), asNumber(row.fieldMode) === 1)
    if (name === '') continue
    let list = creatorsByItem.get(itemID)
    if (list === undefined) {
      list = []
      creatorsByItem.set(itemID, list)
    }
    list.push(name)
  }

  // Tags.
  const tagsByItem = new Map<number, string[]>()
  for (const row of tryRows(db, 'SELECT it.itemID AS itemID, t.name AS name FROM itemTags it JOIN tags t ON t.tagID = it.tagID')) {
    const itemID = asNumber(row.itemID)
    const name = asString(row.name).trim()
    if (itemID === null || name === '' || !wantedItemIds.has(itemID)) continue
    const list = tagsByItem.get(itemID)
    if (list === undefined) tagsByItem.set(itemID, [name])
    else list.push(name)
  }

  // Collections (skip deleted ones) and their full paths.
  const collectionEntries = new Map<number, { name: string; parentID: number | null }>()
  for (const row of tryRows(
    db,
    'SELECT collectionID, collectionName, parentCollectionID FROM collections WHERE collectionID NOT IN (SELECT collectionID FROM deletedCollections)',
  )) {
    const id = asNumber(row.collectionID)
    const name = asString(row.collectionName).trim()
    if (id === null || name === '') continue
    collectionEntries.set(id, { name, parentID: asNumber(row.parentCollectionID) })
  }
  const collectionPathById = collectionPaths(new Map<number, string>(), collectionEntries)
  const collectionIdsByItem = new Map<number, number[]>()
  for (const row of tryRows(db, 'SELECT collectionID, itemID FROM collectionItems')) {
    const itemID = asNumber(row.itemID)
    const collectionID = asNumber(row.collectionID)
    if (itemID === null || collectionID === null || !wantedItemIds.has(itemID)) continue
    const list = collectionIdsByItem.get(itemID)
    if (list === undefined) collectionIdsByItem.set(itemID, [collectionID])
    else list.push(collectionID)
  }
  const collectionsByItem = new Map<number, string[]>()
  for (const [itemID, ids] of collectionIdsByItem) {
    const paths = [...new Set(ids.map((id) => collectionPathById.get(id) ?? '').filter((value) => value !== ''))]
    if (paths.length > 0) collectionsByItem.set(itemID, paths)
  }

  // PDF attachments: itemAttachments.path + storage/<attachmentKey>/.
  const candidates: AttachmentCandidate[] = []
  for (const row of rowsOf(
    db,
    'SELECT a.itemID AS itemID, a.parentItemID AS parentItemID, a.contentType AS contentType, a.path AS path, i.key AS key FROM itemAttachments a JOIN items i ON i.itemID = a.itemID',
  )) {
    const attachmentItemID = asNumber(row.itemID)
    const parentItemID = asNumber(row.parentItemID)
    if (attachmentItemID === null || parentItemID === null) continue
    if (!wantedItemIds.has(parentItemID) || deletedItems.has(attachmentItemID)) continue
    const contentType = asString(row.contentType)
    const attachmentKey = asString(row.key)
    const ref = resolveAttachmentRef(dataDir, attachmentKey, asString(row.path))
    if (ref.path === '' && ref.fileName === '') continue
    if (!looksLikePdf(contentType, ref.fileName)) continue
    candidates.push({
      parentId: parentItemID,
      key: attachmentKey,
      fileName: ref.fileName,
      resolvedPath: ref.path,
      score: scoreAttachment(contentType, ref.fileName),
      exists: false,
      size: 0,
    })
  }
  const attachmentByItem = await pickBestAttachments(candidates, warnings)

  const summaries: ZoteroItemSummary[] = []
  for (const item of rawItems) {
    const fields = fieldsByItem.get(item.itemID)
    const attachment = attachmentByItem.get(item.itemID) ?? null
    const title =
      (fields?.get('title') ?? '').trim() ||
      (attachment !== null ? attachment.fileName.replace(/\.pdf$/i, '') : '') ||
      '(未命名 Zotero 条目)'
    let venue = ''
    if (fields !== undefined) {
      for (const fieldName of VENUE_FIELDS) {
        const value = fields.get(fieldName) ?? ''
        if (value.trim() !== '') {
          venue = value.trim()
          break
        }
      }
    }
    summaries.push({
      key: item.key,
      itemType: item.typeName,
      title,
      creators: creatorsByItem.get(item.itemID) ?? [],
      year: fields !== undefined ? parseZoteroYear(fields.get('date') ?? '') : null,
      venue,
      doi: fields !== undefined ? normalizeDoi(fields.get('DOI') ?? '') : '',
      abstract: (fields?.get('abstractNote') ?? '').trim(),
      tags: tagsByItem.get(item.itemID) ?? [],
      collections: collectionsByItem.get(item.itemID) ?? [],
      attachment,
    })
  }
  return summaries
}

/* -------------------------------------------------------------------------- */
/* Zotero local API scan                                                       */
/* -------------------------------------------------------------------------- */

interface LocalApiResponse {
  status: number
  raw: string
  body: unknown
}

async function localApiGet(base: string, pathWithQuery: string, timeoutMs: number): Promise<LocalApiResponse> {
  const response = await fetch(base + pathWithQuery, {
    headers: { 'Zotero-API-Version': '3', Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  const raw = await response.text()
  let body: unknown = null
  if (raw.trim() !== '') {
    try {
      body = JSON.parse(raw)
    } catch {
      body = null
    }
  }
  return { status: response.status, raw, body }
}

interface LocalApiEntry {
  key: string
  itemType: string
  data: Record<string, unknown>
}

function toLocalApiEntry(value: unknown): LocalApiEntry | null {
  if (value === null || typeof value !== 'object') return null
  const object = value as Record<string, unknown>
  const dataRaw = object.data
  if (dataRaw === null || typeof dataRaw !== 'object') return null
  const data = dataRaw as Record<string, unknown>
  const key = asString(object.key) || asString(data.key)
  const itemType = asString(data.itemType)
  if (key === '' || itemType === '') return null
  return { key, itemType, data }
}

/** Paginate one local API list. Returns null when even the first page failed. */
async function fetchLocalApiPages(
  base: string,
  pathForStart: (start: number) => string,
  timeoutMs: number,
  warnings: string[],
  label: string,
): Promise<unknown[] | null> {
  const collected: unknown[] = []
  let start = 0
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const page = await localApiGet(base, pathForStart(start), timeoutMs)
    if (page.status !== 200 || !Array.isArray(page.body)) {
      if (pageIndex === 0) return null
      warnings.push(label + '读取中断（HTTP ' + page.status + '），只读到前 ' + collected.length + ' 条')
      return collected
    }
    collected.push(...page.body)
    if (page.body.length < LOCAL_API_PAGE) return collected
    if (collected.length >= LOCAL_API_MAX_ITEMS) {
      warnings.push(label + '超过 ' + LOCAL_API_MAX_ITEMS + ' 条，仅取前 ' + LOCAL_API_MAX_ITEMS + ' 条')
      return collected
    }
    start += LOCAL_API_PAGE
  }
  return collected
}

interface LocalApiCollectionEntry {
  key: string
  name: string
  parentKey: string
}

/**
 * Collections from /api/users/0/collections carry no data.itemType (unlike
 * regular items), so they need their own parser instead of toLocalApiEntry().
 */
function toLocalApiCollectionEntry(value: unknown): LocalApiCollectionEntry | null {
  if (value === null || typeof value !== 'object') return null
  const object = value as Record<string, unknown>
  const dataRaw = object.data
  const data = (dataRaw !== null && typeof dataRaw === 'object' ? dataRaw : {}) as Record<string, unknown>
  const key = asString(object.key) || asString(data.key)
  const name = asString(data.name).trim()
  if (key === '' || name === '') return null
  const parent = asString(data.parentCollection)
  return { key, name, parentKey: parent === 'false' ? '' : parent }
}

function buildApiCollectionPaths(entries: LocalApiCollectionEntry[]): Map<string, string> {
  const infoByKey = new Map<string, { name: string; parentKey: string }>()
  for (const entry of entries) {
    infoByKey.set(entry.key, { name: entry.name, parentKey: entry.parentKey })
  }
  const paths = new Map<string, string>()
  const resolving = new Set<string>()
  const resolvePathOf = (key: string): string => {
    const cached = paths.get(key)
    if (cached !== undefined) return cached
    const info = infoByKey.get(key)
    if (info === undefined || resolving.has(key)) return ''
    resolving.add(key)
    const parent = info.parentKey !== '' ? resolvePathOf(info.parentKey) : ''
    resolving.delete(key)
    const value = parent === '' ? info.name : parent + ' > ' + info.name
    paths.set(key, value)
    return value
  }
  for (const key of infoByKey.keys()) resolvePathOf(key)
  return paths
}

async function scanViaLocalApi(
  dataDir: string,
  options: ZoteroScanOptions,
  warnings: string[],
): Promise<ZoteroItemSummary[] | null> {
  const base = (options.apiBaseUrl ?? process.env.LITGRAPH_ZOTERO_API_URL ?? DEFAULT_LOCAL_API_BASE).replace(/\/+$/, '')
  const timeoutMs = Math.max(200, options.localApiTimeoutMs ?? LOCAL_API_TIMEOUT_MS)

  let firstPage: LocalApiResponse
  try {
    firstPage = await localApiGet(base, '/api/users/0/items?limit=' + LOCAL_API_PAGE + '&start=0&format=json', timeoutMs)
  } catch (error) {
    warnings.push('Zotero 本地 API 不可访问（' + errorMessage(error) + '），已改读 zotero.sqlite 副本')
    return null
  }
  if (firstPage.status === 403) {
    warnings.push('Zotero 没有开启「允许其他应用程序通信」（本地 API 返回 HTTP 403），已改读 zotero.sqlite 副本')
    return null
  }
  if (firstPage.status !== 200) {
    warnings.push('Zotero 本地 API 返回 HTTP ' + firstPage.status + '，已改读 zotero.sqlite 副本')
    return null
  }
  if (!Array.isArray(firstPage.body)) {
    warnings.push('Zotero 本地 API 响应不是 JSON 数组，已改读 zotero.sqlite 副本')
    return null
  }

  const topLevel: unknown[] = [...firstPage.body]
  let hasMore = firstPage.body.length >= LOCAL_API_PAGE
  let start = LOCAL_API_PAGE
  while (hasMore && topLevel.length < LOCAL_API_MAX_ITEMS) {
    let page: LocalApiResponse
    try {
      page = await localApiGet(base, '/api/users/0/items?limit=' + LOCAL_API_PAGE + '&start=' + start + '&format=json', timeoutMs)
    } catch (error) {
      warnings.push('Zotero 本地 API 分页读取中断（' + errorMessage(error) + '），只扫描了前 ' + topLevel.length + ' 条')
      break
    }
    if (page.status !== 200 || !Array.isArray(page.body)) {
      warnings.push('Zotero 本地 API 分页读取中断（HTTP ' + page.status + '），只扫描了前 ' + topLevel.length + ' 条')
      break
    }
    topLevel.push(...page.body)
    hasMore = page.body.length >= LOCAL_API_PAGE
    start += LOCAL_API_PAGE
  }
  if (topLevel.length >= LOCAL_API_MAX_ITEMS) {
    warnings.push('Zotero 条目超过 ' + LOCAL_API_MAX_ITEMS + ' 条，本地 API 模式只扫描前 ' + LOCAL_API_MAX_ITEMS + ' 条')
  }

  // Collections: key -> full path.
  let collectionPathsByKey = new Map<string, string>()
  try {
    const rawCollections = await fetchLocalApiPages(
      base,
      (pageStart) => '/api/users/0/collections?limit=' + LOCAL_API_PAGE + '&start=' + pageStart + '&format=json',
      timeoutMs,
      warnings,
      'Zotero 分类目录',
    )
    if (rawCollections !== null) {
      const entries = rawCollections
        .map((entry) => toLocalApiCollectionEntry(entry))
        .filter((entry): entry is LocalApiCollectionEntry => entry !== null)
      collectionPathsByKey = buildApiCollectionPaths(entries)
    } else {
      warnings.push('本地 API 未能读取 Zotero 分类目录，条目将不带 Zotero 分类')
    }
  } catch (error) {
    warnings.push('本地 API 未能读取 Zotero 分类目录（' + errorMessage(error) + '），条目将不带 Zotero 分类')
  }

  // Attachments: itemType=attachment returns child items with parentItem.
  const attachmentCandidates: AttachmentCandidate[] = []
  try {
    const rawAttachments = await fetchLocalApiPages(
      base,
      (pageStart) =>
        '/api/users/0/items?itemType=attachment&limit=' + LOCAL_API_PAGE + '&start=' + pageStart + '&format=json',
      timeoutMs,
      warnings,
      'Zotero 附件列表',
    )
    if (rawAttachments === null) {
      warnings.push('本地 API 未能读取附件列表，所有条目将显示为「无附件」')
    } else {
      for (const raw of rawAttachments) {
        const entry = toLocalApiEntry(raw)
        if (entry === null) continue
        const parentKey = asString(entry.data.parentItem)
        if (parentKey === '') continue
        const contentType = asString(entry.data.contentType)
        // The local API omits data.path for stored files; the storage key + filename is enough.
        const rawPath = asString(entry.data.path) || (asString(entry.data.filename) !== '' ? 'storage:' + asString(entry.data.filename) : '')
        const ref = resolveAttachmentRef(dataDir, entry.key, rawPath)
        if (ref.path === '' && ref.fileName === '') continue
        if (!looksLikePdf(contentType, ref.fileName)) continue
        attachmentCandidates.push({
          parentId: parentKey,
          key: entry.key,
          fileName: ref.fileName,
          resolvedPath: ref.path,
          score: scoreAttachment(contentType, ref.fileName),
          exists: false,
          size: 0,
        })
      }
    }
  } catch (error) {
    warnings.push('本地 API 未能读取附件列表（' + errorMessage(error) + '），所有条目将显示为「无附件」')
  }
  const attachmentByParent = await pickBestAttachments(attachmentCandidates, warnings)

  const summaries: ZoteroItemSummary[] = []
  for (const raw of topLevel) {
    const entry = toLocalApiEntry(raw)
    if (entry === null || !PAPER_ITEM_TYPES.has(entry.itemType)) continue
    const data = entry.data
    const title = asString(data.title).trim() || '(未命名 Zotero 条目)'
    let venue = ''
    for (const fieldName of VENUE_FIELDS) {
      const value = asString(data[fieldName]).trim()
      if (value !== '') {
        venue = value
        break
      }
    }
    const creators: string[] = []
    const rawCreators = data.creators
    if (Array.isArray(rawCreators)) {
      for (const rawCreator of rawCreators) {
        if (rawCreator === null || typeof rawCreator !== 'object') continue
        const creator = rawCreator as Record<string, unknown>
        const name = asString(creator.name).trim()
        const formatted =
          name !== '' ? name : formatCreatorName(asString(creator.firstName), asString(creator.lastName), false)
        if (formatted !== '') creators.push(formatted)
      }
    }
    const tags: string[] = []
    const rawTags = data.tags
    if (Array.isArray(rawTags)) {
      for (const rawTag of rawTags) {
        if (rawTag === null || typeof rawTag !== 'object') continue
        const tag = asString((rawTag as Record<string, unknown>).tag).trim()
        if (tag !== '') tags.push(tag)
      }
    }
    const collections: string[] = []
    const rawCollections = data.collections
    if (Array.isArray(rawCollections)) {
      for (const rawKey of rawCollections) {
        const path = collectionPathsByKey.get(asString(rawKey)) ?? ''
        if (path !== '') collections.push(path)
      }
    }
    summaries.push({
      key: entry.key,
      itemType: entry.itemType,
      title,
      creators,
      year: parseZoteroYear(asString(data.date)),
      venue,
      doi: normalizeDoi(asString(data.DOI)),
      abstract: asString(data.abstractNote).trim(),
      tags,
      collections,
      attachment: attachmentByParent.get(entry.key) ?? null,
    })
  }
  if (summaries.length === 0) {
    warnings.push('本地 API 没有返回可导入的论文条目')
  }
  return summaries
}

/* -------------------------------------------------------------------------- */
/* Finalisation: sort + dedupe                                                 */
/* -------------------------------------------------------------------------- */

function finalizeItems(items: ZoteroItemSummary[], warnings: string[]): ZoteroItemSummary[] {
  const sorted = [...items].sort((left, right) => {
    const leftYear = left.year ?? -1
    const rightYear = right.year ?? -1
    if (leftYear !== rightYear) return rightYear - leftYear
    return left.title.localeCompare(right.title, 'zh-Hans-CN')
  })
  const seen = new Set<string>()
  const output: ZoteroItemSummary[] = []
  let duplicates = 0
  for (const item of sorted) {
    if (seen.has(item.key)) {
      duplicates += 1
      continue
    }
    seen.add(item.key)
    output.push(item)
  }
  if (duplicates > 0) warnings.push('检测到 ' + duplicates + ' 条重复 key 的 Zotero 条目（多库同名），已只保留一条')
  return output
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

let lastScan: ZoteroScanResult | null = null
let lastScanAt = 0

/** Drop the cached previous scan (used by tests; normal flows re-scan on import). */
export function invalidateZoteroScanCache(): void {
  lastScan = null
  lastScanAt = 0
}

/**
 * Scan the local Zotero library.
 *
 * Tries the Zotero 7 local API first (fast, live), then falls back to a private
 * sql.js read of a temp copy of zotero.sqlite. Never throws for a *degradable*
 * problem such as "local API disabled" or "one attachment file missing" — those
 * become entries in warnings.
 */
export async function scanZoteroLibrary(options: ZoteroScanOptions = {}): Promise<ZoteroScanResult> {
  const warnings: string[] = []
  const dataDir = await resolveZoteroDataDir(options.dataDir, warnings)
  let items: ZoteroItemSummary[] | null = null
  let source: 'local-api' | 'sqlite' = 'sqlite'
  if (options.preferLocalApi !== false) {
    items = await scanViaLocalApi(dataDir, options, warnings)
    if (items !== null) source = 'local-api'
  }
  if (items === null) {
    items = await scanViaSqlite(dataDir, warnings)
  }
  const result: ZoteroScanResult = {
    ok: true,
    dataDir,
    source,
    items: finalizeItems(items, warnings),
    warnings: dedupeWarnings(warnings),
  }
  lastScan = result
  lastScanAt = Date.now()
  return result
}

/**
 * Import the selected Zotero items into LitGraph.
 *
 * mode 'pdf'  — copy the Zotero PDF into a temp file and hand it to deps.importFile
 *               (full parse + LLM). Items without a usable PDF fall back to
 *               deps.importMetadata so a selection is never silently dropped.
 * mode 'meta' — import records only (no PDF).
 *
 * A failing item is reported in skipped[] and does not abort the rest.
 * The optional 4th argument is an additive extension used by the host route.
 */
export async function importZoteroSelection(
  keys: string[],
  mode: ZoteroImportMode,
  deps: ZoteroDeps,
  options: { dataDir?: string } = {},
): Promise<ZoteroImportResult> {
  if (mode !== 'pdf' && mode !== 'meta') {
    throw new ZoteroScanError('INVALID_MODE', '未知的导入模式：' + String(mode))
  }
  const wanted = [...new Set(keys.filter((key) => typeof key === 'string').map((key) => key.trim()).filter((key) => key !== ''))]
  if (wanted.length === 0) return { ok: true, accepted: [], skipped: [] }

  const cachedDataDir =
    options.dataDir === undefined && lastScan !== null && Date.now() - lastScanAt < SCAN_CACHE_MS ? lastScan.dataDir : undefined
  const scan = await scanZoteroLibrary({ dataDir: options.dataDir ?? cachedDataDir })
  const byKey = new Map<string, ZoteroItemSummary>(scan.items.map((item) => [item.key, item]))

  const accepted: ZoteroImportAccepted[] = []
  const skipped: ZoteroImportSkipped[] = []
  const importDir = join(tmpdir(), 'litgraph-zotero-import-' + randomUUID().replace(/-/g, '').slice(0, 10))
  await mkdir(importDir, { recursive: true })
  try {
    for (const key of wanted) {
      const item = byKey.get(key)
      if (item === undefined) {
        skipped.push({ key, reason: 'Zotero 中没有找到这条记录（可能已删除或类型不受支持）' })
        continue
      }
      try {
        if (mode === 'pdf' && item.attachment !== null && item.attachment.path !== '') {
          const fileName = safeFileName(item.attachment.fileName || basename(item.attachment.path))
          const tmpPath = join(importDir, key + '-' + fileName)
          await copyFile(item.attachment.path, tmpPath)
          let size = item.attachment.size
          if (!(size > 0)) {
            const info = await statQuiet(tmpPath)
            size = info !== null ? info.size : 0
          }
          const result = await deps.importFile(tmpPath, fileName, size, {
            zoteroKey: item.key,
            attachmentKey: item.attachment.key,
          })
          accepted.push({ key, paperId: result.paperId, jobId: result.jobId })
        } else {
          const result = await deps.importMetadata(item)
          accepted.push({ key, paperId: result.paperId })
        }
      } catch (error) {
        skipped.push({ key, reason: errorMessage(error) })
      }
    }
  } finally {
    await rm(importDir, { recursive: true, force: true }).catch(() => undefined)
  }
  return { ok: true, accepted, skipped }
}
