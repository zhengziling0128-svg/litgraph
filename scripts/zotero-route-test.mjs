#!/usr/bin/env node
/**
 * Zotero host route integration test (task-8).
 *
 * Runs the REAL host entry (src/host/index.ts) through tsx with a mocked
 * cordis ctx + webServer + LLM, so /api/litgraph/zotero/scan and
 * /api/litgraph/zotero/import go through the same handlers the app uses.
 * The scan reads the real Zotero data dir read-only (copy into a temp dir);
 * imports land in a throwaway data root under os.tmpdir().
 *
 *   npx tsx scripts/zotero-route-test.mjs
 */
import { existsSync, promises as fsp } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Readable, Writable } from 'node:stream'
import { finished } from 'node:stream/promises'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = dirname(here)
const hostEntry = join(pluginRoot, 'src', 'host', 'index.ts')
const REFERENCE_DIR = process.env.LITGRAPH_ZOTERO_DATA_DIR ?? join(homedir(), 'Zotero')
const LIVE_DIR = process.env.LITGRAPH_ZOTERO_LIVE_DIR ?? process.env.LITGRAPH_ZOTERO_DATA_DIR ?? join(homedir(), 'Zotero')

const results = { pass: 0, fail: 0, failed: [] }
function check(name, condition, detail = "") {
  if (condition) {
    results.pass += 1
    console.log('  ok   ' + name)
  } else {
    results.fail += 1
    results.failed.push(name + (detail ? " :: " + detail : ""))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}
function checkEqual(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  check(name, a === e, 'expected ' + e + ', got ' + a)
}

// -- mock HTTP ---------------------------------------------------------------
function createMockResponse() {
  const chunks = []
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk))
      callback()
    },
  })
  res.statusCode = 200
  res.headers = {}
  res.headersSent = false
  res.setHeader = (name, value) => {
    res.headers[String(name).toLowerCase()] = value
  }
  res.getHeader = (name) => res.headers[String(name).toLowerCase()]
  const originalEnd = res.end.bind(res)
  res.end = function (chunk, encoding, callback) {
    res.headersSent = true
    return originalEnd(chunk, encoding, callback)
  }
  res.buffer = () => Buffer.concat(chunks)
  res.text = () => Buffer.concat(chunks).toString("utf8")
  return res
}

function createHost(module, llm, config) {
  const routes = []
  const ctx = {
    webServer: {
      register(route) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    },
    effect(callback) {
      const dispose = callback()
      return typeof dispose === "function" ? dispose : () => undefined
    },
    llm,
    get(name) {
      return name === "llm" ? llm : null
    },
  }
  module.apply(ctx, config)
  return {
    routes,
    find(pathname) {
      const route = routes.find((candidate) => candidate.path === pathname)
      if (route === undefined) throw new Error('no route registered for ' + pathname)
      return route
    },
  }
}

async function callRoute(host, method, url, options = {}) {
  const target = new URL(url, 'http://127.0.0.1:55995')
  const route = host.find(target.pathname)
  const req = new Readable({ read() {} })
  req.method = method
  req.url = url
  req.headers = { host: '127.0.0.1:55995', ...(options.headers ?? {}) }
  const res = createMockResponse()
  const pending = route.handler(req, res)
  if (options.body !== undefined && options.body !== null) req.push(options.body)
  req.push(null)
  await pending
  await finished(res).catch(() => undefined)
  const text = res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.statusCode, headers: res.headers, text, buffer: res.buffer(), json }
}

function postJson(host, path, payload) {
  return callRoute(host, 'POST', path, {
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify(payload), 'utf8'),
  })
}

async function waitForJob(host, jobId, timeoutMs = 60_000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeoutMs) {
    const response = await callRoute(host, 'GET', '/api/litgraph/job?id=' + encodeURIComponent(jobId))
    last = response.json
    if (last !== null && (last.state === 'done' || last.state === 'failed')) return last
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('job ' + jobId + ' did not settle; last = ' + JSON.stringify(last))
}

async function waitForPaperReady(host, paperId, timeoutMs = 60_000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeoutMs) {
    const response = await callRoute(host, 'GET', '/api/litgraph/paper?id=' + encodeURIComponent(paperId))
    last = response.json
    if (last !== null && last.status !== 'processing') return last
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('paper ' + paperId + ' did not settle; last = ' + JSON.stringify(last))
}

// -- fake LLM -----------------------------------------------------------------
function createMockLlm(script) {
  const calls = []
  return {
    calls,
    async listModels() {
      return [{ id: "deepseek-flash", name: "DeepSeek-Flash" }]
    },
    async prepareCall(config, _signal, configure) {
      const controls = { provider: config.provider, model: config.model, maxTokens: config.maxTokens, temperature: config.temperature }
      const finalConfig = typeof configure === "function" ? configure(controls, { id: config.model }) : controls
      const call = { config: finalConfig }
      calls.push(call)
      const step = script[Math.min(calls.length - 1, script.length - 1)]
      return {
        config: finalConfig,
        async *stream(options) {
          call.options = options
          yield { type: "block-start", index: 0, blockType: "text" }
          yield { type: "text-delta", text: step.text }
          yield { type: "finish", reason: { kind: "stop" } }
        },
      }
    },
  }
}

function fakePayload(overrides = {}) {
  return {
    title: "Zotero 导入的论文（mock LLM 标题）",
    authors: ["Ada Lovelace", "Alan Turing"],
    year: 2019,
    venue: "Journal of Mocking",
    abstract: "本文由 Zotero 路由集成测试导入。",
    summary: "该文用于验证 Zotero 扫描与导入路由。",
    contributions: ["验证了扫描路由", "验证了导入路由"],
    method: "集成测试",
    keywords: ["Zotero", "集成测试"],
    categories: ["机械工程 > 故障诊断 > 时频分析"],
    relations: [],
    ...overrides,
  }
}

async function sha256File(target) {
  const hash = createHash('sha256')
  hash.update(await fsp.readFile(target))
  return hash.digest(
    "hex",
  )
}

async function main() {
  const module = await import(pathToFileURL(hostEntry).href)
  checkEqual('module name', module.name, 'dsh-litgraph')
  check('apply is a function', typeof module.apply === 'function')

  const dataRoot = await fsp.mkdtemp(join(tmpdir(), "litgraph-zotero-route-"))
  const llm = createMockLlm([{ text: JSON.stringify(fakePayload()) }])
  const host = createHost(module, llm, { dataRoot, llmMaxTokens: 2400 })
  try {
    for (const routePath of ['/api/litgraph/zotero/scan', '/api/litgraph/zotero/import']) {
      check(
        'registered ' + routePath,
        host.routes.some((route) => route.path === routePath && typeof route.handler === "function"),
      )
    }

    console.log('[1] scan route: reference library via explicit dataDir')
    const refDb = join(REFERENCE_DIR, "zotero.sqlite")
    const refBefore = { size: (await fsp.stat(refDb)).size, sha: await sha256File(refDb) }
    let response = await postJson(host, '/api/litgraph/zotero/scan', { dataDir: REFERENCE_DIR })
    checkEqual('reference scan 200', response.status, 200)
    checkEqual('reference scan ok', response.json?.ok, true)
    checkEqual('reference scan source', response.json?.source, 'sqlite')
    checkEqual('reference scan dataDir', response.json?.dataDir, REFERENCE_DIR)
    checkEqual('reference scan item count', response.json?.items?.length, 1)
    const refItem = response.json?.items?.[0]
    check('reference title parsed', typeof refItem?.title === 'string' && refItem.title.includes('An improved approach'), refItem?.title)
    check('reference DOI parsed', refItem?.doi === '10.1016/j.compind.2006.03.002', refItem?.doi)
    check('reference attachment resolved', typeof refItem?.attachment?.path === 'string' && existsSync(refItem.attachment.path), refItem?.attachment?.path)
    check('reference collection parsed', Array.isArray(refItem?.collections) && refItem.collections[0] === '智能加工', JSON.stringify(refItem?.collections))
    check('reference warnings array', Array.isArray(response.json?.warnings))

    const missingDir = join(dataRoot, "no-such-zotero")
    await fsp.mkdir(missingDir, { recursive: true })
    response = await postJson(host, '/api/litgraph/zotero/scan', { dataDir: missingDir })
    checkEqual('missing database is 422', response.status, 422)
    checkEqual('missing database code', response.json?.code, 'NO_DATABASE')

    console.log('[2] scan route: default dataDir (real Zotero profile)')
    const liveDb = join(LIVE_DIR, "zotero.sqlite")
    const liveBefore = { size: (await fsp.stat(liveDb)).size, mtime: (await fsp.stat(liveDb)).mtimeMs }
    response = await postJson(host, '/api/litgraph/zotero/scan', {})
    checkEqual('default scan 200', response.status, 200)
    checkEqual('default scan ok', response.json?.ok, true)
    const sameDir = (a, b) => String(a ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === String(b).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    check('default scan uses live dataDir', sameDir(response.json?.dataDir, LIVE_DIR), String(response.json?.dataDir))
    check('default scan has items', Array.isArray(response.json?.items) && response.json.items.length > 5, String(response.json?.items?.length))
    check('default scan source is sqlite', response.json?.source === 'sqlite', response.json?.source)
    const scanItems = response.json?.items ?? []
    const pdfItem = scanItems.find((item) => item.attachment !== null && typeof item.attachment.path === "string" && item.attachment.path !== "" && item.attachment.size > 0 && existsSync(item.attachment.path))
    const noPdfItem = scanItems.find((item) => item.attachment === null)
    check("scan exposes an item with a usable PDF", pdfItem !== undefined, pdfItem?.key)
    check("scan exposes an item without a PDF", noPdfItem !== undefined, noPdfItem?.key)

    console.log('[3] import route: PDF mode through the real pipeline')
    if (pdfItem !== undefined) {
      response = await postJson(host, '/api/litgraph/zotero/import', { keys: [pdfItem.key], mode: 'pdf' })
      checkEqual('pdf import 200', response.status, 200)
      checkEqual('pdf import ok', response.json?.ok, true)
      checkEqual('pdf import accepted count', response.json?.accepted?.length, 1)
      const acceptedPdf = response.json?.accepted?.[0]
      check("pdf import key", acceptedPdf?.key === pdfItem.key, acceptedPdf?.key)
      check("pdf import paperId", typeof acceptedPdf?.paperId === "string" && acceptedPdf.paperId.length > 3, acceptedPdf?.paperId)
      check("pdf import jobId", typeof acceptedPdf?.jobId === "string" && acceptedPdf.jobId.length > 3, acceptedPdf?.jobId)
      checkEqual("pdf import skipped empty", response.json?.skipped?.length, 0)
      const pdfJob = await waitForJob(host, acceptedPdf.jobId)
      checkEqual('pdf import job done', pdfJob.state, 'done')
      const pdfPaper = await waitForPaperReady(host, acceptedPdf.paperId)
      checkEqual('pdf paper ready', pdfPaper?.status, 'ready')
      checkEqual('pdf paper hasFile', pdfPaper?.hasFile, true)
      checkEqual('pdf paper size equals Zotero attachment', pdfPaper?.size, pdfItem.attachment.size)
      checkEqual('pdf paper keeps the Zotero file name', pdfPaper?.fileName, pdfItem.attachment.fileName)
      const fileResponse = await callRoute(host, "GET", "/api/litgraph/file?id=" + encodeURIComponent(acceptedPdf.paperId))
      checkEqual('pdf file route 200', fileResponse.status, 200)
      checkEqual('pdf bytes match Zotero attachment', fileResponse.buffer.length, pdfItem.attachment.size)
      checkEqual('pdf file starts with %PDF-', fileResponse.buffer.subarray(0, 5).toString('latin1'), '%PDF-')
      checkEqual("llm called for the pdf import", llm.calls.length >= 1, true)
    }

    console.log('[4] import route: metadata mode')
    const metaItem = scanItems.find((item) => item.key !== pdfItem?.key)
    if (metaItem !== undefined) {
      response = await postJson(host, '/api/litgraph/zotero/import', { keys: [metaItem.key], mode: 'meta' })
      checkEqual('meta import 200', response.status, 200)
      checkEqual('meta import accepted count', response.json?.accepted?.length, 1)
      const acceptedMeta = response.json?.accepted?.[0]
      check("meta import paperId", typeof acceptedMeta?.paperId === "string", acceptedMeta?.paperId)
      const metaPaper = await waitForPaperReady(host, acceptedMeta.paperId)
      checkEqual('meta paper ready', metaPaper?.status, 'ready')
      checkEqual('meta paper has no file', metaPaper?.hasFile, false)
      checkEqual('meta paper keeps the Zotero title', metaPaper?.title, metaItem.title)
      checkEqual('meta paper year from Zotero', metaPaper?.year, metaItem.year)
    }

    console.log('[5] import route: PDF mode falls back to metadata when no attachment')
    if (noPdfItem !== undefined) {
      response = await postJson(host, '/api/litgraph/zotero/import', { keys: [noPdfItem.key], mode: 'pdf' })
      checkEqual('fallback import 200', response.status, 200)
      checkEqual('fallback import accepted count', response.json?.accepted?.length, 1)
      const acceptedFallback = response.json?.accepted?.[0]
      check("fallback import has no jobId", acceptedFallback?.jobId === undefined, String(acceptedFallback?.jobId))
      const fallbackPaper = await waitForPaperReady(host, acceptedFallback.paperId)
      checkEqual('fallback paper has no file', fallbackPaper?.hasFile, false)
    }

    console.log('[6] import route: skipped keys and body validation')
    response = await postJson(host, '/api/litgraph/zotero/import', { keys: ['NOT_A_REAL_KEY'], mode: 'meta' })
    checkEqual('unknown key 200', response.status, 200)
    checkEqual('unknown key accepted count', response.json?.accepted?.length, 0)
    checkEqual('unknown key skipped count', response.json?.skipped?.length, 1)
    check('unknown key has a reason', typeof response.json?.skipped?.[0]?.reason === 'string' && response.json.skipped[0].reason.length > 0, response.json?.skipped?.[0]?.reason)
    response = await postJson(host, '/api/litgraph/zotero/import', { keys: 'not-an-array', mode: 'meta' })
    checkEqual('bad keys body is 400', response.status, 400)
    response = await postJson(host, '/api/litgraph/zotero/import', { keys: [], mode: 'meta' })
    checkEqual('empty selection is ok', response.status, 200)
    checkEqual('empty selection accepted', response.json?.accepted?.length, 0)

    console.log('[7] real Zotero data stays read-only')
    const refAfter = { size: (await fsp.stat(refDb)).size, sha: await sha256File(refDb) }
    checkEqual('reference zotero.sqlite size unchanged', refAfter.size, refBefore.size)
    checkEqual('reference zotero.sqlite sha256 unchanged', refAfter.sha, refBefore.sha)
    const liveAfter = { size: (await fsp.stat(liveDb)).size, mtime: (await fsp.stat(liveDb)).mtimeMs }
    checkEqual('live zotero.sqlite size unchanged', liveAfter.size, liveBefore.size)
    checkEqual('live zotero.sqlite mtime unchanged', liveAfter.mtime, liveBefore.mtime)
    const leaked = (await fsp.readdir(tmpdir())).filter((entry) => entry.startsWith("litgraph-zotero-import-"))
    checkEqual('no litgraph-zotero-import-* temp dirs leaked', leaked.length, 0)

    console.log('[8] library state')
    response = await callRoute(host, 'GET', '/api/litgraph/status')
    check('status paperCount grew', typeof response.json?.paperCount === 'number' && response.json.paperCount >= 2, String(response.json?.paperCount))
    response = await callRoute(host, 'GET', '/api/litgraph/papers')
    check('papers list includes imported items', typeof response.json?.total === 'number' && response.json.total >= 2, String(response.json?.total))
    const importedTitles = (response.json?.items ?? []).map((paper) => paper.title)
    check('imported pdf paper listed', importedTitles.some((title) => title === fakePayload().title), JSON.stringify(importedTitles))
  } finally {
    await fsp.rm(dataRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

const startedAt = Date.now()
try {
  await main()
} catch (error) {
  console.error('FATAL', error)
  results.fail += 1
  results.failed.push('FATAL: ' + (error instanceof Error ? error.message : String(error)))
}
console.log('')
console.log('---')
console.log('passed: ' + results.pass + ', failed: ' + results.fail + ', elapsed: ' + ((Date.now() - startedAt) / 1000).toFixed(2) + 's')
if (results.failed.length > 0) {
  for (const failure of results.failed) console.log('  failed: ' + failure)
  process.exitCode = 1
}
