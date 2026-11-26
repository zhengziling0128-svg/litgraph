#!/usr/bin/env node
/**
 * Real-host theme check for the Zotero import dialog (task: light-theme fix).
 *
 * Loads the running e2e host UI in a throwaway headless Edge (own CDP port and
 * temp profile; never touches the real browser or the desktop app), opens the
 * Zotero dialog, asserts the overlay's theme mirror + contrast, and captures
 * one light and one dark screenshot. The theme mode is restored afterwards.
 *
 * Usage: node scripts/zotero-host-theme-shots.mjs
 * Env:   LITGRAPH_HOST_URL (running host URL; required unless a host listens on :55995)
 *        ZOTERO_UI_CDP_PORT (default 9335)
 */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = process.env.ZOTERO_UI_EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const SHOT_DIR = process.env.ZOTERO_UI_SHOT_DIR ??
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.probe', 'zotero-ui')
const CDP_PORT = Number(process.env.ZOTERO_UI_CDP_PORT || '9335')
const HOST_URL =
  process.env.LITGRAPH_HOST_URL ||
  'http://127.0.0.1:55995/'

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok })
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined || detail === '' ? '' : '  ::  ' + String(detail)))
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  const status = await fetch('http://127.0.0.1:55995/api/litgraph/status?token=' + HOST_URL.split('token=')[1])
  if (!status.ok) throw new Error('host status HTTP ' + status.status)
  const statusJson = await status.json()
  console.log('HOST   ' + HOST_URL)
  console.log('STATUS papers=' + statusJson.paperCount + ' build=' + String(statusJson.build))

  await mkdir(SHOT_DIR, { recursive: true })
  const profileDir = await mkdtemp(path.join(tmpdir(), 'litgraph-zotero-host-'))
  let browser = null
  let cdp = null
  try {
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
        '--window-size=1600,1000',
        'about:blank',
      ],
      { stdio: 'ignore', windowsHide: true },
    )
    browser.on('error', (error) => console.log('EDGE ERROR ' + String(error)))
    const version = await waitForCdp(CDP_PORT, 20000)
    console.log('CDP    ' + String(version['Browser']) + ' on ' + CDP_PORT)

    const target = await openTarget(CDP_PORT, HOST_URL)
    cdp = await openCdp(target.webSocketDebuggerUrl)
    const pageErrors = []
    cdp.onEvent((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const details = msg.params.exceptionDetails || {}
        pageErrors.push(String(details.exception && details.exception.description ? details.exception.description : details.text))
      }
    })
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')

    async function evalJs(expression) {
      const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (res.exceptionDetails !== undefined) {
        const details = res.exceptionDetails
        throw new Error('page eval failed: ' + String(details.exception && details.exception.description ? details.exception.description : details.text))
      }
      return res.result.value
    }
    async function waitFor(name, expression, timeoutMs = 15000) {
      const start = Date.now()
      let last = null
      while (Date.now() - start < timeoutMs) {
        try {
          last = await evalJs(expression)
        } catch (error) {
          last = null
        }
        if (last) return true
        await sleep(150)
      }
      throw new Error('timeout waiting for ' + name + ' (last=' + JSON.stringify(last) + ')')
    }
    async function computed(selector, property) {
      return evalJs(
        '(function(){var el=document.querySelector(' + JSON.stringify(selector) + ');' +
          'if(el===null)return null;return getComputedStyle(el).getPropertyValue(' + JSON.stringify(property) + ').trim()})()',
      )
    }
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
    async function shot(name) {
      const metrics = await cdp.send('Page.getLayoutMetrics')
      const size = metrics.cssContentSize || metrics.contentSize || { width: 1600, height: 1000 }
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
    async function clickSel(selector) {
      return evalJs('(function(){var el=document.querySelector(' + JSON.stringify(selector) + ');if(el===null)return false;el.click();return true})()')
    }
    async function rootTheme() {
      return evalJs('(function(){var el=document.querySelector(".lg-root");if(el===null)return null;return {"theme":el.getAttribute("data-lg-theme"),"mode":el.getAttribute("data-lg-theme-mode")}})()')
    }
    async function cycleThemeUntil(predicate) {
      const before = await rootTheme()
      for (let i = 0; i < 4; i += 1) {
        const current = await rootTheme()
        if (predicate(current)) return true
        await clickSel('.lg-theme-btn')
        await sleep(350)
      }
      return predicate(await rootTheme())
    }
    async function overlayTheme() {
      return evalJs('(function(){var el=document.querySelector(".lg-zot-backdrop");return el===null?null:el.getAttribute("data-lg-theme")})()')
    }

    // 1) app ready
    await waitFor('litgraph root', 'document.querySelector(".lg-root") !== null', 30000)
    await waitFor('zotero button', 'document.querySelector(".lg-zotero-btn") !== null', 20000)
    await sleep(600)
    const original = await rootTheme()
    console.log('THEME  initial=' + JSON.stringify(original))
    check('host root exposes data-lg-theme', original !== null && (original.theme === 'dark' || original.theme === 'light'), JSON.stringify(original))

    // Ensure light first.
    await cycleThemeUntil((current) => current !== null && current.theme === 'light')
    const lightRoot = await rootTheme()
    check('host switched to light theme', lightRoot !== null && lightRoot.theme === 'light', JSON.stringify(lightRoot))

    // 2) open dialog
    await clickSel('.lg-zotero-btn')
    await waitFor('zotero dialog', 'document.querySelector(".lg-zot-dialog") !== null', 15000)
    await waitFor('zotero rows from real library', 'document.querySelectorAll(".lg-zot-row").length >= 1', 30000)
    await sleep(400)
    const rowCount = await evalJs('document.querySelectorAll(".lg-zot-row").length')
    console.log('ROWS   ' + rowCount)
    const overlayLight = await overlayTheme()
    check('light: overlay mirrors theme', overlayLight === 'light', String(overlayLight))
    check('light: dialog panel is white', (await computed('.lg-zot-dialog', 'background-color')) === 'rgb(255, 255, 255)', await computed('.lg-zot-dialog', 'background-color'))
    check('light: body/title text dark', (await computed('.lg-zot-title', 'color')) === 'rgb(27, 37, 55)', await computed('.lg-zot-title', 'color'))
    check(
      'light: title contrast >= 7',
      (await contrastRatio('.lg-zot-title', 'color', '.lg-zot-dialog', 'background-color')) >= 7,
      await contrastRatio('.lg-zot-title', 'color', '.lg-zot-dialog', 'background-color'),
    )
    if ((await evalJs('document.querySelectorAll(".lg-zot-warnings").length')) > 0) {
      check(
        'light: warning text contrast >= 4.5',
        (await contrastRatio('.lg-zot-warnings', 'color', '.lg-zot-dialog', 'background-color')) >= 4.5,
        await contrastRatio('.lg-zot-warnings', 'color', '.lg-zot-dialog', 'background-color'),
      )
    }
    check(
      'light: footer info contrast >= 4.5',
      (await contrastRatio('.lg-zot-foot-info', 'color', '.lg-zot-foot', 'background-color')) >= 4.5,
      await contrastRatio('.lg-zot-foot-info', 'color', '.lg-zot-foot', 'background-color'),
    )
    check(
      'light: row title contrast >= 7',
      (await contrastRatio('.lg-zot-row-title', 'color', '.lg-zot-dialog', 'background-color')) >= 7,
      await contrastRatio('.lg-zot-row-title', 'color', '.lg-zot-dialog', 'background-color'),
    )
    await shot('10-host-light')

    // 3) switch the shell to dark while the dialog is open
    await cycleThemeUntil((current) => current !== null && current.theme === 'dark')
    await waitFor('overlay follows dark theme', 'document.querySelector(".lg-zot-backdrop") !== null && document.querySelector(".lg-zot-backdrop").getAttribute("data-lg-theme") === "dark"', 5000)
    check('dark: overlay mirrors theme', (await overlayTheme()) === 'dark', String(await overlayTheme()))
    check('dark: dialog panel is deep blue', (await computed('.lg-zot-dialog', 'background-color')) === 'rgb(11, 18, 34)', await computed('.lg-zot-dialog', 'background-color'))
    check(
      'dark: title contrast >= 7',
      (await contrastRatio('.lg-zot-title', 'color', '.lg-zot-dialog', 'background-color')) >= 7,
      await contrastRatio('.lg-zot-title', 'color', '.lg-zot-dialog', 'background-color'),
    )
    await shot('11-host-dark')

    // 4) restore the original theme mode, close the dialog
    await cycleThemeUntil((current) => current !== null && current.mode === (original === null ? 'system' : original.mode))
    const restored = await rootTheme()
    check('original theme mode restored', original !== null && restored !== null && restored.mode === original.mode, JSON.stringify(restored))
    await evalJs('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
    await waitFor('dialog closed', 'document.querySelector(".lg-zot-dialog") === null', 5000)
    check('dialog closes with Escape', (await evalJs('document.querySelector(".lg-zot-dialog") === null')) === true)
    check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300))

    const failed = checks.filter((entry) => !entry.ok)
    console.log('')
    console.log('RESULT passed=' + (checks.length - failed.length) + ' failed=' + failed.length + ' total=' + checks.length)
    if (failed.length > 0) {
      for (const entry of failed) console.log('  FAILED ' + entry.name)
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
    await sleep(300)
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

main().catch((error) => {
  console.error('HOST THEME CHECK FAILED: ' + String(error && error.stack ? error.stack : error))
  process.exitCode = 1
})
