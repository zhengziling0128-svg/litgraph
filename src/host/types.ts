/**
 * dsh-litgraph · shared host types.
 *
 * The client bundle and the host bundle are built separately, so every wire shape
 * lives here and is imported (type-only) from both halves where useful.
 */

export interface HostContext {
  inject?: (names: string[], callback: (scoped: any) => void) => unknown
}

export interface HostFetchRoute {
  path: string
  methods: string[]
  requestBody: 'buffered' | 'streaming'
  fetch: (request: Request) => Response | Promise<Response>
}

/** 'needs_ocr' is a deliberate extension of the spike contract: a scanned PDF is
 *  accepted (bytes are kept) but never silently marked ready with empty metadata. */
export type PaperStatus = 'processing' | 'ready' | 'failed' | 'needs_ocr'

export interface PaperRelation {
  paperId: string
  title: string
  relation: string
}

/** Journal metrics from easyScholar (see src/host/metrics.ts). */
export interface JournalMetrics {
  /** Venue name as the metrics were queried for. */
  venue: string
  impactFactor: number | null
  impactFactor5: number | null
  jcrQuartile: string | null
  jci: number | null
  /** 中科院大类分区, e.g. "工程技术2区". */
  casPartition: string | null
  /** 中科院小类分区 (trailing 句号 stripped). */
  casSmall: string | null
  casTop: boolean
  /** 中科院基础版大类分区. */
  casBase: string | null
  /** ESI 学科. */
  esi: string | null
  source: 'easyscholar'
  fetchedAt: string
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
  relations?: PaperRelation[]
  /** User notes, edited from the detail panel (max ~20k chars). */
  notes?: string
  /** User tags; merged with LLM keywords in the UI but kept separate here. */
  tags?: string[]
  /** Starred / favourite flag. */
  starred?: boolean
  /** 0..5 integer user rating; 0 (or absent) means unrated. */
  rating?: number
  /** Journal metrics fetched from easyScholar; absent until looked up. */
  metrics?: JournalMetrics
  /** Zotero provenance and sync state (refreshed by POST /zotero/sync). */
  zotero?: {
    key: string
    attachmentKey: string | null
    /** Collection keys this item belongs to, mirrored from Zotero. */
    collections?: string[]
    /** Zotero attachment last-read time (unix seconds). */
    lastRead?: number | null
    /** Zotero item dateModified (ISO). */
    dateModified?: string
  }
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

/** Kept for source-compatibility with the demo stub's exports. */
export type DemoCluster = Cluster

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

export interface ImportJob {
  id: string
  state: 'queued' | 'parsing' | 'extracting' | 'graphing' | 'done' | 'failed'
  progress: number
  message: string
  paperId: string | null
  createdAt: string
  updatedAt: string
}

export interface LitgraphConfig {
  /** Root of the on-disk library. Default: <DSH_HOME>/litgraph */
  dataRoot: string
  /** Keep the original PDF under sources/<sha256>.pdf (default true). */
  keepSourcePdf: boolean
  /** Keep extracted full text under papers/<id>/fulltext.txt (default true). */
  saveText: boolean
  /** Hard upload limit for one PDF. */
  maxUploadBytes: number
  /** Characters of the extraction sent to the LLM. */
  maxTextChars: number
  llmProvider: string
  /** True when the provider came from env/profile instead of the built-in default. */
  llmProviderExplicit: boolean
  /** null -> pick from ctx.llm.listModels() at request time. */
  llmModel: string | null
  llmMaxTokens: number
  maxParseRetries: number
  /** How many papers may be processed concurrently. */
  concurrency: number
  /**
   * OCR engine for pages without a text layer: 'windows' (free local
   * Windows.Media.Ocr), 'model' (the image-capable model transcribes the page),
   * or 'auto' (local first, model only when the local engine produced nothing).
   */
  ocrEngine: 'auto' | 'windows' | 'model'
  /** easyScholar secret key used for journal metric lookups. */
  metricsSecretKey: string
  /** Background easyScholar lookups; LITGRAPH_METRICS_DISABLE=1 turns them off. */
  metricsEnabled: boolean
}

export interface TaxonomyEntry {
  path: string
  count: number
  status: 'active' | 'proposed'
  firstSeen: string
  lastSeen: string
}

export interface Taxonomy {
  version: number
  updatedAt: string
  categories: TaxonomyEntry[]
}

/** A persisted paper: the wire shape plus storage bookkeeping. */
export interface StoredPaper extends Paper {
  sha256: string
  pages: number
  textChars: number
  llmModel: string
  llmMs: number
}

export interface RelationHint {
  title: string
  relation: string
}

export interface ParsedPayload {
  title: string
  authors: string[]
  year: number | null
  venue: string
  abstract: string
  summary: string
  contributions: string[]
  method: string
  keywords: string[]
  categories: string[]
  relations: RelationHint[]
}

export interface LlmStreamChunk {
  type: string
  text?: string
  block?: unknown
  reason?: unknown
  failure?: { message?: string; code?: string }
}

export interface PreparedLlmCall {
  config: Record<string, any>
  stream: (options: Record<string, any>) => AsyncIterable<LlmStreamChunk>
}

export interface LlmService {
  listModels?: (provider: string) => Promise<unknown> | unknown
  /** Registered provider routes, in registration order. */
  listProviders?: () => Promise<unknown> | unknown
  prepareCall?: (
    config: Record<string, any>,
    signal?: AbortSignal,
    configure?: (controls: any, modelInfo?: any) => any,
  ) => Promise<PreparedLlmCall> | PreparedLlmCall
  stream?: (options: Record<string, any>) => AsyncIterable<LlmStreamChunk>
}

export interface AnalyzeResult {
  payload: ParsedPayload
  raw: string
  model: string
  ms: number
  attempts: number
  usedRetry: boolean
}
