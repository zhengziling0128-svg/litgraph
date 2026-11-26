/**
 * Standalone browser harness for the Zotero import dialog (task-8 UI check).
 *
 * Bundled by scripts/zotero-ui-check.mjs with rolldown and served from a temp
 * http server. The host API and the scan payload are stubbed through
 * window.__zuiData / a window.fetch override, so the dialog can be exercised
 * (and screenshotted) without a running DSH host.
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { ZoteroImport } from '../src/client/components/ZoteroImport'

const zui: any = (window as any).__zui
const data: any = (window as any).__zuiData

function delay(ms: number): Promise<void> {
  return new Promise(function (resolve): void {
    setTimeout(resolve, ms)
  })
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status: status,
    headers: { 'content-type': 'application/json' },
  })
}

function isAborted(init?: RequestInit): boolean {
  return init !== undefined && init.signal !== undefined && init.signal !== null && init.signal.aborted === true
}

const nativeFetch = window.fetch.bind(window)
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.indexOf('/api/litgraph/zotero/scan') >= 0) {
    await delay(250)
    if (isAborted(init)) throw new DOMException('The operation was aborted.', 'AbortError')
    if (zui.failScan) return jsonResponse({ error: data.scanError }, 422)
    return jsonResponse(data.scan, 200)
  }
  if (url.indexOf('/api/litgraph/zotero/import') >= 0) {
    await delay(200)
    if (isAborted(init)) throw new DOMException('The operation was aborted.', 'AbortError')
    if (zui.failImport) return jsonResponse({ error: data.importError }, 500)
    return jsonResponse(data.import, 200)
  }
  return nativeFetch(input as RequestInfo, init)
}

function App(): React.ReactElement {
  const [open, setOpen] = React.useState<boolean>(true)
  return React.createElement(
    'div',
    { id: 'theme-root', className: 'lg-root', 'data-lg-theme': 'dark' },
    React.createElement(ZoteroImport, {
      open: open,
      onClose: function (): void {
        zui.closed = true
        setOpen(false)
      },
      onImported: function (count: number): void {
        zui.imported = count
      },
      onToast: function (kind: string, message: string): void {
        zui.toasts.push(String(kind) + ':' + message)
      },
    }),
    open === false
      ? React.createElement(
          'button',
          {
            id: 'reopen-zotero',
            onClick: function (): void {
              setOpen(true)
            },
          },
          '重新打开 Zotero 导入',
        )
      : null,
  )
}

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('missing #root')
createRoot(rootElement).render(React.createElement(App))
