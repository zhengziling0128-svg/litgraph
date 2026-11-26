/**
 * Build stamp + content hash for the host half.
 *
 * - PLUGIN_BUILD: timestamp baked in at build time (tsdown define). Handy for
 *   eyeballing which build a live host runs via GET /api/litgraph/status.
 * - hostBundleHash(): sha256 of the module file actually loaded by the host
 *   process (16 hex chars). scripts/install-desktop.mjs compares it with the
 *   live status so a client-only rebuild no longer looks like "restart needed".
 *
 * Why this matters: the desktop host imports the host half once; HMR can add
 * new patch entries but cannot hot-swap an already-loaded module, so the only
 * accurate "is the host up to date?" signal is the file hash of the live bundle.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

declare const __LITGRAPH_BUILD__: string | undefined

export const PLUGIN_BUILD = typeof __LITGRAPH_BUILD__ === 'string' ? __LITGRAPH_BUILD__ : 'dev'

let hostHashPromise: Promise<string> | null = null

/** sha256 (first 16 hex chars) of the live host bundle, or '' when unknown. */
export function hostBundleHash(): Promise<string> {
  if (hostHashPromise === null) {
    hostHashPromise = (async () => {
      try {
        if (import.meta.url.startsWith('file:')) {
          const bytes = await readFile(fileURLToPath(import.meta.url))
          return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
        }
      } catch {
        // ignore: the status route still works without a hash
      }
      return ''
    })()
  }
  return hostHashPromise
}
