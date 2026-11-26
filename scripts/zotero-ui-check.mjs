#!/usr/bin/env node
/**
 * Headless UI check + screenshots for the Zotero import dialog (task-8).
 *
 * Bundles scripts/zotero-ui-harness.ts with rolldown (no JSX, React.createElement
 * only), serves it from a temp http server, drives a throwaway headless Edge over
 * CDP (own debugging port / temp profile; never touches the real browser or the
 * running LitGraph hosts), stubs the Zotero host routes through window.fetch and
 * asserts on the rendered DOM. Screenshots are written to
 * ./.probe/zotero-ui/*.png.
 *
 * Usage:  node scripts/zotero-ui-check.mjs
 * Env:    ZOTERO_UI_CDP_PORT (default 9334), ZOTERO_UI_CDP_PORT fallback 9335
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EDGE = process.env.ZOTERO_UI_EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const SHOT_DIR = process.env.ZOTERO_UI_SHOT_DIR ?? path.join(ROOT, '.probe', 'zotero-ui')
const CDP_PORT = Number(process.env.ZOTERO_UI_CDP_PORT || '9334')

const SCAN_RESULT = {
  ok: true,
  dataDir: 'C:\\Zotero\\storage',
  source: 'sqlite',
  items: [
    {
      key: 'PDF00001',
      itemType: 'journalArticle',
      title: 'Physics-informed Gaussian process regression for tool wear monitoring',
      creators: ['Wei Zhang', 'Li Chen', 'Ming Sun', 'Qiang Wang'],
      year: 2026,
      venue: 'Mechanical Systems and Signal Processing',
      doi: '10.1016/j.ymssp.2025.112233',
      abstract: '',
      tags: ['tool wear', 'Gaussian process'],
      collections: ['智能加工 > 刀具磨损'],
      attachment: { fileName: 'Physics-informed monitoring.pdf', size: 3565158, path: 'C:/mock/1.pdf' },
    },
    {
      key: 'PDF00002',
      itemType: 'conferencePaper',
      title: 'Open-set tool condition monitoring of end mills',
      creators: ['Yihao Bai'],
      year: 2025,
      venue: 'CIRP CMS 2025',
      doi: '10.1016/j.procir.2025.01.002',
      abstract: 'Open-set monitoring.',
      tags: [],
      collections: [],
      attachment: { fileName: 'open-set.pdf', size: 2411724, path: 'C:/mock/2.pdf' },
    },
    {
      key: 'MISSING3',
      itemType: 'book',
      title: 'Milling Tool Wear Prediction Framework',
      creators: ['Grace Hopper', 'Alan Turing', 'Ada Lovelace', 'Edsger Dijkstra'],
      year: null,
      venue: 'Mock Press',
      doi: '',
      abstract: '',
      tags: [],
      collections: [],
      attachment: { fileName: 'missing-book.pdf', size: 0, path: '' },
    },
    {
      key: 'NOPDF004',
      itemType: 'webpage',
      title: 'Zotero 官方文档',
      creators: [],
      year: 2024,
      venue: '',
      doi: '',
      abstract: '',
      tags: [],
      collections: [],
      attachment: null,
    },
    {
      key: 'PDF00005',
      itemType: 'thesis',
      title: '复杂孔加工自动工艺规划方法研究',
      creators: ['张三', '李四'],
      year: 2018,
      venue: '哈尔滨工业大学',
      doi: '',
      abstract: '',
      tags: [],
      collections: ['智能加工'],
      attachment: { fileName: '博士论文.pdf', size: 5347738, path: 'C:/mock/5.pdf' },
    },
    {
      key: 'PDF00006',
      itemType: 'preprint',
      title: 'A long preprint title about starry literature knowledge graphs and automatic taxonomy curation',
      creators: ['Alice Example', 'Bob Example'],
      year: 2022,
      venue: 'arXiv',
      doi: '',
      abstract: '',
      tags: [],
      collections: [],
      attachment: null,
    },
  ],
  warnings: [
    'Zotero 没有开启「允许其他应用程序通信」（本地 API 返回 HTTP 403），已改读 zotero.sqlite 副本',
    '已跳过 44 条非论文型 Zotero 条目（笔记、附件、软件等）',
  ],
}

const IMPORT_RESULT = {
  ok: true,
  accepted: [
    { key: 'PDF00001', paperId: 'p_mock_pdf_1', jobId: 'job_mock_1' },
    { key: 'PDF00005', paperId: 'p_mock_pdf_5' },
  ],
  skipped: [{ key: 'PDF00002', reason: 'Zotero 中的 PDF 附件在磁盘上找不到' }],
}

const PAYLOAD = {
  scan: SCAN_RESULT,
  import: IMPORT_RESULT,
  scanError: '指定的 Zotero 数据目录里没有 zotero.sqlite：C:\\Zotero\\storage',
  importError: 'Zotero 导入失败：模拟的宿主错误',
}

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined || detail === '' ? '' : '  ::  ' + String(detail)))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function bundleHarness(outDir) {
  const rolldown = await import('rolldown')
  const entry = path.join(ROOT, 'scripts', 'zotero-ui-harness.ts')
  await rolldown.build({
    input: entry,
    platform: 'browser',
    transform: { define: { 'process.env.NODE_ENV': "'production'" } },
    output: { file: path.join(outDir, 'bundle.js'), format: 'iife', codeSplitting: false },
  })
}

function makeHtml(payload) {
  const data = JSON.stringify(payload).replace(/</g, '\\u003c')
  return (
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Zotero UI harness</title>' +
    '<style>html,body{margin:0;padding:0;min-height:100%;background:#070b14;color:#e9effb;font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif}#root{min-height:100vh}</style>' +
    '<script>window.__zui={failScan:false,failImport:false,imported:null,closed:false,toasts:[]};window.__zuiData=' + data + ';</script>' +
    '</head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'
  )
}

async function startServer(outDir, html) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(html)
        return
      }
      if (url.pathname === '/bundle.js') {
        const buf = await readFile(path.join(outDir, 'bundle.js'))
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
        res.end(buf)
        return
      }
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204)
        res.end()
        return
      }
      res.writeHead(404)
      res.end('not found')
    } catch (error) {
      res.writeHead(500)
      res.end(String(error))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return { server, port: server.address().port }
}

async function waitForCdp(port, timeoutMs) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/version')
      if (res.ok) return await res.json()
      lastError = 'HTTP ' + res.status
    } catch (error) {
      lastError = String(error)
    }
    await sleep(150)
  }
  throw new Error('Edge CDP did not start on port ' + port + ': ' + String(lastError))
}

function openCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let seq = 0
    const pending = new Map()
    const handlers = []
    const api = {
      send(method, params) {
        return new Promise((res, rej) => {
          const id = ++seq
          pending.set(id, { res, rej })
          ws.send(JSON.stringify({ id, method, params: params || {} }))
        })
      },
      onEvent(handler) {
        handlers.push(handler)
      },
      close() {
        try {
          ws.close()
        } catch (error) {
          void error
        }
      },
    }
    ws.onmessage = (event) => {
      let msg
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'))
      } catch (error) {
        return
      }
      if (msg.id !== undefined) {
        const entry = pending.get(msg.id)
        if (entry === undefined) return
        pending.delete(msg.id)
        if (msg.error !== undefined) entry.rej(new Error(msg.error.message || 'cdp error'))
        else entry.res(msg.result)
        return
      }
      for (const handler of handlers) handler(msg)
    }
    ws.onopen = () => resolve(api)
    ws.onerror = () => reject(new Error('CDP websocket error: ' + wsUrl))
    ws.onclose = () => {
      for (const entry of pending.values()) entry.rej(new Error('CDP connection closed'))
      pending.clear()
    }
  })
}

async function openTarget(port, pageUrl) {
  let lastError = null
  for (const method of ['PUT', 'GET']) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent(pageUrl), { method })
      if (res.ok) {
        const target = await res.json()
        if (target.webSocketDebuggerUrl !== undefined) return target
        lastError = 'target without webSocketDebuggerUrl'
      } else {
        lastError = 'HTTP ' + res.status
      }
    } catch (error) {
      lastError = String(error)
    }
  }
  throw new Error('failed to create CDP target: ' + String(lastError))
}

async function main() {
  await mkdir(SHOT_DIR, { recursive: true })
  const workDir = await mkdtemp(path.join(tmpdir(), 'litgraph-zotero-ui-'))
  const profileDir = await mkdtemp(path.join(tmpdir(), 'litgraph-zotero-edge-'))
  let server = null
  let browser = null
  let cdp = null
  try {
    console.log('BUNDLE ' + path.join(workDir, 'bundle.js'))
    await bundleHarness(workDir)

    const html = makeHtml(PAYLOAD)
    const started = await startServer(workDir, html)
    server = started.server
    const pageUrl = 'http://127.0.0.1:' + started.port + '/'
    console.log('SERVE  ' + pageUrl)

    browser = spawn(
      EDGE,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-networking',
        '--remote-debugging-port=' + CDP_PORT,
        '--user-data-dir=' + profileDir,
        '--window-size=1320,920',
        'about:blank',
      ],
      { stdio: 'ignore', windowsHide: true },
    )
    browser.on('error', (error) => {
      console.log('EDGE ERROR ' + String(error))
    })
    const version = await waitForCdp(CDP_PORT, 20000)
    console.log('CDP    ' + String(version['Browser']) + ' on ' + CDP_PORT)

    const target = await openTarget(CDP_PORT, pageUrl)
    cdp = await openCdp(target.webSocketDebuggerUrl)
    const pageErrors = []
    cdp.onEvent((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const details = msg.params.exceptionDetails || {}
        pageErrors.push(String(details.exception && details.exception.description ? details.exception.description : details.text))
      }
      if (msg.method === 'Log.entryAdded') {
        const entry = msg.params.entry || {}
        if (entry.level === 'error') pageErrors.push('console: ' + String(entry.text))
      }
    })
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    await cdp.send('Log.enable')

    async function evalJs(expression) {
      const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (res.exceptionDetails !== undefined) {
        const details = res.exceptionDetails
        throw new Error('page eval failed: ' + String(details.exception && details.exception.description ? details.exception.description : details.text))
      }
      return res.result.value
    }
    async function waitFor(name, expression, timeoutMs = 10000) {
      const start = Date.now()
      let last = null
      while (Date.now() - start < timeoutMs) {
        try {
          last = await evalJs(expression)
        } catch (error) {
          last = null
        }
        if (last) return true
        await sleep(100)
      }
      throw new Error('timeout waiting for ' + name + ' (last=' + JSON.stringify(last) + ')')
    }
    async function textOf(selector) {
      return evalJs('(function(){var el=document.querySelector(' + JSON.stringify(selector) + ');return el===null?"":String(el.textContent||"")})()')
    }
    async function countOf(selector) {
      return evalJs('document.querySelectorAll(' + JSON.stringify(selector) + ').length')
    }
    async function clickSel(selector) {
      return evalJs('(function(){var el=document.querySelector(' + JSON.stringify(selector) + ');if(el===null)return false;el.click();return true})()')
    }
    async function clickButtonByText(text) {
      return evalJs(
        '(function(){var els=Array.prototype.slice.call(document.querySelectorAll("button"));for(var i=0;i<els.length;i++){if(String(els[i].textContent||"").trim()===' +
          JSON.stringify(text) +
          '){els[i].click();return true}}return false})()',
      )
    }
    async function setInputValue(selector, value) {
      return evalJs(
        '(function(){var el=document.querySelector(' + JSON.stringify(selector) + ');if(el===null)return false;' +
          'var desc=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");' +
          'desc.set.call(el,' + JSON.stringify(value) + ');' +
          'el.dispatchEvent(new Event("input",{bubbles:true}));return true})()',
      )
    }
    async function computed(selector, property) {
      return evalJs(
        '(function(){var el=document.querySelector(' + JSON.stringify(selector) + ');' +
          'if(el===null)return null;return getComputedStyle(el).getPropertyValue(' + JSON.stringify(property) + ').trim()})()',
      )
    }
    /** WCAG contrast ratio between two computed rgb() colors, rounded to 2 decimals. */
    async function contrastRatio(selectorA, propertyA, selectorB, propertyB) {
      const a = await computed(selectorA, propertyA)
      const b = await computed(selectorB, propertyB)
      return evalJs(
        '(function(){' +
          'function lin(hex){var n=hex/255;return n<=0.03928?n/12.92:Math.pow((n+0.055)/1.055,2.4)}' +
          'function lum(c){var nums=c.match(/[0-9.]+/g);if(nums===null||nums.length<3)return null;' +
          'return 0.2126*lin(Number(nums[0]))+0.7152*lin(Number(nums[1]))+0.0722*lin(Number(nums[2]))}' +
          'var la=lum(' + JSON.stringify(a) + '),lb=lum(' + JSON.stringify(b) + ');' +
          'if(la===null||lb===null)return null;var hi=Math.max(la,lb),lo=Math.min(la,lb);return Math.round((hi+0.05)/(lo+0.05)*100)/100})()',
      )
    }
    async function setThemeAttr(value, bodyBackground) {
      await evalJs(
        '(function(){var el=document.getElementById("theme-root");if(el!==null)el.setAttribute("data-lg-theme",' +
          JSON.stringify(value) +
          ');document.body.style.background=' + JSON.stringify(bodyBackground) + ';return true})()',
      )
    }
    async function shot(name) {
      const metrics = await cdp.send('Page.getLayoutMetrics')
      const size = metrics.cssContentSize || metrics.contentSize || { width: 1320, height: 920 }
      const width = Math.max(1, Math.ceil(size.width))
      const height = Math.max(1, Math.ceil(size.height))
      const res = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale: 1 },
      })
      const file = path.join(SHOT_DIR, name + '.png')
      await writeFile(file, Buffer.from(res.data, 'base64'))
      console.log('SHOT   ' + file + ' (' + width + 'x' + height + ')')
      return file
    }

    // 1) initial scan + list state
    await waitFor('zotero dialog', 'document.querySelector(".lg-zot-dialog") !== null', 15000)
    await waitFor('six zotero rows', 'document.querySelectorAll(".lg-zot-row").length === 6', 10000)
    check('dialog title', (await textOf('.lg-zot-title')) === '从 Zotero 导入', await textOf('.lg-zot-title'))
    const sub = await textOf('.lg-zot-sub')
    check(
      'subtitle shows dataDir / source / count',
      sub.indexOf('zotero\\storage') >= 0 && sub.indexOf('副本') >= 0 && sub.indexOf('可导入 6 条') >= 0,
      sub,
    )
    check('rows rendered', (await countOf('.lg-zot-row')) === 6)
    check(
      'overlay mirrors dark theme initially',
      (await evalJs('(function(){var el=document.querySelector(".lg-zot-backdrop");return el===null?null:el.getAttribute("data-lg-theme")})()')) === 'dark',
    )
    check('dark theme panel background', (await computed('.lg-zot-dialog', 'background-color')) === 'rgb(11, 18, 34)', await computed('.lg-zot-dialog', 'background-color'))
    check('dark theme title contrast >= 7', (await contrastRatio('.lg-zot-title', 'color', '.lg-zot-dialog', 'background-color')) >= 7, await contrastRatio('.lg-zot-title', 'color', '.lg-zot-dialog', 'background-color'))
    check('pre-selected usable PDFs = 3', (await textOf('.lg-zot-list-count')) === '已选 3 / 6', await textOf('.lg-zot-list-count'))
    check('pdf badges = 3', (await countOf('.lg-zot-badge.is-pdf')) === 3, await countOf('.lg-zot-badge.is-pdf'))
    check('missing attachment badge = 1', (await countOf('.lg-zot-badge.is-missing')) === 1)
    check('no-pdf badge = 2', (await countOf('.lg-zot-badge.is-none')) === 2)
    check('warnings block visible', (await countOf('.lg-zot-warnings')) === 1)
    const warningsText = await textOf('.lg-zot-warnings')
    check('warning mentions local API 403 fallback', warningsText.indexOf('本地 API 返回 HTTP 403') >= 0, warningsText)
    check('collection chip uses full path', (await textOf('.lg-zot-list')).indexOf('智能加工 > 刀具磨损') >= 0)
    check(
      'authors truncated with count',
      (await textOf('.lg-zot-list')).indexOf('等 4 人') >= 0 || (await textOf('.lg-zot-list')).indexOf('4 人') >= 0,
    )
    await shot('01-ready')

    // 2) search + highlight
    await setInputValue('.lg-zot-search input', '孔加工')
    await waitFor('one filtered row', 'document.querySelectorAll(".lg-zot-row").length === 1', 5000)
    check('search filters to thesis row', (await countOf('.lg-zot-row')) === 1)
    check('search highlight mark', (await countOf('.lg-zot-mark')) >= 1)
    check(
      'list head shows filtered count',
      (await textOf('.lg-zot-list-head')).indexOf('当前 1 条结果') >= 0,
      await textOf('.lg-zot-list-head'),
    )
    await shot('02-search')
    await setInputValue('.lg-zot-search input', '')
    await waitFor('six rows after clearing search', 'document.querySelectorAll(".lg-zot-row").length === 6', 5000)

    // 3) mode switch
    await clickButtonByText('仅导入记录')
    await waitFor('meta mode active', 'document.querySelector(".lg-zot-mode-btn.is-active") !== null', 3000)
    check(
      'meta mode foot hint',
      (await textOf('.lg-zot-foot-info')).indexOf('仅导入题录') >= 0,
      await textOf('.lg-zot-foot-info'),
    )
    await shot('03-meta-mode')
    await clickButtonByText('导入 PDF')
    check(
      'pdf mode foot hint counts usable PDFs',
      (await textOf('.lg-zot-foot-info')).indexOf('有可用 PDF') >= 0,
      await textOf('.lg-zot-foot-info'),
    )

    // 4) import error path (host 500 -> inline error, list stays)
    await evalJs('window.__zui.failImport = true')
    await clickSel('.lg-zot-foot .lg-zot-btn.is-primary')
    await waitFor('inline import error', 'document.querySelector(".lg-zot-error-inline") !== null', 8000)
    const importErrorText = await textOf('.lg-zot-error-inline')
    check('import error surfaces host message', importErrorText.indexOf('模拟的宿主错误') >= 0, importErrorText)
    check('list still visible after import error', (await countOf('.lg-zot-row')) === 6)
    await shot('04-import-error')
    await evalJs('window.__zui.failImport = false')

    // 5) successful import -> result view
    await clickSel('.lg-zot-foot .lg-zot-btn.is-primary')
    await waitFor('result view', 'document.querySelector(".lg-zot-result-num") !== null', 10000)
    check('result accepted count = 2', (await textOf('.lg-zot-result-num')) === '2', await textOf('.lg-zot-result-num'))
    const resultText = await textOf('.lg-zot-result')
    check('result summary mentions skipped', resultText.indexOf('1 条被跳过') >= 0, resultText.slice(0, 160))
    check('accepted result rows = 2', (await countOf('.lg-zot-result-section .lg-zot-result-item')) === 3)
    check('skipped reason rendered', (await textOf('.lg-zot-skip')).indexOf('找不到') >= 0, await textOf('.lg-zot-skip'))
    check('onImported called with accepted count', (await evalJs('window.__zui.imported')) === 2, await evalJs('window.__zui.imported'))
    await shot('05-result')

    // 6) close via finish button (result view)
    await clickButtonByText('完成')
    await waitFor('dialog closed', 'document.querySelector(".lg-zot-dialog") === null', 5000)
    check('dialog closed via 完成', (await countOf('.lg-zot-dialog')) === 0)
    check('onClose fired', (await evalJs('window.__zui.closed')) === true)
    check('reopen button rendered by host harness', (await countOf('#reopen-zotero')) === 1)

    // 7) reopen + rescan shows loading then list, then close via 取消
    await clickSel('#reopen-zotero')
    await waitFor('rows after reopen', 'document.querySelectorAll(".lg-zot-row").length === 6', 10000)
    await clickButtonByText('重新扫描')
    await sleep(40)
    const loadingVisible = (await countOf('.lg-zot-loading')) === 1
    check('rescan shows loading state', loadingVisible)
    await shot('06-rescan-loading')
    await waitFor('rows after rescan', 'document.querySelectorAll(".lg-zot-row").length === 6', 10000)
    await clickButtonByText('取消')
    await waitFor('dialog closed via 取消', 'document.querySelector(".lg-zot-dialog") === null', 5000)
    check('dialog closed via 取消', (await countOf('.lg-zot-dialog')) === 0)

    // 8) scan error path + retry
    await evalJs('window.__zui.failScan = true')
    await clickSel('#reopen-zotero')
    await waitFor('scan error view', 'document.querySelector(".lg-zot-error-text") !== null', 10000)
    const scanErrorText = await textOf('.lg-zot-error-text')
    check('scan error surfaces host message', scanErrorText.indexOf('没有 zotero.sqlite') >= 0, scanErrorText)
    await shot('07-scan-error')
    await evalJs('window.__zui.failScan = false')
    await clickButtonByText('重试')
    await waitFor('rows after retry', 'document.querySelectorAll(".lg-zot-row").length === 6', 10000)
    check('retry recovers list', (await countOf('.lg-zot-row')) === 6)

    // 8.5) theme mirroring: portal escapes .lg-root, overlay re-declares tokens
    await setThemeAttr('light', '#eef2f7')
    await waitFor(
      'overlay follows light theme',
      '(function(){var el=document.querySelector(".lg-zot-backdrop");return el!==null&&el.getAttribute("data-lg-theme")==="light"})()',
      5000,
    )
    check('light theme mirrored on overlay', (await computed('.lg-zot-backdrop', '--lg-panel-solid')) === '#ffffff', await computed('.lg-zot-backdrop', '--lg-panel-solid'))
    check('light theme panel background white', (await computed('.lg-zot-dialog', 'background-color')) === 'rgb(255, 255, 255)', await computed('.lg-zot-dialog', 'background-color'))
    check('light theme title text dark', (await computed('.lg-zot-title', 'color')) === 'rgb(27, 37, 55)', await computed('.lg-zot-title', 'color'))
    check('light theme row title text dark', (await computed('.lg-zot-row-title', 'color')) === 'rgb(27, 37, 55)', await computed('.lg-zot-row-title', 'color'))
    check('light theme warning color readable', (await computed('.lg-zot-warnings', 'color')) === 'rgb(138, 90, 0)', await computed('.lg-zot-warnings', 'color'))
    check(
      'light theme title contrast >= 7',
      (await contrastRatio('.lg-zot-title', 'color', '.lg-zot-dialog', 'background-color')) >= 7,
      await contrastRatio('.lg-zot-title', 'color', '.lg-zot-dialog', 'background-color'),
    )
    check(
      'light theme warning contrast >= 4.5',
      (await contrastRatio('.lg-zot-warnings', 'color', '.lg-zot-dialog', 'background-color')) >= 4.5,
      await contrastRatio('.lg-zot-warnings', 'color', '.lg-zot-dialog', 'background-color'),
    )
    check(
      'light theme foot info contrast >= 4.5',
      (await contrastRatio('.lg-zot-foot-info', 'color', '.lg-zot-foot', 'background-color')) >= 4.5,
      await contrastRatio('.lg-zot-foot-info', 'color', '.lg-zot-foot', 'background-color'),
    )
    await shot('08-light-ready')
    await setThemeAttr('dark', '#070b14')
    await waitFor(
      'overlay follows dark theme',
      '(function(){var el=document.querySelector(".lg-zot-backdrop");return el!==null&&el.getAttribute("data-lg-theme")==="dark"})()',
      5000,
    )
    check('dark theme restored on overlay', (await computed('.lg-zot-dialog', 'background-color')) === 'rgb(11, 18, 34)', await computed('.lg-zot-dialog', 'background-color'))
    check(
      'dark theme warning contrast >= 4.5',
      (await contrastRatio('.lg-zot-warnings', 'color', '.lg-zot-dialog', 'background-color')) >= 4.5,
      await contrastRatio('.lg-zot-warnings', 'color', '.lg-zot-dialog', 'background-color'),
    )
    await shot('09-dark-ready')

    // 9) Escape key closes dialog
    await evalJs('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
    await waitFor('dialog closed by Escape', 'document.querySelector(".lg-zot-dialog") === null', 5000)
    check('Escape closes dialog', (await countOf('.lg-zot-dialog')) === 0)

    await sleep(150)
    check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300))

    const failed = checks.filter((entry) => !entry.ok)
    console.log('')
    console.log('RESULT passed=' + (checks.length - failed.length) + ' failed=' + failed.length + ' total=' + checks.length)
    if (failed.length > 0) {
      for (const entry of failed) console.log('  FAILED ' + entry.name + (entry.detail === undefined ? '' : ' :: ' + String(entry.detail)))
      process.exitCode = 1
    }
  } finally {
    if (cdp !== null) cdp.close()
    if (browser !== null) {
      try {
        browser.kill()
      } catch (error) {
        void error
      }
    }
    if (server !== null) await new Promise((resolve) => server.close(resolve))
    await sleep(300)
    await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

main().catch((error) => {
  console.error('UI CHECK FAILED: ' + String(error && error.stack ? error.stack : error))
  process.exitCode = 1
})
