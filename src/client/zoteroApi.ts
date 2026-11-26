/**
 * Client half of the Zotero bridge.
 *
 * Mirrors src/host/zotero.ts (keep both in sync). The host registers
 * POST /api/litgraph/zotero/scan and POST /api/litgraph/zotero/import
 * (wired by the host entry point); this module is the only place the
 * Zotero dialog talks to them.
 */
import { ApiError } from './api'

export interface ZoteroAttachment {
  fileName: string
  size: number
  /** Absolute path of the PDF, '' when the file is missing on disk. */
  path: string
}

export interface ZoteroItemSummary {
  key: string
  itemType: string
  title: string
  creators: string[]
  year: number | null
  venue: string
  doi: string
  abstract: string
  tags: string[]
  collections: string[]
  attachment: ZoteroAttachment | null
}

export interface ZoteroScanResult {
  ok: true
  dataDir: string
  source: 'local-api' | 'sqlite'
  items: ZoteroItemSummary[]
  warnings: string[]
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

export const ZOTERO_SCAN_ROUTE = '/api/litgraph/zotero/scan'
export const ZOTERO_IMPORT_ROUTE = '/api/litgraph/zotero/import'

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function readErrorMessage(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>
  for (const field of ['error', 'message', 'hint']) {
    const value = record[field]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('无法连接 LitGraph 宿主（' + describe(error) + '）', 0)
  }
  let text = ''
  try {
    text = await response.text()
  } catch {
    text = ''
  }
  let payload: unknown = null
  if (text.trim() !== '') {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }
  if (!response.ok) {
    const message = readErrorMessage(payload) || 'HTTP ' + response.status + (text.trim() !== '' ? ' · ' + text.trim().slice(0, 200) : '')
    throw new ApiError(message, response.status)
  }
  if (payload === null || typeof payload !== 'object') {
    throw new ApiError('宿主返回了空的 Zotero 响应', response.status)
  }
  return payload as T
}

/** Scan the local Zotero library (host side: local API first, then a sql.js copy of zotero.sqlite). */
export function scanZoteroLibrary(signal?: AbortSignal): Promise<ZoteroScanResult> {
  return postJson<ZoteroScanResult>(ZOTERO_SCAN_ROUTE, {}, signal)
}

/** Import the selected item keys. mode 'pdf' parses PDFs; missing PDFs fall back to record import. */
export function importZoteroSelection(
  keys: string[],
  mode: ZoteroImportMode,
  signal?: AbortSignal,
): Promise<ZoteroImportResult> {
  return postJson<ZoteroImportResult>(ZOTERO_IMPORT_ROUTE, { keys, mode }, signal)
}
