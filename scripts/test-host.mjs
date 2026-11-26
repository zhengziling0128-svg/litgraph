#!/usr/bin/env node
/**
 * Host-half end-to-end test (no real LLM spend, no live-profile changes).
 *
 *   npm run build && node scripts/test-host.mjs
 *
 * Mocks:
 *  - ctx.webServer.register -> captures exact routes; handlers are invoked directly.
 *  - req/res: node:stream Readable / Writable with the minimal ServerResponse surface.
 *  - ctx.llm: a scripted fake that answers with canned JSON so every code path
 *    (success / truncated->retry / needs_ocr) is deterministic.
 *
 * Real inputs: actual PDFs on this machine are streamed through the upload route,
 * unpdf really extracts them, files really land under a temp data root.
 */
import { existsSync, promises as fsp } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Readable, Writable } from 'node:stream'
import { finished } from 'node:stream/promises'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = dirname(here)
const libEntry = join(pluginRoot, 'lib', 'index.js')

// Deterministic OCR behaviour: pretend this machine has no recognizer so the
// scanned-PDF path always ends in needs_ocr instead of machine-dependent OCR.
process.env.LITGRAPH_OCR_DISABLE = '1'
// Journal metrics would otherwise hit the real easyScholar API in the background;
// the offline assertions below rely on the disabled path.
process.env.LITGRAPH_METRICS_DISABLE = '1'

// Sample PDFs are not committed (copyright/size). Point these three env vars at any
// text-layer PDF, a second text-layer PDF, and a scanned (image-only) PDF.
const SAMPLE_PDF = process.env.LITGRAPH_TEST_PDF ?? join(pluginRoot, 'fixtures', 'paper.pdf')
const SECOND_PDF = process.env.LITGRAPH_TEST_PDF_2 ?? join(pluginRoot, 'fixtures', 'paper-2.pdf')
const SCANNED_PDF = process.env.LITGRAPH_TEST_SCAN ?? join(pluginRoot, 'fixtures', 'scanned.pdf')

const results = { pass: 0, fail: 0, failed: [] }
function check(name, condition, detail = '') {
  if (condition) {
    results.pass += 1
    console.log('  ok   ' + name)
  } else {
    results.fail += 1
    results.failed.push(name + (detail ? ' :: ' + detail : ''))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}
function checkEqual(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  check(name, a === e, 'expected ' + e + ', got ' + a)
}
function checkIncludes(name, haystack, needle) {
  check(name, typeof haystack === 'string' && haystack.includes(needle), 'missing ' + JSON.stringify(needle))
}

// -- mock HTTP ----------------------------------------------------------------

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
  res.text = () => Buffer.concat(chunks).toString('utf8')
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
      return typeof dispose === 'function' ? dispose : () => undefined
    },
    llm,
    get(name) {
      return name === 'llm' ? llm : null
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
  const target = new URL(url, 'http://127.0.0.1:55992')
  const route = host.find(target.pathname)
  const req = new Readable({ read() {} })
  req.method = method
  req.url = url
  req.headers = { host: '127.0.0.1:55992', ...(options.headers ?? {}) }
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

async function upload(host, filePath, fileName = basename(filePath ?? 'upload.pdf'), asText = null) {
  const body = asText === null ? await fsp.readFile(filePath) : Buffer.from(asText, 'utf8')
  return await callRoute(host, 'POST', '/api/litgraph/upload', {
    headers: { 'x-litgraph-filename': encodeURIComponent(fileName) },
    body,
  })
}

async function waitForJob(host, jobId, timeoutMs = 90_000) {
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

// -- fake LLM -----------------------------------------------------------------

function createMockLlm(script) {
  const calls = []
  return {
    calls,
    async listModels(provider) {
      calls.provider = provider
      return [
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
        { id: 'deepseek-flash', name: 'DeepSeek-Flash' },
      ]
    },
    async prepareCall(config, _signal, configure) {
      const controls = {
        provider: config.provider,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      }
      const finalConfig = typeof configure === 'function' ? configure(controls, { id: config.model }) : controls
      const call = { config: finalConfig }
      calls.push(call)
      const step = script[Math.min(calls.length - 1, script.length - 1)]
      return {
        config: finalConfig,
        async *stream(options) {
          call.options = options
          if (step.kind === 'error') {
            yield { type: 'finish', reason: { kind: 'error', failure: { code: step.code, message: 'mock llm failure' } } }
            return
          }
          yield { type: 'block-start', index: 0, blockType: 'text' }
          if (step.kind === 'truncated') {
            yield { type: 'text-delta', text: '{"title": "cut off' }
            yield { type: 'finish', reason: { kind: 'max-tokens' } }
            return
          }
          yield { type: 'text-delta', text: step.text }
          yield { type: 'usage', usage: { inputTokens: 1200, outputTokens: 160 } }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
}

function fakePayload(overrides = {}) {
  return {
    title: '时频分析在旋转机械故障诊断中的应用',
    authors: ['Yihao Bai', 'Weidong Cheng', 'Weigang Wen'],
    year: 2023,
    venue: 'Shock and Vibration',
    abstract: '本文综述了时频分析在旋转机械故障诊断中的应用。',
    summary: '该文系统回顾了时频分析方法及其在旋转机械故障诊断中的典型应用。',
    contributions: ['归纳了常用时频分析方法', '总结了故障诊断应用场景'],
    method: '时频分析',
    keywords: ['时频分析', '故障诊断', '旋转机械'],
    categories: ['机械工程 > 故障诊断 > 时频分析'],
    relations: [],
    ...overrides,
  }
}

// -- test driver --------------------------------------------------------------

const tempRoots = []
async function makeDataRoot(label) {
  const root = join(tmpdir(), 'litgraph-test-host-' + label + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))
  tempRoots.push(root)
  return root
}

async function main() {
  let module
  try {
    module = await import(pathToFileURL(libEntry).href)
  } catch (error) {
    console.error('cannot import ' + libEntry + ' - run "npm run build" first')
    throw error
  }
  for (const [label, file] of [['sample', SAMPLE_PDF], ['second', SECOND_PDF], ['scanned', SCANNED_PDF]]) {
    if (!existsSync(file)) {
      console.error('missing ' + label + ' PDF: ' + file)
      process.exitCode = 2
      return
    }
  }

  console.log('[1] module + route contract')
  checkEqual('module name', module.name, 'dsh-litgraph')
  check('inject has webServer', Array.isArray(module.inject) && module.inject.includes('webServer'))
  check('inject has llm', Array.isArray(module.inject) && module.inject.includes('llm'))
  checkEqual('apply is a function', typeof module.apply, 'function')

  const dataRoot = await makeDataRoot('main')
  const llm = createMockLlm([{ text: JSON.stringify(fakePayload()) }])
  const host = createHost(module, llm, { dataRoot, llmMaxTokens: 2400 })

  // 21 route definitions collapse to 19 distinct paths: /api/litgraph/paper
  // carries GET+HEAD, DELETE and PATCH, which the host web server requires to be
  // one registration per path.
  checkEqual('route count', host.routes.length, 20)
  checkEqual('unique route paths', new Set(host.routes.map((route) => route.path)).size, 20)
  check('all routes are kind=exact', host.routes.every((route) => route.kind === 'exact'))
  for (const routePath of ['/api/litgraph/status', '/api/litgraph/graph', '/api/litgraph/papers', '/api/litgraph/paper', '/api/litgraph/settings', '/api/litgraph/open', '/api/litgraph/metrics/refresh', '/api/litgraph/metrics/probe', '/api/litgraph/job', '/api/litgraph/upload', '/api/litgraph/file', '/api/litgraph/ocr/probe', '/api/litgraph/insight', '/api/litgraph/zotero/scan', '/api/litgraph/zotero/import', '/api/litgraph/retry-failed', '/api/litgraph/zotero/state', '/api/litgraph/zotero/authorize', '/api/litgraph/zotero/sync', '/api/litgraph/paper/zotero']) {
    check('registered ' + routePath, host.routes.some((route) => route.path === routePath && typeof route.handler === 'function'))
  }

  console.log('[2] origin fence, methods, empty status')
  let response = await callRoute(host, 'GET', '/api/litgraph/status', { headers: { origin: 'https://evil.example' } })
  checkEqual('cross-site origin is rejected', response.status, 403)
  response = await callRoute(host, 'GET', '/api/litgraph/status', { headers: { origin: 'http://127.0.0.1:55992' } })
  checkEqual('loopback origin accepted', response.status, 200)
  checkEqual('cors origin echoed', response.headers['access-control-allow-origin'], 'http://127.0.0.1:55992')
  response = await callRoute(host, 'POST', '/api/litgraph/status')
  checkEqual('POST on GET route is 405', response.status, 405)
  checkIncludes('405 exposes Allow', response.headers.allow, 'GET')
  response = await callRoute(host, 'OPTIONS', '/api/litgraph/upload', { headers: { origin: 'http://127.0.0.1:55992' } })
  checkEqual('OPTIONS preflight is 204', response.status, 204)
  response = await callRoute(host, 'GET', '/api/litgraph/status')
  checkEqual('empty status ok', response.json?.ok, true)
  checkEqual('empty status mode', response.json?.mode, 'host')
  checkEqual('empty paperCount', response.json?.paperCount, 0)
  checkEqual('empty clusterCount', response.json?.clusterCount, 0)
  checkEqual('storage root', response.json?.storage?.dataRoot, dataRoot)
  response = await callRoute(host, 'GET', '/api/litgraph/settings')
  checkEqual('default clusterLevel', response.json?.settings?.clusterLevel, 2)
  checkEqual('default metricsEnabled', response.json?.settings?.metricsEnabled, true)
  response = await callRoute(host, 'GET', '/api/litgraph/paper?id=nope')
  checkEqual('unknown paper 404', response.status, 404)
  response = await callRoute(host, 'GET', '/api/litgraph/job?id=nope')
  checkEqual('unknown job 404', response.status, 404)

  console.log('[3] real PDF upload -> extraction -> fixed LLM payload -> ready')
  const sampleBytes = await fsp.readFile(SAMPLE_PDF)
  const uploadResponse = await upload(host, SAMPLE_PDF)
  checkEqual('upload 202', uploadResponse.status, 202)
  checkEqual('upload ok', uploadResponse.json?.ok, true)
  checkEqual('upload not duplicate', uploadResponse.json?.duplicate, false)
  check('upload jobId', typeof uploadResponse.json?.jobId === 'string' && uploadResponse.json.jobId.length > 10)
  check('upload paperId', typeof uploadResponse.json?.paperId === 'string' && uploadResponse.json.paperId.startsWith('p_'))
  const paperId = uploadResponse.json.paperId
  const job = await waitForJob(host, uploadResponse.json.jobId)
  checkEqual('job done', job.state, 'done')
  checkIncludes('job message', job.message, 'ready:')
  checkEqual('job paperId', job.paperId, paperId)

  response = await callRoute(host, 'GET', '/api/litgraph/paper?id=' + encodeURIComponent(paperId))
  const paper = response.json
  checkEqual('paper status ready', paper?.status, 'ready')
  checkEqual('paper title from LLM', paper?.title, fakePayload().title)
  checkEqual('paper year', paper?.year, 2023)
  checkEqual('paper categories', paper?.categories, ['机械工程 > 故障诊断 > 时频分析'])
  checkEqual('paper keywords', paper?.keywords, ['时频分析', '故障诊断', '旋转机械'])
  checkEqual('paper hasFile', paper?.hasFile, true)
  checkEqual('paper fileName', paper?.fileName, basename(SAMPLE_PDF))
  checkEqual('paper size', paper?.size, sampleBytes.length)
  check('paper pages', typeof paper?.pages === 'number' && paper.pages >= 10)
  check('paper textChars', typeof paper?.textChars === 'number' && paper.textChars > 10_000)
  check('paper clusterId', typeof paper?.clusterId === 'string' && paper.clusterId.length > 1)
  // graph.ts now clusters by the second category level: label is the sub-field, group carries the top field.
  checkEqual('paper clusterLabel', paper?.clusterLabel, '故障诊断')
  check('paper degree is number', typeof paper?.degree === 'number')
  check('paper sha256', typeof paper?.sha256 === 'string' && paper.sha256.length === 64)
  checkEqual('paper llmModel', paper?.llmModel, 'deepseek-flash')

  checkEqual('llm called once', llm.calls.length, 1)
  checkEqual('llm provider', llm.calls[0]?.config?.provider, 'deepseek-official')
  checkEqual('llm model picked', llm.calls[0]?.config?.model, 'deepseek-flash')
  checkEqual('reasoningEffort off', llm.calls[0]?.config?.reasoningEffort, 'off')
  checkEqual('temperature 0', llm.calls[0]?.config?.temperature, 0)
  checkIncludes('system prompt asks JSON', llm.calls[0]?.options?.system, 'JSON')
  checkIncludes('user prompt has categories section', llm.calls[0]?.options?.messages?.[0]?.content?.[0]?.text, '已有类目')
  checkEqual('user message role', llm.calls[0]?.options?.messages?.[0]?.role, 'user')

  const fulltext = await fsp.readFile(join(dataRoot, 'papers', paperId, 'fulltext.txt'), 'utf8')
  check('fulltext persisted', fulltext.length > 10_000)
  check('fulltext contains abstract text', fulltext.toLowerCase().includes('time-frequency') || fulltext.toLowerCase().includes('abstract'))
  const sourceFile = join(dataRoot, 'sources', paper.sha256 + '.pdf')
  check('source pdf persisted', existsSync(sourceFile))
  checkEqual('source pdf bytes', (await fsp.stat(sourceFile)).size, sampleBytes.length)

  console.log('[4] graph / list / search / file streaming')
  response = await callRoute(host, 'GET', '/api/litgraph/graph')
  checkEqual('graph nodes', response.json?.nodes?.length, 1)
  checkEqual('graph clusters', response.json?.clusters?.length, 1)
  checkEqual('graph node title', response.json?.nodes?.[0]?.title, fakePayload().title)
  checkEqual('graph node clusterLabel', response.json?.nodes?.[0]?.clusterLabel, '故障诊断')
  checkEqual('graph cluster group', response.json?.clusters?.[0]?.group, '机械工程')
  checkEqual('graph cluster path', response.json?.clusters?.[0]?.path, '机械工程 > 故障诊断')

  response = await callRoute(host, 'GET', '/api/litgraph/papers')
  checkEqual('papers total', response.json?.total, 1)
  checkEqual('papers page', response.json?.page, 1)
  checkEqual('papers pageSize default', response.json?.pageSize, 50)
  checkEqual('papers item clusterId', response.json?.items?.[0]?.clusterId, paper.clusterId)
  response = await callRoute(host, 'GET', '/api/litgraph/papers?q=' + encodeURIComponent('时频'))
  checkEqual('search hit', response.json?.total, 1)
  response = await callRoute(host, 'GET', '/api/litgraph/papers?q=zzzz-no-hit')
  checkEqual('search miss', response.json?.total, 0)
  response = await callRoute(host, 'GET', '/api/litgraph/papers?cluster=' + encodeURIComponent(paper.clusterId))
  checkEqual('cluster filter', response.json?.total, 1)
  response = await callRoute(host, 'GET', '/api/litgraph/papers?sort=title&order=asc')
  checkEqual('sort title asc total', response.json?.total, 1)

  response = await callRoute(host, 'GET', '/api/litgraph/file?id=' + encodeURIComponent(paperId))
  checkEqual('file 200', response.status, 200)
  checkEqual('file content-type', response.headers['content-type'], 'application/pdf')
  checkIncludes('file disposition inline', response.headers['content-disposition'], 'inline')
  checkEqual('file bytes', response.buffer.length, sampleBytes.length)
  checkEqual('file starts as PDF', response.buffer.subarray(0, 5).toString('latin1'), '%PDF-')
  response = await callRoute(host, 'HEAD', '/api/litgraph/file?id=' + encodeURIComponent(paperId))
  checkEqual('HEAD file 200', response.status, 200)
  checkEqual('HEAD file empty body', response.buffer.length, 0)

  console.log('[5] dedupe, invalid upload, scanned PDF')
  response = await upload(host, SAMPLE_PDF)
  checkEqual('duplicate upload 202', response.status, 202)
  checkEqual('duplicate flagged', response.json?.duplicate, true)
  checkEqual('duplicate same paper', response.json?.paperId, paperId)
  response = await callRoute(host, 'GET', '/api/litgraph/papers')
  checkEqual('dedupe did not add a paper', response.json?.total, 1)

  response = await upload(host, null, 'not-a-pdf.pdf', 'hello world, not a pdf')
  checkEqual('non-pdf 400', response.status, 400)
  checkEqual('non-pdf code', response.json?.code, 'NOT_A_PDF')
  response = await callRoute(host, 'GET', '/api/litgraph/papers')
  checkEqual('non-pdf not indexed', response.json?.total, 1)

  const scanUpload = await upload(host, SCANNED_PDF)
  checkEqual('scanned upload 202', scanUpload.status, 202)
  const scanJob = await waitForJob(host, scanUpload.json.jobId)
  checkEqual('scanned job done', scanJob.state, 'done')
  checkIncludes('scanned job message', scanJob.message, 'scanned PDF stored')
  const scanPaper = (await callRoute(host, 'GET', '/api/litgraph/paper?id=' + encodeURIComponent(scanUpload.json.paperId))).json
  checkEqual('scanned paper status', scanPaper?.status, 'needs_ocr')
  checkEqual('scanned paper hasFile', scanPaper?.hasFile, true)
  checkEqual('scanned paper did not call llm', llm.calls.length, 1)
  response = await callRoute(host, 'GET', '/api/litgraph/status')
  checkEqual('status paperCount 2', response.json?.paperCount, 2)
  checkEqual('status byStatus.ready', response.json?.byStatus?.ready, 1)
  checkEqual('status byStatus.needs_ocr', response.json?.byStatus?.needs_ocr, 1)

  console.log('[6] delete + persistence across a new host instance')
  response = await callRoute(host, 'DELETE', '/api/litgraph/paper?id=' + encodeURIComponent(paperId))
  checkEqual('delete ok', response.json?.ok, true)
  checkEqual('delete id', response.json?.id, paperId)
  response = await callRoute(host, 'DELETE', '/api/litgraph/paper?id=' + encodeURIComponent(paperId))
  checkEqual('delete again 404', response.status, 404)
  response = await callRoute(host, 'GET', '/api/litgraph/file?id=' + encodeURIComponent(paperId))
  checkEqual('deleted paper file 404', response.status, 404)
  response = await callRoute(host, 'GET', '/api/litgraph/papers')
  checkEqual('one paper left after delete', response.json?.total, 1)

  const llm2 = createMockLlm([{ text: JSON.stringify(fakePayload()) }])
  const host2 = createHost(module, llm2, { dataRoot })
  response = await callRoute(host2, 'GET', '/api/litgraph/status')
  checkEqual('persisted paperCount', response.json?.paperCount, 1)
  response = await callRoute(host2, 'GET', '/api/litgraph/papers')
  checkEqual('persisted scanned paper', response.json?.items?.[0]?.status, 'needs_ocr')
  checkEqual('new host did not call llm', llm2.calls.length, 0)

  console.log('[7] truncated JSON -> single retry with bigger token budget')
  const retryRoot = await makeDataRoot('retry')
  const retryLlm = createMockLlm([
    { kind: 'truncated' },
    { text: JSON.stringify(fakePayload({ title: '重试后成功的论文' })) },
  ])
  const retryHost = createHost(module, retryLlm, { dataRoot: retryRoot, llmMaxTokens: 2400 })
  const retryUpload = await upload(retryHost, SAMPLE_PDF)
  const retryJob = await waitForJob(retryHost, retryUpload.json.jobId)
  checkEqual('retry job done', retryJob.state, 'done')
  checkEqual('retry called llm twice', retryLlm.calls.length, 2)
  checkEqual('retry second maxTokens bigger', retryLlm.calls[1].config.maxTokens, 4320)
  checkIncludes('retry prompt asks for repair', retryLlm.calls[1].options.messages[0].content[0].text, '修正要求')
  const retryPaper = (await callRoute(retryHost, 'GET', '/api/litgraph/paper?id=' + encodeURIComponent(retryUpload.json.paperId))).json
  checkEqual('retry paper ready', retryPaper?.status, 'ready')
  checkEqual('retry paper title', retryPaper?.title, '重试后成功的论文')

  console.log('[8] keepSourcePdf=false drops the original bytes')
  const noPdfRoot = await makeDataRoot('nopdf')
  const noPdfLlm = createMockLlm([{ text: JSON.stringify(fakePayload({ title: '不保留原件' })) }])
  const noPdfHost = createHost(module, noPdfLlm, { dataRoot: noPdfRoot, keepSourcePdf: false })
  const noPdfUpload = await upload(noPdfHost, SECOND_PDF)
  const noPdfJob = await waitForJob(noPdfHost, noPdfUpload.json.jobId)
  checkEqual('no-pdf job done', noPdfJob.state, 'done')
  const noPdfPaper = (await callRoute(noPdfHost, 'GET', '/api/litgraph/paper?id=' + encodeURIComponent(noPdfUpload.json.paperId))).json
  checkEqual('no-pdf hasFile false', noPdfPaper?.hasFile, false)
  response = await callRoute(noPdfHost, 'GET', '/api/litgraph/file?id=' + encodeURIComponent(noPdfUpload.json.paperId))
  checkEqual('no-pdf file route 404', response.status, 404)
  const noPdfSources = await fsp.readdir(join(noPdfRoot, 'sources')).catch(() => [])
  checkEqual('no-pdf sources empty', noPdfSources.length, 0)
  const noPdfTmp = await fsp.readdir(join(noPdfRoot, 'tmp')).catch(() => [])
  checkEqual('no-pdf tmp cleaned', noPdfTmp.length, 0)

  console.log('[8b] rating / open / metrics / settings extensions')
  const noPdfId = noPdfUpload.json.paperId
  response = await callRoute(noPdfHost, 'PATCH', '/api/litgraph/paper', { body: JSON.stringify({ id: noPdfId, rating: 4 }) })
  checkEqual('rating patch ok', response.json?.ok, true)
  checkEqual('rating patch value', response.json?.paper?.rating, 4)
  response = await callRoute(noPdfHost, 'PATCH', '/api/litgraph/paper', { body: JSON.stringify({ id: noPdfId, rating: 6 }) })
  checkEqual('rating out of range is 400', response.status, 400)
  response = await callRoute(noPdfHost, 'PATCH', '/api/litgraph/paper', { body: JSON.stringify({ id: noPdfId, rating: 2.5 }) })
  checkEqual('non-integer rating is 400', response.status, 400)
  response = await callRoute(noPdfHost, 'GET', '/api/litgraph/papers')
  const ratedItem = (response.json?.items ?? []).find((item) => item.id === noPdfId)
  checkEqual('papers list surfaces rating', ratedItem?.rating, 4)
  checkEqual('papers list metrics null before lookup', ratedItem?.metrics, null)

  // A paper whose bytes were dropped must report 'no file' as data, not a 500.
  response = await callRoute(noPdfHost, 'POST', '/api/litgraph/open', { body: JSON.stringify({ id: noPdfId }) })
  checkEqual('open no file is 404', response.status, 404)
  checkEqual('open no file via none', response.json?.via, 'none')
  checkEqual('open no file message', response.json?.error, 'no file')
  response = await callRoute(noPdfHost, 'POST', '/api/litgraph/open', { body: JSON.stringify({ id: 'nope' }) })
  checkEqual('open unknown paper is 404', response.status, 404)

  response = await callRoute(noPdfHost, 'PUT', '/api/litgraph/settings', { body: JSON.stringify({ clusterLevel: 3 }) })
  checkEqual('settings clusterLevel saved', response.json?.settings?.clusterLevel, 3)
  response = await callRoute(noPdfHost, 'PUT', '/api/litgraph/settings', { body: JSON.stringify({ clusterLevel: 4 }) })
  checkEqual('settings clusterLevel invalid is 400', response.status, 400)
  response = await callRoute(noPdfHost, 'PUT', '/api/litgraph/settings', { body: JSON.stringify({ metricsEnabled: false, metricsSecretKey: 'test-key' }) })
  checkEqual('settings metricsEnabled saved', response.json?.settings?.metricsEnabled, false)
  checkEqual('settings metricsSecretKey saved', response.json?.settings?.metricsSecretKey, 'test-key')

  // LITGRAPH_METRICS_DISABLE=1 makes refresh queue nothing but still answer 200.
  response = await callRoute(noPdfHost, 'POST', '/api/litgraph/metrics/refresh', { body: '{}' })
  checkEqual('metrics refresh ok', response.json?.ok, true)
  checkEqual('metrics refresh queued 0', response.json?.queued, 0)
  checkEqual('metrics refresh skipped 1', response.json?.skipped, 1)
  response = await callRoute(noPdfHost, 'GET', '/api/litgraph/metrics/probe?venue=Shock%20and%20Vibration')
  checkEqual('metrics probe status 200', response.status, 200)
  checkEqual('metrics probe disabled ok false', response.json?.ok, false)

  console.log('[9] missing credential is a clean failure (no retry storm)')
  const authRoot = await makeDataRoot('auth')
  const authLlm = createMockLlm([{ kind: 'error', code: 'MISSING_CREDENTIAL' }])
  const authHost = createHost(module, authLlm, { dataRoot: authRoot })
  const authUpload = await upload(authHost, SAMPLE_PDF)
  const authJob = await waitForJob(authHost, authUpload.json.jobId)
  checkEqual('auth job failed', authJob.state, 'failed')
  checkIncludes('auth message hints credential', authJob.message, 'MISSING_CREDENTIAL')
  checkEqual('auth failure not retried', authLlm.calls.length, 1)
  const authPaper = (await callRoute(authHost, 'GET', '/api/litgraph/paper?id=' + encodeURIComponent(authUpload.json.paperId))).json
  checkEqual('auth paper status failed', authPaper?.status, 'failed')

  // A failed upload must be retryable from the same UI (Zotero re-import / retry route).
  const retry = await callRoute(authHost, 'POST', '/api/litgraph/retry-failed', { json: {} })
  checkEqual('retry-failed status', retry.status, 200)
  checkEqual('retry-failed retried count', retry.json?.retried?.length, 1)
  checkEqual('retry-failed paper reused', retry.json?.retried?.[0]?.paperId, authUpload.json.paperId)
  const retriedJob = await waitForJob(authHost, retry.json.retried[0].jobId)
  checkEqual('retry job failed again (mock still unauthenticated)', retriedJob.state, 'failed')
}

const startedAt = Date.now()
try {
  await main()
} catch (error) {
  console.error('FATAL', error)
  results.fail += 1
  results.failed.push('FATAL: ' + (error instanceof Error ? error.message : String(error)))
} finally {
  for (const root of tempRoots) await fsp.rm(root, { recursive: true, force: true }).catch(() => undefined)
}
console.log('')
console.log('---')
console.log('passed: ' + results.pass + ', failed: ' + results.fail + ', elapsed: ' + ((Date.now() - startedAt) / 1000).toFixed(2) + 's')
if (results.failed.length > 0) {
  for (const failure of results.failed) console.log('  failed: ' + failure)
  process.exitCode = 1
}
