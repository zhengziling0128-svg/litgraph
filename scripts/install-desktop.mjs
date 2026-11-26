#!/usr/bin/env node
/**
 * Point the live DeepSeek Harness desktop profile at this plugin, idempotently.
 *
 * What it does
 *  1. makes sure <profile>/cordis.patch.yml has exactly one `insert` entry for
 *     this plugin (id: litgraph -> <repo>/lib/index.js), repairing the block if it
 *     is missing or points somewhere stale;
 *  2. compares the sha256 of lib/index.js with the hash the live host reports
 *     (GET /api/litgraph/status -> hostHash), so client-only rebuilds no longer
 *     look like a required restart. Falls back to build stamps on older hosts.
 *
 * The desktop app picks a fresh web port on every launch (55992, 58354, ...), so
 * when --port is omitted the script asks every local listening port for
 * /api/litgraph/status and uses the first one that answers like LitGraph.
 *
 * Why a restart may still be needed: the desktop host imports the host half once.
 * dsh's HMR can add brand-new patch entries to a running host, but it cannot
 * hot-swap the module behind an already-running entry (verified 2026-11-25:
 * renames/removals of an insert entry are ignored until restart). So:
 *   - client-half changes (lib/client.js)      -> user hits Ctrl+R in the app
 *   - host-half changes   (lib/index.js)       -> quit & reopen the app once
 *
 * Usage: node scripts/install-desktop.mjs [--patch <cordis.patch.yml>] [--port 58354]
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entryFile = resolve(root, 'lib/index.js')

function arg(name) {
  const index = process.argv.indexOf('--' + name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null
}

const patchPath = resolve(arg('patch') ?? join(process.env.USERPROFILE ?? '', '.dsh', 'profiles', 'desktop', 'cordis.patch.yml'))
const explicitPort = arg('port')

if (!existsSync(entryFile)) {
  console.error('lib/index.js missing — run "npm run build" first')
  process.exit(1)
}
if (!existsSync(patchPath)) {
  console.error('profile patch not found: ' + patchPath)
  process.exit(1)
}

// -- 1. keep the profile patch pointing at this checkout ----------------------
const entryPath = entryFile.replace(/\\/g, '/')
const block = [
  '# --- litgraph plugin (managed by dsh-litgraph/scripts/install-desktop.mjs) ---',
  '- insert:',
  '    - id: litgraph',
  "      name: '" + entryPath + "'",
].join('\n')

let patch = await readFile(patchPath, 'utf8')
const blockPattern = /# --- litgraph plugin[^\n]*\n(?:[^\n#][^\n]*\n)*?\s*name: '[^']*'\n/
if (blockPattern.test(patch)) patch = patch.replace(blockPattern, block + '\n')
else patch = patch.replace(/\n*$/, '\n') + '\n' + block + '\n'
await writeFile(patchPath, patch)
console.log('profile patch:  ' + patchPath)
console.log('plugin entry:   ' + entryPath)

// -- 2. compare the shipped host bundle with the live host -------------------
const bundle = await readFile(entryFile)
const diskBuild = /PLUGIN_BUILD = "([^"]+)"/.exec(bundle.toString('utf8'))?.[1] ?? 'unknown'
const diskHash = createHash('sha256').update(bundle).digest('hex').slice(0, 16)
console.log('disk build:     ' + diskBuild)
console.log('disk hash:      ' + diskHash)

async function statusOf(port) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 600)
    const response = await fetch('http://127.0.0.1:' + port + '/api/litgraph/status', { signal: controller.signal })
    clearTimeout(timer)
    if (!response.ok) return null
    const body = await response.json()
    return body && body.ok === true ? body : null
  } catch {
    return null
  }
}

/** pid -> executable name, to tell the desktop app apart from CLI test hosts. */
function processNames() {
  const names = new Map()
  try {
    const csv = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
    for (const line of csv.split(/\r?\n/)) {
      const cells = /^"([^"]+)","(\d+)"/.exec(line)
      if (cells !== null) names.set(Number(cells[2]), cells[1])
    }
  } catch {
    // ignore: process names are a preference, not a requirement
  }
  return names
}

/** Ask every local listening port whether it is a LitGraph host. */
async function detectLiveHost() {
  if (process.platform !== 'win32') return null
  let out = ''
  try {
    out = execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true })
  } catch {
    return null
  }
  const portPid = new Map()
  for (const line of out.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue
    const match = /\s(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|\[::1\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)/i.exec(line)
    if (match !== null) portPid.set(Number(match[1]), Number(match[2]))
  }
  const names = processNames()
  const homeRoot = resolve(process.env.USERPROFILE ?? '', '.dsh', 'litgraph').toLowerCase()
  const candidates = [...portPid.keys()].filter((port) => port > 1024).sort((a, b) => a - b)
  const found = await Promise.all(
    candidates.map(async (port) => {
      const status = await statusOf(port)
      const pid = portPid.get(port)
      const name = pid === undefined ? '' : names.get(pid) ?? ''
      const dataRoot = typeof status?.storage?.dataRoot === 'string' ? resolve(status.storage.dataRoot).toLowerCase() : ''
      return { port, status, name, home: dataRoot === homeRoot, desktop: /deepseek harness/i.test(name) }
    }),
  )
  const hits = found.filter((entry) => entry.status !== null)
  if (hits.length === 0) return null
  // Preference: the user's real library (~/.dsh/litgraph) beats this repo's
  // throwaway CLI test hosts, which live under .\e2e\... .

  const preferred = hits.find((entry) => entry.home) ?? hits.find((entry) => entry.desktop) ?? hits[0]
  if (hits.length > 1) {
    console.log('note:            ' + hits.length + ' LitGraph hosts answered (' + hits.map((entry) => entry.port).join(', ') + '); using ' + preferred.port)
  }
  return { port: preferred.port, status: preferred.status }
}

let live = null
if (explicitPort !== null) {
  live = { port: Number(explicitPort), status: await statusOf(Number(explicitPort)) }
} else {
  const guarded = await statusOf(55992)
  live = guarded !== null ? { port: 55992, status: guarded } : await detectLiveHost()
}

if (live === null || live.status === null) {
  console.log('live host:      not reachable (desktop app closed?)')
} else if (typeof live.status.hostHash === 'string' && live.status.hostHash !== '') {
  if (live.status.hostHash === diskHash) {
    console.log('live host:      port ' + live.port + ', ' + (live.status.build ?? 'unknown') + '  (host half up to date, hash ' + diskHash + ')')
  } else {
    console.log('live host:      port ' + live.port + ', ' + (live.status.build ?? 'unknown') + '  (hash ' + live.status.hostHash + ' != disk ' + diskHash + ')')
    console.log('ACTION: quit & reopen DeepSeek Harness once to load the new host half;')
    console.log('        client-only changes just need Ctrl+R in the LitGraph window.')
  }
} else if (live.status.build === diskBuild) {
  console.log('live host:      port ' + live.port + ', ' + diskBuild + '  (host half up to date; legacy host without hash)')
} else {
  console.log('live host:      port ' + live.port + ', ' + (live.status.build ?? 'pre-stamp build') + '  (legacy host without hash)')
  console.log('ACTION: quit & reopen DeepSeek Harness once to load the new host half;')
  console.log('        client-only changes just need Ctrl+R in the LitGraph window.')
}
