/**
 * Client half version shown in the footer.
 *
 * Injected by tsdown from package.json at build time. It deliberately does not
 * come from /api/litgraph/status: after a client-only rebuild the footer should
 * already show the new version even when the host process still runs the old
 * bundle (that one needs an app restart). Both values are visible in /status
 * (`version` and `hostHash`) for the update diagnostics.
 */
declare const __LITGRAPH_VERSION__: string | undefined

export const PLUGIN_VERSION = typeof __LITGRAPH_VERSION__ === 'string' ? __LITGRAPH_VERSION__ : 'dev'
