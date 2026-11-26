/**
 * 洞察 (insight) view backend.
 *
 * One cluster's papers go into a single model call that returns a fixed JSON
 * shape: objects, methods, evolution, solved problems, limits, method×problem
 * gaps and open questions. Every card carries real paper ids so the client can
 * jump back to the star map; nothing is presented as external "state of the
 * art" — the UI calls this 数据库内论文研究趋势.
 *
 * The statistical half (method frequency, first year, recent share, trend) is
 * computed here from real paper years, never from the model. Results are cached
 * per (scope, cluster, sample ids, recent window, prompt version) under
 * <dataRoot>/insights/<key>.json.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GraphData } from './graph.js'
import type { LlmAnalyzer } from './llm.js'
import type { LibraryStore } from './store.js'
import type { StoredPaper } from './types.js'

export type InsightScope = 'cluster' | 'group' | 'all'

/** Bump when the prompt or the payload shape changes (invalidates the cache). */
export const INSIGHT_PROMPT_VERSION = 2

const MAX_SAMPLE = 60
const MAX_METHODS = 12
const MAX_CARDS = 8
const MAX_EVIDENCE = 6
const MAX_STRING = 400

export class InsightError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'InsightError'
  }
}

export type InsightTrend = 'new' | 'rising' | 'steady' | 'cooling'

export interface InsightMethod {
  name: string
  /** How many sampled papers use it (absolute count, not a share of the whole library). */
  count: number
  firstYear: number | null
  recentCount: number
  /** recentCount / count, 0..1. */
  recentShare: number
  isNew: boolean
  trend: InsightTrend
  avgRating: number | null
  note: string
  paperIds: string[]
}

export interface InsightGap {
  method: string
  problem: string
  why: string
  paperIds: string[]
}

export interface InsightQuestion {
  question: string
  why: string
  paperIds: string[]
}

export interface InsightPaperRef {
  id: string
  title: string
  year: number | null
  clusterLabel: string
}

export interface InsightPayload {
  ok: true
  scope: InsightScope
  scopeLabel: string
  clusterId: string | null
  clusterLabel: string
  recentYears: number
  recentFromYear: number
  readyCount: number
  sampleSize: number
  truncated: boolean
  generatedAt: string
  cached: boolean
  model: string
  ms: number
  /** One line the UI shows above the cards; never claims external truth. */
  disclaimer: string
  objects: string[]
  methods: InsightMethod[]
  evolution: string[]
  solved: string[]
  limits: string[]
  gaps: InsightGap[]
  questions: InsightQuestion[]
  papers: InsightPaperRef[]
}

export interface InsightRequest {
  scope: InsightScope
  clusterId: string | null
  recentYears: number
  refresh: boolean
}

interface RawCard {
  name: string
  note: string
  paperIds: string[]
}

interface RawPayload {
  objects: string[]
  methods: RawCard[]
  evolution: string[]
  solved: string[]
  limits: string[]
  gaps: Array<{ method: string; problem: string; why: string; paperIds: string[] }>
  questions: Array<{ question: string; why: string; paperIds: string[] }>
}

function str(value: unknown, limit = MAX_STRING): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/gu, ' ').trim().slice(0, limit)
}

function strList(value: unknown, limit = 6, itemLimit = MAX_STRING): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    const text = str(entry, itemLimit)
    if (text === '' || out.includes(text)) continue
    out.push(text)
    if (out.length >= limit) break
  }
  return out
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function validIds(value: unknown, known: Set<string>): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const id = entry.trim()
    if (!known.has(id) || out.includes(id)) continue
    out.push(id)
    if (out.length >= MAX_EVIDENCE) break
  }
  return out
}

function parseRaw(value: unknown, known: Set<string>): RawPayload {
  const root = asRecord(value) ?? {}
  const methods: RawCard[] = []
  if (Array.isArray(root.methods)) {
    for (const entry of root.methods) {
      const record = asRecord(entry)
      if (record === null) continue
      const name = str(record.name, 60)
      if (name === '') continue
      methods.push({ name, note: str(record.note, 240), paperIds: validIds(record.paperIds, known) })
      if (methods.length >= MAX_METHODS) break
    }
  }
  const gaps: RawPayload['gaps'] = []
  if (Array.isArray(root.gaps)) {
    for (const entry of root.gaps) {
      const record = asRecord(entry)
      if (record === null) continue
      const method = str(record.method, 60)
      const problem = str(record.problem, 160)
      if (method === '' || problem === '') continue
      gaps.push({ method, problem, why: str(record.why, 260), paperIds: validIds(record.paperIds, known) })
      if (gaps.length >= MAX_CARDS) break
    }
  }
  const questions: RawPayload['questions'] = []
  if (Array.isArray(root.questions)) {
    for (const entry of root.questions) {
      const record = asRecord(entry)
      if (record === null) continue
      const question = str(record.question, 200)
      if (question === '') continue
      questions.push({ question, why: str(record.why, 260), paperIds: validIds(record.paperIds, known) })
      if (questions.length >= MAX_CARDS) break
    }
  }
  return {
    objects: strList(root.objects, 8, 60),
    methods,
    evolution: strList(root.evolution, 6),
    solved: strList(root.solved, 6),
    limits: strList(root.limits, 6),
    gaps,
    questions,
  }
}

/** Keep the sample representative when the cluster is larger than the token budget. */
function pickSample(papers: StoredPaper[], max: number): StoredPaper[] {
  if (papers.length <= max) return [...papers]
  const sorted = [...papers].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.id.localeCompare(b.id))
  const step = sorted.length / max
  const out: StoredPaper[] = []
  for (let index = 0; index < max; index += 1) out.push(sorted[Math.floor(index * step)])
  return out
}

function buildPrompts(input: {
  scopeLabel: string
  sample: StoredPaper[]
  readyCount: number
  truncated: boolean
  recentYears: number
  recentFromYear: number
}): { system: string; user: string } {
  const system = [
    '你是文献计量与研究趋势分析助手，只依据用户给出的论文列表分析。',
    '术语约定：这是「数据库内论文研究趋势」（本库样本的统计与推测），不是学界研究前沿；不要引入列表之外的知识，不要编造论文 id。',
    '只输出一个 JSON 对象，不要 markdown 代码块，不要解释。JSON 结构：',
    '{"objects":["共同研究对象，最多 8 条"],',
    '"methods":[{"name":"短方法名，不超过12字（如 小波变换、强化学习、有限元仿真）","note":"一句话说明该方法在库里怎么用","paperIds":["p_..."]}],',
    '"evolution":["方法随年份的变化，3-5 条"],',
    '"solved":["本库论文已经解决的问题，2-4 条"],',
    '"limits":["本库论文明确指出的局限，2-4 条"],',
    '"gaps":[{"method":"方法","problem":"尚未结合的问题","why":"为什么是空白","paperIds":["p_..."]}],',
    '"questions":[{"question":"可执行的研究问题","why":"基于哪些论文的哪处空白","paperIds":["p_..."]}]}',
    '规则：',
    '1. methods 指论文实际使用的研究方法/技术（如 有限元仿真、小波变换、强化学习、注意力机制），不是研究对象；name 必须是 12 字以内的短名，细节放进 note；按论文出现次数降序，最多 10 条。',
    '2. 每个 paperIds 只能使用列表里出现的 id，每条至少 1 个（gaps/questions 用最相关的 1-3 个）。',
    '3. 统计结论只说本库样本内的事实；空白组合与问题属于推测，why 里说明依据。',
    '4. 样本少于 5 篇时只做方向性猜测，并在 note/why 里写明「样本较少」。',
  ].join('\n')

  const lines: string[] = []
  lines.push('研究范围：' + input.scopeLabel)
  lines.push(
    '样本：' + input.sample.length + ' 篇' + (input.truncated ? '（本范围内共 ' + input.readyCount + ' 篇，已分层抽样）' : ''),
  )
  lines.push('近期窗口：' + input.recentFromYear + '–' + new Date().getFullYear() + ' 年（' + input.recentYears + ' 年）')
  lines.push('论文列表（每行：id | 年份 | 标题 | 作者 | 方法 | 关键词 | 摘要节选）：')
  for (const paper of input.sample) {
    lines.push(
      [
        paper.id,
        paper.year ?? '未知',
        str(paper.title, 140),
        paper.authors.slice(0, 3).join(', '),
        str(paper.method, 120),
        paper.keywords.slice(0, 5).join(', '),
        str(paper.abstract, 220),
      ].join(' | '),
    )
  }
  lines.push('请输出 JSON。')
  return { system, user: lines.join('\n') }
}

function computeMethods(
  cards: RawCard[],
  sample: StoredPaper[],
  recentFromYear: number,
): InsightMethod[] {
  const byId = new Map(sample.map((paper) => [paper.id, paper]))
  const out: InsightMethod[] = []
  const seen = new Set<string>()
  for (const card of cards) {
    const ids = card.paperIds.filter((id) => byId.has(id))
    if (ids.length === 0) continue
    const key = card.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const papers = ids.map((id) => byId.get(id)!)
    const years = papers.map((paper) => paper.year).filter((year): year is number => typeof year === 'number')
    const firstYear = years.length > 0 ? Math.min(...years) : null
    const recent = papers.filter((paper) => typeof paper.year === 'number' && paper.year >= recentFromYear).length
    const ratings = papers.map((paper) => paper.rating ?? 0).filter((rating) => rating > 0)
    const avgRating =
      ratings.length > 0 ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10 : null
    const count = papers.length
    const recentShare = count > 0 ? recent / count : 0
    const isNew = firstYear !== null && firstYear >= recentFromYear
    let trend: InsightTrend = 'steady'
    if (isNew) trend = 'new'
    else if (count >= 2 && recentShare >= 0.6) trend = 'rising'
    else if (count >= 2 && recentShare <= 0.15 && firstYear !== null && firstYear < recentFromYear - 2) trend = 'cooling'
    out.push({
      name: card.name,
      count,
      firstYear,
      recentCount: recent,
      recentShare: Math.round(recentShare * 100) / 100,
      isNew,
      trend,
      avgRating,
      note: card.note,
      paperIds: ids,
    })
  }
  return out.sort((a, b) => b.count - a.count || (a.name > b.name ? 1 : -1)).slice(0, MAX_METHODS)
}

function fallbackMethods(sample: StoredPaper[], recentFromYear: number): InsightMethod[] {
  const buckets = new Map<string, StoredPaper[]>()
  for (const paper of sample) {
    const name = str(paper.method, 40)
    if (name === '') continue
    const list = buckets.get(name) ?? []
    list.push(paper)
    buckets.set(name, list)
  }
  const cards: RawCard[] = [...buckets.entries()].map(([name, papers]) => ({
    name,
    note: '来自文献详情里的方法字段',
    paperIds: papers.map((paper) => paper.id),
  }))
  return computeMethods(cards, sample, recentFromYear)
}

function cacheKey(request: InsightRequest, label: string, sample: StoredPaper[]): string {
  const payload = JSON.stringify({
    version: INSIGHT_PROMPT_VERSION,
    scope: request.scope,
    clusterId: request.clusterId,
    label,
    recentYears: request.recentYears,
    ids: sample.map((paper) => paper.id).sort(),
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 32)
}

async function readCache(path: string): Promise<InsightPayload | null> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as InsightPayload
    if (raw !== null && typeof raw === 'object' && raw.ok === true && Array.isArray(raw.methods)) return raw
  } catch {
    /* missing or corrupt cache: regenerate */
  }
  return null
}

/**
 * Build (or read the cache of) one insight payload.
 *
 * scope 'cluster' = the cluster the selected node belongs to; 'group' = every
 * cluster under the same top-level field (galaxy); 'all' = every ready paper.
 */
export async function buildInsight(
  deps: { store: LibraryStore; graph: GraphData; analyzer: LlmAnalyzer },
  request: InsightRequest,
): Promise<InsightPayload> {
  const { store, graph, analyzer } = deps
  const clusters = graph.clusters
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const cluster = request.clusterId !== null ? clusters.find((entry) => entry.id === request.clusterId) ?? null : null

  let allowedIds: Set<string> | null = null
  let scopeLabel = '全部文献'
  let clusterLabel = '全部文献'
  if (request.scope === 'cluster') {
    if (cluster === null) throw new InsightError('NO_CLUSTER', 'selected paper has no cluster; pick a paper on the star map first')
    allowedIds = new Set(graph.nodes.filter((node) => node.clusterId === cluster.id).map((node) => node.id))
    clusterLabel = cluster.label
    scopeLabel = '聚类「' + cluster.label + '」'
  } else if (request.scope === 'group') {
    if (cluster !== null && cluster.group !== undefined && cluster.group !== '未分类') {
      allowedIds = new Set(
        graph.nodes
          .filter((node) => nodeById.get(node.id) !== undefined && (clusters.find((entry) => entry.id === node.clusterId)?.group ?? '') === cluster.group)
          .map((node) => node.id),
      )
      clusterLabel = cluster.group
      scopeLabel = '学科「' + cluster.group + '」'
    } else if (cluster !== null) {
      allowedIds = new Set(graph.nodes.filter((node) => node.clusterId === cluster.id).map((node) => node.id))
      clusterLabel = cluster.label
      scopeLabel = '聚类「' + cluster.label + '」'
    }
  }

  const ready = (await store.listPapers()).filter((paper) => paper.status === 'ready')
  const inScope = ready.filter((paper) => allowedIds === null || allowedIds.has(paper.id))
  if (inScope.length === 0) throw new InsightError('NO_PAPERS', 'no ready papers in this scope')

  const recentYears = Math.min(30, Math.max(1, Math.round(request.recentYears)))
  const currentYear = new Date().getFullYear()
  const recentFromYear = currentYear - recentYears + 1
  const sample = pickSample(inScope, MAX_SAMPLE)
  const key = cacheKey(request, clusterLabel, sample)
  const path = join(store.root, 'insights', key + '.json')
  if (!request.refresh) {
    const cached = await readCache(path)
    if (cached !== null) return { ...cached, cached: true }
  }

  const prompts = buildPrompts({
    scopeLabel,
    sample,
    readyCount: inScope.length,
    truncated: inScope.length > sample.length,
    recentYears,
    recentFromYear,
  })
  const known = new Set(sample.map((paper) => paper.id))
  const startedAt = Date.now()
  const completion = await analyzer.completeJson(prompts.system, prompts.user, 3600)
  const raw = parseRaw(completion.value, known)
  let methods = computeMethods(raw.methods, sample, recentFromYear)
  if (methods.length === 0) methods = fallbackMethods(sample, recentFromYear)

  const payload: InsightPayload = {
    ok: true,
    scope: request.scope,
    scopeLabel,
    clusterId: cluster !== null ? cluster.id : null,
    clusterLabel,
    recentYears,
    recentFromYear,
    readyCount: inScope.length,
    sampleSize: sample.length,
    truncated: inScope.length > sample.length,
    generatedAt: new Date().toISOString(),
    cached: false,
    model: completion.model,
    ms: Date.now() - startedAt,
    disclaimer:
      '基于本库 ' +
      sample.length +
      ' 篇论文的统计与推测，不是学界研究前沿。每条结论都附了证据论文，点击可回到星图。',
    objects: raw.objects,
    methods,
    evolution: raw.evolution,
    solved: raw.solved,
    limits: raw.limits,
    gaps: raw.gaps,
    questions: raw.questions,
    papers: sample.map((paper) => {
      const node = nodeById.get(paper.id)
      return {
        id: paper.id,
        title: paper.title,
        year: paper.year,
        clusterLabel: node?.clusterLabel ?? '',
      }
    }),
  }

  try {
    await mkdir(join(store.root, 'insights'), { recursive: true })
    await writeFile(path, JSON.stringify(payload, null, 2), 'utf8')
  } catch (error) {
    console.warn('[litgraph] could not cache insight payload: ' + (error instanceof Error ? error.message : String(error)))
  }
  return payload
}
