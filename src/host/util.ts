/**
 * Small filesystem / text helpers shared by the host modules.
 *
 * Everything here is dependency free on purpose: third-party plugins installed into
 * a DSH profile cannot resolve the official @deepseek-ai/* helper packages (they live
 * inside app.asar), so the host half stays self-contained.
 */
import { mkdir, open, rename, readFile, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

export function nowIso(): string {
  return new Date().toISOString()
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

/** write temp file in the same directory, fsync, then rename over the target. */
export async function atomicWriteFile(file: string, data: string | Uint8Array): Promise<void> {
  await ensureDir(dirname(file))
  const tmp = file + '.tmp-' + process.pid + '-' + randomUUID().slice(0, 8)
  const handle = await open(tmp, 'w')
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(tmp, file)
  } catch (error) {
    try {
      await unlink(tmp)
    } catch {
      // best effort
    }
    throw error
  }
}

export async function readJsonFile<T>(file: string): Promise<T | null> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  return JSON.parse(raw) as T
}

export async function pathExists(file: string): Promise<boolean> {
  try {
    await readFile(file)
    return true
  } catch {
    return false
  }
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  // Absent query parameters arrive as null and Number(null) is 0, which would be
  // clamped up to min instead of falling back — treat missing values explicitly.
  if (value === null || value === undefined || value === '') return fallback
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

export function normalizeSpace(text: string): string {
  return text.replace(/\u0000/g, ' ').replace(/[\t ]+/g, ' ').trim()
}

export function uniqueStrings(values: unknown, max = 64): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = normalizeSpace(value)
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(trimmed)
    if (output.length >= max) break
  }
  return output
}

export function safeFileStem(name: string): string {
  const stem = name.replace(/\.[A-Za-z0-9]{1,6}$/, '').replace(/[_]+/g, ' ')
  return normalizeSpace(stem) || 'untitled'
}

/** cut on a paragraph boundary when possible so the LLM sees complete sentences. */
export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  const slice = text.slice(0, maxChars)
  const boundary = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '))
  const cut = boundary > maxChars * 0.6 ? boundary : maxChars
  return { text: text.slice(0, cut).trimEnd() + '\n\n[...truncated...]', truncated: true }
}

/** LLMs occasionally wrap JSON in a fence or add prose around it. */
export function parseJsonLoose(raw: string): unknown {
  let text = raw.trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced !== null && typeof fenced[1] === 'string') text = fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) text = text.slice(start, end + 1)
  return JSON.parse(text) as unknown
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { code?: unknown }).code
    if (typeof candidate === 'string') return candidate
    const failure = (error as { failure?: { code?: unknown } }).failure
    if (failure && typeof failure.code === 'string') return failure.code
  }
  return 'ERR'
}
