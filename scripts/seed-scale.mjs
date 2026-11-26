#!/usr/bin/env node
/**
 * Generate a synthetic LitGraph library for scale/perf testing (no LLM, no PDFs).
 *
 * Usage:
 *   node scripts/seed-scale.mjs --root ./tmp/scale-home/litgraph --count 1000 --clusters 12
 *
 * The generated library.json matches the on-disk format of LibraryStore: full
 * StoredPaper records (status ready, hasFile false) so the host's graph projection,
 * the client library pagination and the star map layout can be stress tested.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

function arg(name, fallback) {
  const index = process.argv.indexOf('--' + name)
  if (index >= 0 && process.argv[index + 1] !== undefined) return process.argv[index + 1]
  return fallback
}

const root = arg('root', '')
const count = Math.max(1, Number(arg('count', '1000')))
const clusterCount = Math.max(1, Number(arg('clusters', '12')))
const seedArg = Number(arg('seed', '7')) >>> 0
if (root === '') {
  console.error('missing --root <dataRoot>')
  process.exit(2)
}

function mulberry32(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = mulberry32(seedArg)
function pick(list) {
  return list[Math.floor(random() * list.length) % list.length]
}

const DOMAINS = [
  ['人工智能', '自然语言处理', '机器翻译'],
  ['人工智能', '自然语言处理', '预训练语言模型'],
  ['人工智能', '计算机视觉', '图像识别'],
  ['人工智能', '计算机视觉', '目标检测与分割'],
  ['深度学习', '神经网络架构', 'Transformer'],
  ['深度学习', '神经网络架构', '注意力机制'],
  ['控制工程', '振动与噪声控制', '隔振系统设计'],
  ['控制工程', '智能控制', '多智能体系统'],
  ['机械工程', '计算机辅助制造', '数控刀路生成与仿真'],
  ['机械工程', '智能制造', '自动编程与工艺决策'],
  ['材料科学', '表面工程', '涂层与表面改性'],
  ['材料科学', '复合材料', '界面力学'],
  ['医学', '医学影像', '病灶检测'],
  ['医学', '生物信息学', '基因序列分析'],
]

const TOPICS = ['attention', 'transformer', 'diffusion', 'graph network', 'reinforcement learning', 'residual learning', 'few-shot', 'self-supervised', 'federated', 'knowledge distillation', 'prompt tuning', 'contrastive', 'sparse', 'quantization', 'multi-modal', 'routing']
const METHODS = ['benchmark', 'survey', 'framework', 'dataset', 'analysis', 'pipeline', 'optimization', 'simulation']
const AUTHORS = ['Wei Zhang', 'Li Chen', 'Ming Zhao', 'Y. Wang', 'J. Smith', 'A. Kumar', 'H. Tanaka', 'S. Müller', 'F. Rossi', 'K. Novak']
const VENUES = ['NeurIPS', 'ICML', 'CVPR', 'ACL', 'IEEE TASE', 'Mechanical Systems and Signal Processing', 'Surface & Coatings Technology', 'Nature Communications', 'arXiv preprint', 'Journal of Sound and Vibration']

const categoryPool = []
for (let index = 0; index < clusterCount; index += 1) {
  const base = DOMAINS[index % DOMAINS.length]
  // vary the third level so different clusters do not collapse into one top label
  categoryPool.push(base.join(' > '))
}
const keywordsByCluster = categoryPool.map((_, cluster) => {
  const pool = [TOPICS[cluster % TOPICS.length], TOPICS[(cluster + 3) % TOPICS.length], METHODS[cluster % METHODS.length]]
  return pool.map((value) => value + ' ' + cluster)
})

const papers = []
const now = new Date()
for (let index = 0; index < count; index += 1) {
  const cluster = index % clusterCount
  const category = categoryPool[cluster]
  const year = 1995 + Math.floor(random() * 31)
  const keywords = []
  const keywordBase = keywordsByCluster[cluster]
  keywords.push(keywordBase[0], keywordBase[1])
  if (random() < 0.6) keywords.push(keywordBase[2])
  if (random() < 0.35) keywords.push(pick(TOPICS), pick(METHODS))
  const id = 'p_' + (index + 1).toString(16).padStart(16, '0')
  const title = pick(['Deep', 'Efficient', 'Robust', 'Adaptive', 'Lightweight', 'Hierarchical']) + ' ' + pick(TOPICS) + ' for ' + pick(['medical imaging', 'machine translation', 'vibration control', 'surface coating', 'fault diagnosis', 'time series']) + ' (' + year + ')'
  papers.push({
    id,
    title,
    authors: [pick(AUTHORS), pick(AUTHORS), pick(AUTHORS)],
    year,
    venue: pick(VENUES),
    abstract: 'Synthetic abstract for scale testing. ' + title + ' studies ' + keywords.join(', ') + '.',
    keywords,
    categories: [category],
    summary: '规模测试用合成记录。',
    contributions: [],
    method: '',
    fileName: 'scale-' + index + '.pdf',
    size: 100000 + Math.floor(random() * 900000),
    status: 'ready',
    addedAt: new Date(now.getTime() - index * 60000).toISOString(),
    updatedAt: new Date(now.getTime() - index * 60000).toISOString(),
    hasFile: false,
    relations: [],
    sha256: 'scale-' + index,
    pages: 8 + Math.floor(random() * 12),
    textChars: 20000 + Math.floor(random() * 20000),
    llmModel: 'deepseek-flash',
    llmMs: 2000,
    tags: [],
    starred: random() < 0.05,
  })
}

// a few cross-cluster LLM relations so the graph has long edges to render
for (let index = 0; index < Math.min(240, count); index += 1) {
  const paper = papers[index]
  const other = papers[(index * 37 + 11) % count]
  if (paper.id === other.id) continue
  paper.relations.push({ paperId: other.id, title: other.title, relation: 'related' })
}

const taxonomyEntries = new Map()
for (const paper of papers) {
  const path = paper.categories[0]
  const entry = taxonomyEntries.get(path)
  if (entry === undefined) taxonomyEntries.set(path, { path, count: 1, status: 'active', firstSeen: paper.addedAt, lastSeen: paper.updatedAt })
  else {
    entry.count += 1
    if (paper.updatedAt > entry.lastSeen) entry.lastSeen = paper.updatedAt
  }
}
const library = {
  version: 1,
  updatedAt: now.toISOString(),
  taxonomy: { version: 1, updatedAt: now.toISOString(), categories: [...taxonomyEntries.values()] },
  papers,
  settings: { taxonomyMode: 'free' },
}

await mkdir(join(root, 'papers'), { recursive: true })
await mkdir(join(root, 'sources'), { recursive: true })
await mkdir(join(root, 'tmp'), { recursive: true })
await writeFile(join(root, 'library.json'), JSON.stringify(library), 'utf8')
const bytes = Buffer.byteLength(JSON.stringify(library))
console.log('seeded ' + papers.length + ' papers, ' + taxonomyEntries.size + ' categories, ' + bytes + ' bytes -> ' + join(root, 'library.json'))
console.log('unique edges (category chain + keyword jaccard top2) will be computed by the host graph route')
