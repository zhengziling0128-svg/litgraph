/**
 * Opening a stored paper in the user's desktop apps.
 *
 * Zotero-attached imports open the Zotero PDF through the zotero:// protocol
 * (the attachment key is authoritative). Everything else goes to RetainPDF when
 * its desktop executable is installed: RetainPDF imports the path into its own
 * library and shows its reader, the same hand-off its Zotero integration uses.
 * Anything else opens with the OS default reader. Failures are returned as data,
 * never thrown, so the route answers with {ok:false,error} instead of a 500.
 */
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { LibraryStore } from './store.js'
import type { StoredPaper } from './types.js'
import { errorMessage } from './util.js'
import { markZoteroRead } from './zotero-local.js'

export type OpenVia = 'zotero' | 'retainpdf' | 'file' | 'none'

export interface OpenSuccess {
  ok: true
  via: 'zotero' | 'retainpdf' | 'file'
  paperId: string
  target: string
}

export interface OpenFailure {
  ok: false
  via: OpenVia
  paperId: string
  error: string
}

export type OpenOutcome = OpenSuccess | OpenFailure

export interface OpenOptions {
  /** Override the platform (tests). */
  platform?: NodeJS.Platform
  /** Override child_process.spawn (tests). */
  spawnFn?: typeof spawn
  /** How long to wait for the spawn attempt to report success/failure. */
  spawnTimeoutMs?: number
  /** Explicit RetainPDF executable; an empty string disables RetainPDF (tests). */
  retainExePath?: string
  /** Explicit zotero.exe path; an empty string forces the protocol launch (tests). */
  zoteroExePath?: string
}

const ZOTERO_PDF_PREFIX = 'zotero://open-pdf/library/items/'

function zoteroTarget(attachmentKey: string): string {
  return ZOTERO_PDF_PREFIX + encodeURIComponent(attachmentKey)
}

function commandFor(target: string, platform: NodeJS.Platform): { command: string; args: string[] } {
  if (platform === 'win32') {
    // 'start' is a cmd builtin; the empty "" keeps the quoted target out of the window-title slot.
    return { command: 'cmd', args: ['/c', 'start', '', target] }
  }
  if (platform === 'darwin') return { command: 'open', args: [target] }
  return { command: 'xdg-open', args: [target] }
}

function launchProcess(command: string, args: string[], options: OpenOptions): Promise<void> {
  const spawnFn = options.spawnFn ?? spawn
  const timeoutMs = typeof options.spawnTimeoutMs === 'number' ? options.spawnTimeoutMs : 2000
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = (error?: Error): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      if (error === undefined) resolve()
      else reject(error)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawnFn(command, args, { detached: true, stdio: 'ignore' })
    } catch (error) {
      settle(error instanceof Error ? error : new Error(String(error)))
      return
    }
    child.once('error', (error: Error) => settle(error))
    child.once('spawn', () => {
      try {
        child.unref()
      } catch {
        /* launch succeeded; unref is best effort */
      }
      settle()
    })
    timer = setTimeout(() => settle(), timeoutMs)
  })
}

function launchTarget(target: string, options: OpenOptions): Promise<void> {
  const platform = options.platform ?? process.platform
  const { command, args } = commandFor(target, platform)
  return launchProcess(command, args, options)
}

async function resolveRetainExe(options: OpenOptions): Promise<string> {
  if (options.retainExePath !== undefined) return options.retainExePath
  if ((options.platform ?? process.platform) !== 'win32') return ''
  const localAppData = process.env.LOCALAPPDATA ?? ''
  const programFiles = process.env.ProgramFiles ?? process.env.ProgramW6432 ?? ''
  const candidates = [
    process.env.LITGRAPH_RETAINPDF_PATH ?? '',
    'H:\\retainPDF\\RetainPDF.exe',
    localAppData !== '' ? join(localAppData, 'Programs', 'RetainPDF', 'RetainPDF.exe') : '',
    programFiles !== '' ? join(programFiles, 'RetainPDF', 'RetainPDF.exe') : '',
  ]
  for (const candidate of candidates) {
    if (candidate === '') continue
    try {
      await access(candidate)
      return candidate
    } catch {
      /* keep looking */
    }
  }
  return ''
}

/** Locate zotero.exe so the zotero:// URL can be handed to a running Zotero without cmd. */
async function resolveZoteroExe(options: OpenOptions): Promise<string> {
  if (options.zoteroExePath !== undefined) return options.zoteroExePath
  if ((options.platform ?? process.platform) !== 'win32') return ''
  const programFiles = process.env.ProgramFiles ?? process.env.ProgramW6432 ?? ''
  const candidates = [
    process.env.LITGRAPH_ZOTERO_PATH ?? '',
    programFiles !== '' ? join(programFiles, 'Zotero', 'zotero.exe') : '',
  ]
  for (const candidate of candidates) {
    if (candidate === '') continue
    try {
      await access(candidate)
      return candidate
    } catch {
      /* keep looking */
    }
  }
  return ''
}
function quoteForCommandLine(value: string): string {
  return '"' + value.replace(/"/g, '\\"') + '"'
}

/**
 * Ask Windows to launch RetainPDF with the PDF path.
 *
 * The launch goes through WMI's Win32_Process.Create on purpose: the desktop app
 * forwards command-line arguments to its running instance over a Windows named
 * pipe, and a process started from this host runs inside a job object that may
 * not open that pipe (the hand-off then dies with "Access is denied"). Children
 * created by the WMI provider run outside that job, so the argument reaches the
 * app exactly like Zotero's own pdf handler does.
 */
async function launchRetainPdf(filePath: string, options: OpenOptions): Promise<boolean> {
  if (process.env.LITGRAPH_RETAINPDF_DISABLE === '1') return false
  const exe = await resolveRetainExe(options)
  if (exe === '') return false
  const commandLine = quoteForCommandLine(exe) + ' ' + quoteForCommandLine(filePath)
  const script =
    "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='" +
    commandLine.replace(/'/g, "''") +
    "'} | Out-Null"
  // Not detached: a detached powershell child in this host silently exits
  // without running -Command. The process is short-lived (one WMI call).
  const spawnFn = options.spawnFn ?? spawn
  const timeoutMs = typeof options.spawnTimeoutMs === 'number' ? options.spawnTimeoutMs : 4000
  return new Promise<boolean>((resolve) => {
    let settled = false
    const settle = (value: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => settle(false), timeoutMs)
    try {
      const child = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        stdio: 'ignore',
        windowsHide: true,
      })
      child.once('error', () => settle(false))
      child.once('spawn', () => settle(true))
    } catch {
      settle(false)
    }
  })
}

/**
 * Open a zotero:// URL in the running Zotero. Prefers `zotero.exe -url` through WMI
 * for the same job-object reason as RetainPDF; falls back to the OS protocol handler.
 */
async function launchZotero(target: string, options: OpenOptions): Promise<void> {
  const exe = await resolveZoteroExe(options)
  if (exe === '') {
    await launchTarget(target, options)
    return
  }
  const commandLine = quoteForCommandLine(exe) + ' -url ' + quoteForCommandLine(target)
  const script =
    "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='" +
    commandLine.replace(/'/g, "''") +
    "'} | Out-Null"
  const spawnFn = options.spawnFn ?? spawn
  const timeoutMs = typeof options.spawnTimeoutMs === 'number' ? options.spawnTimeoutMs : 4000
  const started = await new Promise<boolean>((resolve) => {
    let settled = false
    const settle = (value: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => settle(false), timeoutMs)
    try {
      const child = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        stdio: 'ignore',
        windowsHide: true,
      })
      child.once('error', () => settle(false))
      child.once('spawn', () => settle(true))
    } catch {
      settle(false)
    }
  })
  if (!started) await launchTarget(target, options)
}
/** Resolve the best target for a paper and hand it to the OS launcher. */
export async function openPaper(paper: StoredPaper, store: LibraryStore, options: OpenOptions = {}): Promise<OpenOutcome> {
  const attachmentKey = typeof paper.zotero?.attachmentKey === 'string' ? paper.zotero.attachmentKey.trim() : ''
  if (attachmentKey !== '') {
    const target = zoteroTarget(attachmentKey)
    try {
      await launchZotero(target, options)
    } catch (error) {
      return { ok: false, via: 'zotero', paperId: paper.id, error: errorMessage(error) }
    }
    // Record the read locally right away. Zotero maintains the attachment's own
    // lastRead; with a stored API key we also stamp the parent item so the
    // library's 修改日期 column reflects the read (Zotero never does that).
    try {
      const settings = await store.getSettings()
      const apiKey = settings.zoteroApiKey ?? ''
      const parentKey = typeof paper.zotero?.key === 'string' ? paper.zotero.key.trim() : ''
      const readAt = Math.floor(Date.now() / 1000)
      const zotero = { ...(paper.zotero ?? { key: '', attachmentKey }), lastRead: readAt }
      await store.updatePaper(paper.id, { zotero }, { touch: false })
      if (apiKey !== '') {
        const lastRead = await markZoteroRead(attachmentKey, apiKey, parentKey)
        const dateModified = parentKey === '' ? zotero.dateModified : new Date(Date.now()).toISOString()
        await store.updatePaper(paper.id, { zotero: { ...zotero, lastRead, dateModified } }, { touch: false })
      }
    } catch {
      /* read-time bookkeeping is best effort: opening the PDF already succeeded */
    }
    return { ok: true, via: 'zotero', paperId: paper.id, target }
  }
  if (paper.hasFile && (await store.hasSource(paper.sha256))) {
    const target = store.sourcePath(paper.sha256)
    if (await launchRetainPdf(target, options)) {
      return { ok: true, via: 'retainpdf', paperId: paper.id, target }
    }
    try {
      await launchTarget(target, options)
      return { ok: true, via: 'file', paperId: paper.id, target }
    } catch (error) {
      return { ok: false, via: 'file', paperId: paper.id, error: errorMessage(error) }
    }
  }
  if (paper.hasFile) {
    return { ok: false, via: 'none', paperId: paper.id, error: 'source pdf missing on disk' }
  }
  return { ok: false, via: 'none', paperId: paper.id, error: 'no file' }
}
