/**
 * dsh-litgraph · client-side API types.
 *
 * Mirrors the wire contract documented at the top of src/host/index.ts:
 *   GET    /api/litgraph/status
 *   GET    /api/litgraph/graph
 *   GET    /api/litgraph/papers?sort=&order=&page=&pageSize=&q=&cluster=&tag=&starred=
 *   GET    /api/litgraph/paper?id=
 *   PATCH  /api/litgraph/paper          {id, notes?, tags?, starred?}
 *   DELETE /api/litgraph/paper?id=
 *   GET    /api/litgraph/settings
 *   PUT    /api/litgraph/settings       {taxonomyMode}
 *   POST   /api/litgraph/upload        (streaming body; x-litgraph-filename header)
 *   GET    /api/litgraph/job?id=
 *   GET    /api/litgraph/file?id=      (original PDF bytes; linked, not fetched by the panel)
 */

export type PaperStatus = 'processing' | 'ready' | 'failed'

/**
 * Journal bibliometrics snapshot for one paper, resolved by the host from
 * EasyScholar and cached under the paper record. Every field can be missing on
 * the wire (the upstream lookup may know an IF but not a CAS partition), so the
 * UI must render whatever subset is present.
 */
export interface JournalMetrics {
  /** Journal title as returned by the lookup (may differ from paper.venue). */
  venue: string
  /** Journal Impact Factor (latest JCR year), null = not indexed. */
  impactFactor: number | null
  /** 5-year Journal Impact Factor. */
  impactFactor5: number | null
  /** JCR quartile, e.g. "Q1". */
  jcrQuartile: string | null
  /** Journal Citation Indicator. */
  jci: number | null
  /** 中科院分区（大类）, e.g. "工程技术1区". */
  casPartition: string | null
  /** 中科院分区（小类）, e.g. "自动化与控制系统2区". */
  casSmall: string | null
  /** 中科院 TOP 期刊标志. */
  casTop: boolean
  /** 中科院分区基础版（若上游仍有数据）. */
  casBase: string | null
  /** ESI 学科. */
  esi: string | null
  source: 'easyscholar'
  /** ISO timestamp of the successful lookup. */
  fetchedAt: string
}

/** Zotero identity plus mirrored library state; the host resolves the attachment. */
export interface PaperZoteroRef {
  key: string
  attachmentKey: string | null
  /** Collection keys the item belongs to (names come from /zotero/state). */
  collections?: string[]
  /** Zotero attachment last-read time (unix seconds). */
  lastRead?: number | null
  /** Zotero item dateModified (ISO). */
  dateModified?: string
}

export interface ZoteroCollection {
  key: string
  name: string
  parentKey: string | null
}

export interface ZoteroState {
  ok: boolean
  available: boolean
  version: string
  userId: number
  collections: ZoteroCollection[]
  authorized: boolean
  error: string
}

export interface ZoteroSyncResult {
  ok: boolean
  matched: number
  total: number
  items?: number
  updated?: number
  error?: string
}

export interface Paper {
  id: string
  title: string
  authors: string[]
  year: number | null
  venue: string
  abstract: string
  keywords: string[]
  categories: string[]
  summary: string
  contributions: string[]
  method: string
  fileName: string
  size: number
  status: PaperStatus
  addedAt: string
  updatedAt: string
  hasFile: boolean
  parseNote?: string
  /** User notes edited in the detail panel (host caps at 20000 chars). */
  notes?: string
  /** User tags, kept separate from LLM keywords (host: trimmed, deduped, max 24). */
  tags?: string[]
  /** Starred / favourite flag (kept for older host builds; rating >= 1 implies starred). */
  starred?: boolean
  /** Star rating 0..5; 0 / undefined = not rated. */
  rating?: number
  /** Cached journal metrics; null / undefined = never queried. */
  metrics?: JournalMetrics | null
  /** Zotero identity, when the paper was imported from a Zotero library. */
  zotero?: PaperZoteroRef
}

/** /api/litgraph/paper adds graph-derived fields to Paper. */
export interface PaperDetail extends Paper {
  clusterId: string
  clusterLabel: string
  degree: number
}

export interface Cluster {
  id: string
  label: string
  color: string
  /** Top-level research field shared by sibling clusters (galaxy layer). */
  group?: string
  /** Full cluster path, e.g. "机械工程 > 故障诊断". */
  path?: string
}

export interface GraphNode {
  id: string
  title: string
  clusterId: string
  clusterLabel: string
  categories: string[]
  year: number | null
  status: PaperStatus
  degree: number
}

export interface GraphEdge {
  source: string
  target: string
  kind: 'category' | 'similar'
  weight: number
}

export interface GraphPayload {
  nodes: GraphNode[]
  edges: GraphEdge[]
  clusters: Cluster[]
}

/** A row of GET /api/litgraph/papers (a trim of Paper). */
export interface PaperListItem {
  id: string
  title: string
  authors: string[]
  year: number | null
  venue: string
  categories: string[]
  status: PaperStatus
  updatedAt: string
  addedAt: string
  fileName: string
  size: number
  clusterId: string
  tags: string[]
  starred: boolean
  /** Same as Paper.rating (list rows carry it for local sorting). */
  rating?: number
  /** Trim of JournalMetrics (IF / JCR / CAS) for the inline row badge. */
  metrics?: Partial<JournalMetrics> | null
  /** Unix seconds of the last Zotero read (null/absent = never read). */
  lastRead?: number | null
}

export interface PapersPage {
  items: PaperListItem[]
  total: number
  page: number
  pageSize: number
  sort: SortKey
  order: SortOrder
}

export type SortKey = 'updatedAt' | 'title' | 'year' | 'addedAt' | 'rating'
export type SortOrder = 'asc' | 'desc'

export interface PapersQuery {
  sort: SortKey
  order: SortOrder
  page: number
  pageSize: number
  q: string
  cluster: string
  /** Exact, case-insensitive tag filter (host: ?tag=). */
  tag?: string
  /** Only starred papers (host: ?starred=1). */
  starred?: boolean
  /** Minimum rating 1..5 (host: ?minRating=). */
  minRating?: number
}

/** One paper PATCH (host soft-limits notes/tags; see src/host/index.ts). */
export interface PaperPatch {
  notes?: string
  tags?: string[]
  starred?: boolean
  /** Star rating 0..5 (0 clears it). */
  rating?: number
}

export interface UpdatePaperResult {
  ok: boolean
  paper: PaperDetail
}

/** POST /api/litgraph/open — resolves the original attachment of a paper. */
export interface OpenResult {
  ok: boolean
  /** Which route opened it: a Zotero linked attachment or the stored PDF. */
  via?: 'zotero' | 'retainpdf' | 'file'
  /** Human-readable detail (attachment path, Zotero key, ...). */
  detail?: string
  error?: string
}

/** POST /api/litgraph/metrics/refresh — queues EasyScholar lookups. */
export interface MetricsRefreshResult {
  ok: boolean
  queued: number
  skipped: number
}

/** Category vocabulary mode: free growth (v1) or the built-in Chinese tree. */
export type TaxonomyMode = 'free' | 'fixed'

export type OcrEngine = 'auto' | 'windows' | 'model'

export interface LibrarySettings {
  taxonomyMode: TaxonomyMode
  /** Scanned-page reader; undefined = the host default. */
  ocrEngine?: OcrEngine
  /** Cluster hierarchy depth; undefined = host default (1). */
  clusterLevel?: 1 | 2 | 3
  /** Journal-metrics lookup switch; undefined = host default. */
  metricsEnabled?: boolean
  /** 洞察默认作用域; undefined = 'cluster'. */
  insightScope?: InsightScope
  /** "近期"窗口（年），默认 3。 */
  insightRecentYears?: number
  /** 灵感卡是否给出「存进笔记」按钮，默认 true。 */
  insightSaveNotes?: boolean
  /** 打开洞察时是否后台补齐其它聚类缓存，默认 false。 */
  insightPrecompute?: boolean
}

export interface SettingsPayload {
  ok: boolean
  settings: LibrarySettings
}

/** 洞察作用域：当前聚类 / 同一学科（星系）/ 全部文献。 */
export type InsightScope = 'cluster' | 'group' | 'all'

export type InsightTrend = 'new' | 'rising' | 'steady' | 'cooling'

export interface InsightMethod {
  name: string
  count: number
  firstYear: number | null
  recentCount: number
  /** 0..1 */
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

/** GET /api/litgraph/insight — 数据库内论文研究趋势. */
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

export type ImportJobState = 'queued' | 'parsing' | 'extracting' | 'graphing' | 'done' | 'failed'

export interface ImportJob {
  id: string
  state: ImportJobState
  progress: number
  message: string
  paperId: string | null
  createdAt: string
  updatedAt: string
}

export interface UploadAccepted {
  ok: boolean
  jobId: string
  paperId: string
}

export interface StatusPayload {
  ok: boolean
  mode: string
  paperCount: number
  clusterCount: number
  storage: string
}

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'updatedAt', label: '修改时间' },
  { value: 'title', label: '标题' },
  { value: 'year', label: '年份' },
  { value: 'addedAt', label: '加入时间' },
  // Host builds that predate ratings ignore the sort key and fall back to
  // updatedAt; LibraryPanel then re-sorts the visible page locally.
  { value: 'rating', label: '评分（高→低）' },
]

export const STATUS_LABEL: Record<PaperStatus, string> = {
  processing: '解析中',
  ready: '已入库',
  failed: '失败',
}

export const JOB_STATE_LABEL: Record<ImportJobState, string> = {
  queued: '排队中',
  parsing: '解析 PDF',
  extracting: 'AI 理解',
  graphing: '更新图谱',
  done: '完成',
  failed: '失败',
}

export const PAGE_SIZE = 20

export const TAXONOMY_MODE_OPTIONS: Array<{ value: TaxonomyMode; label: string; hint: string }> = [
  { value: 'free', label: '自由生长', hint: 'AI 按论文主题自行提出新类目，类目会随文献增长' },
  { value: 'fixed', label: '固定学科目录', hint: '只从内置中文三级学科目录中选择，类目稳定、便于跨库对比' },
]

export const OCR_ENGINE_OPTIONS: Array<{ value: OcrEngine; label: string; hint: string }> = [
  { value: 'auto', label: '自动（推荐）', hint: '扫描件先交给模型视觉逐页转录，模型不可用时退回 Windows 本地 OCR' },
  { value: 'model', label: '模型视觉', hint: '每页一次模型调用，英文、公式、双栏排版更准，耗时和 token 更多' },
  { value: 'windows', label: '本地 OCR', hint: '免费且快，但本机只有中文识别器，英文扫描件准确率较低' },
]
