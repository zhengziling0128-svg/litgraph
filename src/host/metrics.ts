/**
 * easyScholar journal metrics.
 *
 * A module-level client keeps every HTTP request serialised (>=550ms apart) and
 * caches per-venue answers for 30 days, so importing a batch of papers never
 * hammers the public endpoint. All failures are soft: callers decide whether to
 * ignore them or annotate the paper.
 */
import type { JournalMetrics } from './types.js'
import { delay, errorMessage, nowIso } from './util.js'

/** No built-in key: set LITGRAPH_EASYSCHOLAR_KEY or the library setting `metricsSecretKey`. */
export const METRICS_DEFAULT_SECRET_KEY = ''

const API_ENDPOINT = 'https://www.easyscholar.cc/open/getPublicationRank'
const MIN_REQUEST_INTERVAL_MS = 550
const RETRY_DELAY_MS = 700
/** One initial attempt plus at most three retries for the 40006 rate-limit code. */
const MAX_ATTEMPTS = 4
const REQUEST_TIMEOUT_MS = 15_000
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type MetricsErrorCode = 'BAD_VENUE' | 'NOT_FOUND' | 'RATE_LIMITED' | 'HTTP_ERROR' | 'INVALID_RESPONSE' | 'NETWORK'

export class MetricsError extends Error {
  readonly code: MetricsErrorCode

  constructor(code: MetricsErrorCode, message: string) {
    super(message)
    this.name = 'MetricsError'
    this.code = code
  }
}

export interface JournalMetricsOptions {
  /** Bypass the 30-day cache (used by the debug probe route). */
  force?: boolean
}

/** Settings override the configured key; the built-in key is the last resort. */
export function metricsSecretKeyFor(
  config: { metricsSecretKey?: string },
  settings?: { metricsSecretKey?: string },
): string {
  const fromSettings = typeof settings?.metricsSecretKey === 'string' ? settings.metricsSecretKey.trim() : ''
  if (fromSettings !== '') return fromSettings
  const fromConfig = typeof config.metricsSecretKey === 'string' ? config.metricsSecretKey.trim() : ''
  return fromConfig !== '' ? fromConfig : METRICS_DEFAULT_SECRET_KEY
}

/** LITGRAPH_METRICS_DISABLE=1 or settings.metricsEnabled=false stops background lookups. */
export function metricsEnabledFor(
  config: { metricsEnabled?: boolean },
  settings?: { metricsEnabled?: boolean },
): boolean {
  if (config.metricsEnabled === false) return false
  return settings?.metricsEnabled !== false
}

interface CacheEntry {
  at: number
  metrics: JournalMetrics | null
  reason: string
}

const cache = new Map<string, CacheEntry>()

/** Serialises the network work: only one lookup sequence runs at a time. */
let serial: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

function cacheKeyOf(venue: string): string {
  return venue.trim().toLowerCase()
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function mapMetrics(venue: string, all: Record<string, unknown>): JournalMetrics {
  const casSmallRaw = textOrNull(all.sciUpSmall)
  const casSmall = casSmallRaw === null ? null : casSmallRaw.replace(/[。.]+$/u, '').trim() || null
  const topRaw = textOrNull(all.sciUpTop)
  const metrics: JournalMetrics = {
    venue,
    impactFactor: numberOrNull(all.sciif),
    impactFactor5: numberOrNull(all.sciif5),
    jcrQuartile: textOrNull(all.sci),
    jci: numberOrNull(all.jci),
    casPartition: textOrNull(all.sciUp),
    casSmall,
    casTop: topRaw !== null && /top/i.test(topRaw),
    casBase: textOrNull(all.sciBase),
    esi: textOrNull(all.esi),
    source: 'easyscholar',
    fetchedAt: nowIso(),
  }
  // Some venues (conferences, unindexed names) answer HTTP 200 with an empty rank
  // object. Treat that as "not indexed" instead of storing an all-null metrics row.
  const hasData =
    metrics.impactFactor !== null ||
    metrics.impactFactor5 !== null ||
    metrics.jcrQuartile !== null ||
    metrics.jci !== null ||
    metrics.casPartition !== null ||
    metrics.casSmall !== null ||
    metrics.casBase !== null ||
    metrics.esi !== null ||
    metrics.casTop
  if (!hasData) throw new MetricsError('NOT_FOUND', 'journal not indexed by easyScholar')
  return metrics
}

function buildUrl(venue: string, secretKey: string): string {
  const params = new URLSearchParams({ secretKey, publicationName: venue })
  return API_ENDPOINT + '?' + params.toString()
}

/** Waits for the global request slot, then performs exactly one GET. */
async function requestOnce(url: string): Promise<unknown> {
  const waitMs = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now()
  if (waitMs > 0) await delay(waitMs)
  lastRequestAt = Date.now()
  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    throw new MetricsError('NETWORK', 'easyScholar request failed: ' + errorMessage(error))
  }
  const text = await response.text().catch(() => '')
  if (!response.ok) throw new MetricsError('HTTP_ERROR', 'easyScholar HTTP ' + response.status)
  if (text.trim() === '') throw new MetricsError('INVALID_RESPONSE', 'easyScholar returned an empty body')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new MetricsError('INVALID_RESPONSE', 'easyScholar returned non-JSON')
  }
  return parsed
}

function extractRank(body: unknown): Record<string, unknown> {
  const payload = body as { code?: unknown; msg?: unknown; data?: unknown } | null
  const code = typeof payload?.code === 'number' ? payload.code : Number(payload?.code)
  if (code === 40006) throw new MetricsError('RATE_LIMITED', 'easyScholar rate limited (code 40006)')
  if (code !== 200) {
    const message =
      typeof payload?.msg === 'string' && payload.msg.trim() !== ''
        ? payload.msg.trim()
        : 'easyScholar code ' + String(payload?.code)
    throw new MetricsError('INVALID_RESPONSE', message)
  }
  const officialRank = (payload?.data as { officialRank?: unknown } | null | undefined)?.officialRank
  const all = (officialRank as { all?: unknown } | null | undefined)?.all
  if (all === null || typeof all !== 'object' || Array.isArray(all)) {
    throw new MetricsError('NOT_FOUND', 'journal not indexed by easyScholar')
  }
  return all as Record<string, unknown>
}

async function queryOnce(venue: string, secretKey: string): Promise<JournalMetrics> {
  const body = await requestOnce(buildUrl(venue, secretKey))
  return mapMetrics(venue, extractRank(body))
}

async function queryWithRetry(venue: string, secretKey: string): Promise<JournalMetrics> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await queryOnce(venue, secretKey)
    } catch (error) {
      const retryable = error instanceof MetricsError && error.code === 'RATE_LIMITED'
      if (!retryable || attempt === MAX_ATTEMPTS) throw error
      await delay(RETRY_DELAY_MS)
    }
  }
  throw new MetricsError('NETWORK', 'easyScholar request failed')
}

/**
 * Look up one venue, honouring the 30-day cache unless options.force is set.
 * Throws MetricsError on failure (callers treat metrics as best effort).
 */
export async function fetchJournalMetrics(
  venue: string,
  secretKey: string,
  options: JournalMetricsOptions = {},
): Promise<JournalMetrics> {
  const clean = venue.trim()
  if (clean === '') throw new MetricsError('BAD_VENUE', 'venue is empty')
  if (secretKey.trim() === '') throw new MetricsError('INVALID_RESPONSE', 'easyScholar secret key is not configured')
  const key = cacheKeyOf(clean)
  if (options.force !== true) {
    const cached = cache.get(key)
    if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) {
      if (cached.metrics !== null) return cached.metrics
      throw new MetricsError('NOT_FOUND', cached.reason)
    }
  }
  const run = (): Promise<JournalMetrics> => queryWithRetry(clean, secretKey)
  const queued = serial.then(run, run)
  serial = queued.then(
    () => undefined,
    () => undefined,
  )
  try {
    const metrics = await queued
    cache.set(key, { at: Date.now(), metrics, reason: '' })
    return metrics
  } catch (error) {
    // Only "journal has no rank data" is a stable answer worth remembering.
    if (error instanceof MetricsError && error.code === 'NOT_FOUND') {
      cache.set(key, { at: Date.now(), metrics: null, reason: error.message })
    }
    throw error
  }
}

export function clearMetricsCache(): void {
  cache.clear()
}

export function metricsCacheSize(): number {
  return cache.size
}
