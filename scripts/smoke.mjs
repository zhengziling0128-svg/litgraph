#!/usr/bin/env node
/**
 * Offline smoke test for the dsh-litgraph client bundle.
 *
 * Loads the built lib/client.js the way the DSH shell does (window.__ModuleLoader__
 * + injected require for platform modules), registers the plugin against a fake
 * cordis ctx, then renders the registered workbench with react-test-renderer
 * against a fake /api/litgraph host.
 *
 * Covered: bundle wrapper + externals, plugin contract + slot registration,
 * stylesheet injection/disposal, graph render, search highlight + dim + submit,
 * detail panel, delete flow, library pagination + sort, drop upload -> job poll
 * -> success toast.
 *
 * Run: node scripts/smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const React = require('react')
const TestRenderer = require('react-test-renderer')
const { act } = TestRenderer

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = join(here, '..', 'lib', 'client.js')

let pass = 0
const failures = []
function report(name, error) {
  if (error) {
    failures.push({ name, error })
    const detail = error && error.stack ? error.stack.split('\n').slice(0, 5).join('\n     ') : String(error)
    console.log('FAIL ' + name + '\n     ' + detail)
  } else {
    pass += 1
    console.log('PASS ' + name)
  }
}
function check(name, fn) {
  try {
    fn()
    report(name, null)
  } catch (error) {
    report(name, error)
  }
}
async function checkAsync(name, fn) {
  try {
    await fn()
    report(name, null)
  } catch (error) {
    report(name, error)
  }
}

// ---------------------------------------------------------------------------
// 1. load the bundle the way the shell does
// ---------------------------------------------------------------------------
let capturedEntry = null
// The bundle is evaluated as a function body with `window` as its only
// parameter, so every module in the bundle closes over this stub — it must
// carry the browser APIs the workbench touches, not just the loader.
const windowStub = {
  __ModuleLoader__: {
    load(entry) {
      capturedEntry = entry
    },
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
  confirm: () => true,
  open: () => {},
}
const bundleCode = readFileSync(bundlePath, 'utf8')
new Function('window', bundleCode)(windowStub)

check('bundle: registers exactly one module factory', () => {
  assert.ok(capturedEntry, 'window.__ModuleLoader__.load was not called')
  assert.equal(capturedEntry.id, 'dsh-litgraph')
  assert.equal(typeof capturedEntry.factory, 'function')
})

const requiredSpecifiers = []
function requireShim(id) {
  requiredSpecifiers.push(id)
  if (id === 'react') return React
  if (id === 'react-dom') return require('react-dom')
  if (id === 'react/jsx-runtime') return require('react/jsx-runtime')
  throw new Error('unexpected external module: ' + id)
}

let plugin = null
check('bundle: factory resolves with only platform externals', () => {
  plugin = capturedEntry.factory(requireShim)
  assert.equal(typeof plugin.apply, 'function')
  assert.equal(plugin.name, 'litgraph-client')
  assert.deepEqual(plugin.inject, ['slots'])
  assert.deepEqual(requiredSpecifiers.slice().sort(), ['react', 'react-dom', 'react/jsx-runtime'])
})

// ---------------------------------------------------------------------------
// 2. cordis ctx: slots registration
// ---------------------------------------------------------------------------
function makeCtx() {
  const injections = []
  const registrations = []
  const disposers = []
  const effects = []
  const ctx = {
    effect(fn, label) {
      effects.push(label)
      const disposer = fn()
      if (typeof disposer === 'function') disposers.push(disposer)
      return disposer
    },
    slots: {
      inject(name, callback) {
        injections.push(name)
        const result = callback()
        return typeof result === 'function' ? result : () => {}
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
    provide() {},
    reflect: { provide() {} },
    on() {},
  }
  return { ctx, injections, registrations, disposers, effects }
}

const registration = makeCtx()
plugin.apply(registration.ctx)

const mainRegistration = registration.registrations.find((entry) => entry.options.name === 'main')
const listRegistration = registration.registrations.find((entry) => entry.options.name === 'sidebar.panellist')

check('apply(ctx): injects slots', () => {
  assert.deepEqual(registration.injections.slice().sort(), ['main', 'sidebar.panellist'])
})

check('apply(ctx): registers keyed main panel "litgraph"', () => {
  assert.ok(mainRegistration, 'main slot was not registered')
  assert.equal(mainRegistration.options.key, 'litgraph')
  assert.equal(typeof mainRegistration.component, 'function')
})

check('apply(ctx): registers sidebar.panellist entry "litgraph"', () => {
  assert.ok(listRegistration, 'sidebar.panellist was not registered')
  assert.equal(listRegistration.options.id, 'litgraph')
  assert.equal(listRegistration.options.order, 40)
  assert.equal(listRegistration.options.label(), 'LitGraph')
  assert.equal(typeof listRegistration.component, 'function')
})

check('apply(ctx): owns the stylesheet through ctx.effect', () => {
  assert.ok(registration.effects.some((label) => String(label).indexOf('litgraph') >= 0))
})

// ---------------------------------------------------------------------------
// 3. stylesheet injection with a fake DOM
// ---------------------------------------------------------------------------
function makeFakeDocument() {
  const elements = new Map()
  const headChildren = []
  const head = {
    appendChild(element) {
      element.parentNode = head
      headChildren.push(element)
      if (element.id) elements.set(element.id, element)
      return element
    },
    removeChild(element) {
      element.parentNode = null
      const index = headChildren.indexOf(element)
      if (index >= 0) headChildren.splice(index, 1)
      if (element.id) elements.delete(element.id)
      return element
    },
  }
  const document = {
    head,
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        id: '',
        attributes: {},
        textContent: '',
        parentNode: null,
        setAttribute(name, value) {
          this.attributes[name] = value
        },
      }
    },
    getElementById(id) {
      return elements.get(id) || null
    },
  }
  return { document, head, headChildren }
}

const styleDom = makeFakeDocument()
const styleWorld = makeCtx()
globalThis.document = styleDom.document
plugin.apply(styleWorld.ctx)

const styleTags = () => styleDom.headChildren.filter((element) => element.id === 'dsh-litgraph-styles')

check('stylesheet: injected as <style data-plugin="dsh-litgraph">', () => {
  assert.equal(styleTags().length, 1, 'style element was not injected exactly once')
  const style = styleTags()[0]
  assert.equal(style.attributes['data-plugin'], 'dsh-litgraph')
  assert.ok(style.textContent.length > 5000, 'stylesheet looks empty')
  assert.ok(style.textContent.includes('.lg-root'), 'stylesheet misses .lg-root')
  assert.ok(style.textContent.includes('--dsw-font-family'), 'stylesheet should consume DSH theme tokens')
  assert.ok(style.textContent.includes('.lg-drop-overlay'), 'stylesheet misses the drop overlay')
})

plugin.apply(makeCtx().ctx)
check('stylesheet: a second activation does not duplicate the tag', () => {
  assert.equal(styleTags().length, 1)
})

check('stylesheet: disposal removes the tag', () => {
  const disposers = styleWorld.disposers.slice().reverse()
  for (const dispose of disposers) dispose()
  assert.equal(styleTags().length, 0)
  assert.equal(globalThis.document.getElementById('dsh-litgraph-styles'), null)
})

delete globalThis.document

// ---------------------------------------------------------------------------
// 4. fake host: /api/litgraph/*
// ---------------------------------------------------------------------------
const CLUSTERS = [
  { id: 'llm', label: '大语言模型 / NLP', color: '#ffd166' },
  { id: 'rl', label: '强化学习与对齐', color: '#f78c6c' },
  { id: 'cv', label: '计算机视觉 / 生成模型', color: '#67e8f9' },
  { id: 'sys', label: '系统 / 数据管理', color: '#a78bfa' },
]
const TOPICS = [
  'Transformer scaling laws',
  'RLHF alignment survey',
  'Diffusion image editing',
  'Graph database indexing',
  'Sparse attention kernels',
  'Reward model ensembles',
]
const PAPERS = []
for (let index = 0; index < 25; index += 1) {
  const cluster = CLUSTERS[index % CLUSTERS.length]
  const topic = TOPICS[index % TOPICS.length]
  const id = 'p' + String(index + 1)
  PAPERS.push({
    id,
    title: topic + ' #' + (index + 1),
    authors: ['Ada Lovelace', 'Alan Turing'],
    year: 2018 + (index % 7),
    venue: index % 2 === 0 ? 'NeurIPS' : 'ICML',
    categories: [cluster.label],
    status: index % 9 === 0 ? 'processing' : 'ready',
    updatedAt: new Date(Date.UTC(2025, 0, 1 + index)).toISOString(),
    addedAt: new Date(Date.UTC(2024, 8, 1 + index)).toISOString(),
    fileName: id + '.pdf',
    size: 1024 * (120 + index),
    clusterId: cluster.id,
    clusterLabel: cluster.label,
    abstract: 'Abstract of ' + topic + ' — a long paragraph used by the detail panel.',
    keywords: ['transformer', 'graph', 'retrieval'],
    summary: 'AI summary: this paper studies ' + topic + ' with a graph-based method.',
    contributions: ['Contribution one for ' + id, 'Contribution two for ' + id],
    method: 'Method description for ' + id + '.',
    hasFile: true,
  })
}

const GRAPH = {
  nodes: PAPERS.slice(0, 12).map((paper, index) => ({
    id: paper.id,
    title: paper.title,
    clusterId: paper.clusterId,
    clusterLabel: paper.clusterLabel,
    categories: paper.categories,
    year: paper.year,
    status: paper.status,
    degree: 1 + (index % 5),
  })),
  edges: [
    { source: 'p1', target: 'p2', kind: 'similar', weight: 0.9 },
    { source: 'p1', target: 'p3', kind: 'category', weight: 0.6 },
    { source: 'p2', target: 'p4', kind: 'category', weight: 0.4 },
    { source: 'p5', target: 'p6', kind: 'similar', weight: 0.8 },
  ],
  clusters: CLUSTERS,
}

const requests = []
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function trimPaper(paper) {
  const { abstract, keywords, summary, contributions, method, hasFile, parseNote, ...rest } = paper
  return rest
}

function filterPapers(url) {
  const q = (url.searchParams.get('q') || '').toLowerCase()
  const cluster = url.searchParams.get('cluster') || ''
  const sort = url.searchParams.get('sort') || 'updatedAt'
  const order = url.searchParams.get('order') || 'desc'
  const page = Number(url.searchParams.get('page') || '1')
  const pageSize = Number(url.searchParams.get('pageSize') || '20')
  let items = PAPERS.slice()
  if (q) {
    items = items.filter((paper) => (paper.title + ' ' + paper.authors.join(' ') + ' ' + paper.keywords.join(' ')).toLowerCase().includes(q))
  }
  if (cluster) items = items.filter((paper) => paper.clusterId === cluster)
  items.sort((a, b) => {
    const cmp = String(a[sort]).localeCompare(String(b[sort]))
    return order === 'asc' ? cmp : -cmp
  })
  const total = items.length
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize).map(trimPaper), total, page, pageSize, sort, order }
}

let jobPollCount = 0
let uploadHit = null
function fakeFetch(input, init = {}) {
  const raw = typeof input === 'string' ? input : input.url
  const url = new URL(raw, 'http://127.0.0.1:55992')
  const method = (init.method || 'GET').toUpperCase()
  requests.push({ path: url.pathname, search: url.search, method })
  if (url.pathname === '/api/litgraph/status') {
    return Promise.resolve(jsonResponse({ ok: true, mode: 'smoke', paperCount: PAPERS.length, clusterCount: CLUSTERS.length, storage: 'memory' }))
  }
  if (url.pathname === '/api/litgraph/graph') return Promise.resolve(jsonResponse(GRAPH))
  if (url.pathname === '/api/litgraph/papers') return Promise.resolve(jsonResponse(filterPapers(url)))
  if (url.pathname === '/api/litgraph/paper' && method === 'GET') {
    const id = url.searchParams.get('id')
    const paper = PAPERS.find((item) => item.id === id)
    if (!paper) return Promise.resolve(jsonResponse({ error: 'not found' }, 404))
    return Promise.resolve(jsonResponse({ ...paper, degree: 3 }))
  }
  if (url.pathname === '/api/litgraph/paper' && method === 'DELETE') {
    return Promise.resolve(jsonResponse({ ok: true, id: url.searchParams.get('id') }))
  }
  if (url.pathname === '/api/litgraph/upload' && method === 'POST') {
    uploadHit = { headers: init.headers, body: init.body, name: decodeURIComponent(init.headers['x-litgraph-filename'] || '') }
    jobPollCount = 0
    return Promise.resolve(jsonResponse({ ok: true, jobId: 'job-1', paperId: 'p13' }, 202))
  }
  if (url.pathname === '/api/litgraph/job') {
    jobPollCount += 1
    const done = jobPollCount >= 2
    return Promise.resolve(
      jsonResponse({
        id: url.searchParams.get('id'),
        state: done ? 'done' : 'parsing',
        progress: done ? 100 : 55,
        message: done ? '已入库' : '解析 PDF 中…',
        paperId: 'p13',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    )
  }
  return Promise.resolve(jsonResponse({ error: 'unexpected route ' + url.pathname }, 404))
}

// ---------------------------------------------------------------------------
// 5. render the registered main component
// ---------------------------------------------------------------------------
globalThis.fetch = fakeFetch
globalThis.window = windowStub

const Workbench = mainRegistration.component
let renderer = null

async function flush(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

function allText(tree) {
  const values = []
  const walk = (node) => {
    if (node === null || node === undefined || node === false) return
    if (typeof node === 'string' || typeof node === 'number') {
      values.push(String(node))
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node.children) node.children.forEach(walk)
  }
  walk(tree)
  return values.join(' ')
}

function findByClass(className) {
  return renderer.root.findAll(
    (node) => typeof node.props.className === 'string' && node.props.className.split(' ').includes(className),
    { deep: true },
  )
}

function findPaths(path) {
  return requests.filter((entry) => entry.path === path)
}

const workbenchRoot = () => renderer.root.find((node) => node.props['data-litgraph'] === 'workbench')

await act(async () => {
  renderer = TestRenderer.create(React.createElement(Workbench))
})
await flush(40)

await checkAsync('render: workbench mounts with header, graph and library', async () => {
  const text = allText(renderer.toJSON())
  assert.ok(text.includes('LitGraph'), 'brand missing')
  assert.ok(text.includes('论文库'), 'library title missing')
  const input = renderer.root.find((node) => node.type === 'input' && node.props.type === 'search')
  assert.ok(String(input.props.placeholder).includes('搜索标题'), 'search placeholder missing')
  assert.equal(renderer.root.findAll((node) => node.type === 'g' && node.props['data-node-id']).length, 12, 'graph should render 12 nodes')
  assert.equal(findByClass('lg-node').length, 12)
  assert.equal(findByClass('lg-paper-row').length, 20, 'first library page should hold 20 rows')
  assert.ok(findPaths('/api/litgraph/graph').length >= 1, 'graph was not fetched')
})

await checkAsync('render: host status badge goes online', async () => {
  const text = allText(renderer.toJSON())
  assert.ok(text.includes('宿主在线'), 'expected the online badge, got: ' + text.slice(0, 120))
  assert.ok(findByClass('lg-star').length > 100, 'star field missing')
})

// ---- search highlight ----
const searchInput = renderer.root.find((node) => node.type === 'input' && node.props.type === 'search')
await act(async () => {
  searchInput.props.onChange({ target: { value: 'transformer' } })
})
await flush(260)

await checkAsync('search: matching nodes stay lit, others dim', async () => {
  const nodes = renderer.root.findAll((node) => node.type === 'g' && node.props['data-node-id'])
  const lit = nodes.filter((node) => node.props.opacity === 1)
  const dimmed = nodes.filter((node) => node.props.opacity === 0.16)
  assert.equal(lit.length, 2, 'two Transformer papers should match, got ' + lit.length)
  assert.equal(dimmed.length, 10, 'the other ten nodes should be dimmed, got ' + dimmed.length)
  const text = allText(renderer.toJSON()).replace(/\s+/g, ' ')
  assert.ok(text.includes('2 / 12'), 'match counter missing: ' + text.slice(0, 160))
  assert.ok(text.includes('命中'), 'match counter unit missing: ' + text.slice(0, 160))
})

// ---- submit (Enter while the field is not focused -> onSubmit) ----
await act(async () => {
  searchInput.props.onKeyDown({ key: 'Enter', preventDefault() {} })
})
await flush(60)

await checkAsync('search: Enter opens the top match in the detail panel', async () => {
  assert.ok(findPaths('/api/litgraph/paper').some((entry) => entry.method === 'GET'), 'detail was not fetched')
  const text = allText(renderer.toJSON())
  assert.ok(text.includes('文献详情'), 'detail eyebrow missing: ' + text.slice(0, 200))
  assert.ok(text.includes('AI 总结'), 'detail summary section missing')
  assert.ok(text.includes('打开原文'), 'detail actions missing')
})

// ---- clear search ----
await act(async () => {
  searchInput.props.onChange({ target: { value: '' } })
})
await flush(240)

await checkAsync('search: clearing restores every node', async () => {
  const nodes = renderer.root.findAll((node) => node.type === 'g' && node.props['data-node-id'])
  assert.ok(nodes.every((node) => node.props.opacity === 1), 'nodes should not be dimmed anymore')
  assert.equal(allText(renderer.toJSON()).includes('命中'), false)
})

// ---- pagination ----
const pageButtons = () => findByClass('lg-page-btn')
await act(async () => {
  pageButtons().find((button) => button.props['aria-label'] === '下一页').props.onClick()
})
await flush(40)

await checkAsync('library: next page requests page=2 and renders its rows', async () => {
  const pages = findPaths('/api/litgraph/papers').filter((entry) => entry.search.includes('page=2'))
  assert.ok(pages.length >= 1, 'page=2 was never requested')
  assert.equal(findByClass('lg-paper-row').length, 5, 'page 2 of 25 with pageSize 20 should hold 5 rows')
})

// ---- sort direction ----
await act(async () => {
  findByClass('lg-order-btn')[0].props.onClick()
})
await flush(40)

await checkAsync('library: order toggle requests order=asc', async () => {
  const asc = findPaths('/api/litgraph/papers').filter((entry) => entry.search.includes('order=asc'))
  assert.ok(asc.length >= 1, 'asc order was never requested')
})

// ---- drop upload -> job poll -> toast ----
const dropEvent = {
  preventDefault() {},
  stopPropagation() {},
  dataTransfer: {
    files: [new File([new Uint8Array(2048)], 'Nebula Graphs.pdf', { type: 'application/pdf' })],
    items: [],
    dropEffect: 'none',
  },
}
await act(async () => {
  workbenchRoot().props.onDragEnter(dropEvent)
})
await checkAsync('drop: drag enter shows the drop overlay', async () => {
  assert.equal(findByClass('lg-drop-overlay').length, 1, 'drop overlay missing')
})
await act(async () => {
  workbenchRoot().props.onDrop(dropEvent)
})
await flush(60)

await checkAsync('drop: POST /upload receives the file and filename header', async () => {
  assert.ok(uploadHit, 'upload route was never called')
  assert.equal(uploadHit.name, 'Nebula Graphs.pdf')
  assert.equal(uploadHit.headers['x-litgraph-filename'], encodeURIComponent('Nebula Graphs.pdf'))
  assert.ok(uploadHit.body instanceof File)
  assert.equal(findByClass('lg-drop-overlay').length, 0, 'drop overlay should be dismissed')
  assert.equal(findByClass('lg-job').length, 1, 'job card missing')
})

await flush(1600)

await checkAsync('jobs: polling reaches done and toasts success', async () => {
  const text = allText(renderer.toJSON())
  assert.ok(text.includes('处理完成'), 'success toast missing: ' + text.slice(0, 240))
  assert.ok(findPaths('/api/litgraph/job').length >= 2, 'job was not polled twice')
})

// ---- delete ----
const deleteButton = renderer.root.findAll((node) => node.type === 'button' && allText(node).includes('删除'))[0]
await checkAsync('detail: delete button is available', async () => {
  assert.ok(deleteButton, 'delete button missing from the detail panel')
})
await act(async () => {
  deleteButton.props.onClick()
})
await flush(60)

await checkAsync('detail: delete calls DELETE and toasts', async () => {
  assert.ok(findPaths('/api/litgraph/paper').some((entry) => entry.method === 'DELETE'), 'DELETE was never called')
  assert.ok(allText(renderer.toJSON()).includes('已删除'), 'delete toast missing')
})

// ---- teardown ----
await act(async () => {
  renderer.unmount()
})

check('teardown: unmount does not throw', () => {
  assert.equal(renderer.toJSON(), null)
})

// ---------------------------------------------------------------------------
console.log('')
if (failures.length > 0) {
  console.error('SMOKE FAILED: ' + failures.length + ' of ' + (pass + failures.length) + ' checks')
  for (const failure of failures) console.error(' - ' + failure.name)
  process.exit(1)
}
console.log('SMOKE OK — ' + pass + ' checks passed')
