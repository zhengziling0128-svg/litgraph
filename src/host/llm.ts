/**
 * LLM understanding: one structured-metadata call per paper.
 *
 * Contract notes (verified against @deepseek-ai/dsh-llm 0.2.2-rc.1 and by a real
 * DeepSeek call from the spike):
 *  - ctx.llm.prepareCall(config, signal, configure) -> { config, stream(options) }
 *  - stream() yields chunks: block-start / text-delta / usage / finish; every stream
 *    terminates with exactly one finish chunk.
 *  - GenerateOptions has no response_format / tool_choice, so JSON is prompt-enforced
 *    and validated locally; a parse failure retries once with a bigger budget.
 *  - 'off' reasoning effort is applied through the configure callback. With thinking
 *    disabled the real spike measured ~1.5K input / ~450 output tokens per paper and
 *    ~2.5-3 s, versus 6.5 s and 3x the output tokens with thinking on.
 */
import type {
  AnalyzeResult,
  LitgraphConfig,
  LlmService,
  LlmStreamChunk,
  ParsedPayload,
  RelationHint,
} from './types.js'
import { parseJsonLoose, safeFileStem, uniqueStrings } from './util.js'
import { buildFixedTaxonomyPrompt, matchFixedCategory, type TaxonomyMode } from './taxonomy-fixed.js'
import { isCredentialFailure, LlmTargetResolver, type LlmTarget } from './llm-target.js'

export class LlmAnalyzeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'LlmAnalyzeError'
  }
}

export interface AnalyzeInput {
  fileName: string
  text: string
  truncated: boolean
  existingCategories: string[]
  existingPapers: Array<{ id: string; title: string }>
  /**
   * Category vocabulary for this call. 'free' (default) keeps v1 behaviour: the
   * model may grow new paths. 'fixed' pins categories to the built-in Chinese
   * discipline tree and drops anything outside it.
   */
  taxonomyMode?: TaxonomyMode
}

const SYSTEM_PROMPT = `你是文献信息抽取与分类助手。请阅读用户给出的论文文本，输出且只输出一个 JSON 对象（不要 markdown 代码围栏、不要解释）。

JSON schema：
{
  "title": "论文标题（原文语言）",
  "authors": ["作者名"],
  "year": 2023,
  "venue": "期刊或会议名",
  "abstract": "摘要原文；若原文没有摘要，用论文语言概括（不超过 250 词）",
  "summary": "中文总结，2-3 句：研究对象、方法、主要结论",
  "contributions": ["主要贡献 2-5 条，中文"],
  "method": "核心方法/技术路线，1-3 句中文",
  "keywords": ["3-8 个关键词，原文术语优先，可中英混合"],
  "categories": ["1-3 条类目路径，形如 一级 > 二级 > 三级"],
  "relations": [{"title": "已有论文标题", "relation": "extends|uses|compares|surveys|related"}]
}

规则：
1. 只输出 JSON 对象；字符串内不要换行（用空格代替）。
2. 无法确定的字段：字符串用 null，数组用 []；不要编造作者、年份、期刊、数据集。
3. categories 必须准确定位这篇论文自己的研究领域，不要为了复用而硬套：
   - 先判断论文的宽学科与子方向再给具体主题：一级=宽学科（如 人工智能 / 计算机视觉 / 控制工程 / 机械工程 / 医学 / 材料科学），二级=研究方向，三级=具体主题或技术。
   - 「已有类目」只有在与本文主题真正吻合时才逐字复用；主题不同就提出新路径并写成 "NEW: 一级 > 二级 > 三级"，即使已有类目看起来相近也不要硬套。
   - 1-3 条，最多 3 层；至少 1 条精确到三级；多条时尽量落在不同分支（一个宽领域 + 一个具体方向）。
   - 严禁把论文归入与内容无关的类目（例如把图像识别论文归入「注意力机制」，或把预训练语言模型归入「机器翻译」）。
4. relations 只能引用「已有论文标题」列表里出现过的标题，最多 5 条；没有相关论文则输出 []。
5. 论文文本可能被截断；只依据可见内容抽取，不要脑补后半部分。`

/**
 * Rule 3 of the fixed mode: replace the free-growth category rules with a hard
 * "choose verbatim from the fixed tree" rule. Kept as a separate constant so the
 * free-mode SYSTEM_PROMPT above stays byte-identical (v1 compatibility).
 */
const FIXED_CATEGORY_RULES = `3. categories 只能从本提示末尾的「固定学科目录」中逐字选择 1-3 条完整路径（形如 一级 > 二级 > 三级）：
   - 严禁新增、改写、缩写或自造任何类目，禁止使用 "NEW:" 语法；目录中没有完全匹配的主题时，选择语义最接近的路径，可截短到目录中已有的二级或一级前缀（如 计算机科学与技术 > 人工智能）。
   - 1-3 条；多条时尽量落在不同分支；严禁把论文归入与内容无关的类目。`

const FREE_CATEGORY_RULES_START = '3. categories 必须准确定位这篇论文自己的研究领域，不要为了复用而硬套：'
const FREE_CATEGORY_RULES_END = '\n4. relations 只能引用'

function buildFixedSystemPrompt(): string {
  const start = SYSTEM_PROMPT.indexOf(FREE_CATEGORY_RULES_START)
  const end = SYSTEM_PROMPT.indexOf(FREE_CATEGORY_RULES_END)
  const head = start >= 0 ? SYSTEM_PROMPT.slice(0, start) : SYSTEM_PROMPT
  const tail = start >= 0 && end > start ? SYSTEM_PROMPT.slice(end) : ''
  return head + FIXED_CATEGORY_RULES + tail + '\n\n' + buildFixedTaxonomyPrompt()
}

/** System prompt for the requested category mode ('free' = unchanged v1 prompt). */
export function buildSystemPrompt(mode: TaxonomyMode = 'free'): string {
  return mode === 'fixed' ? buildFixedSystemPrompt() : SYSTEM_PROMPT
}

const RETRYABLE = new Set([
  'TRUNCATED',
  'MALFORMED_RESPONSE',
  'EMPTY_RESPONSE',
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
  'UNKNOWN',
])

const RELATION_KINDS = new Set(['extends', 'uses', 'compares', 'surveys', 'related'])

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function asNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric)) return null
  const year = Math.round(numeric)
  return year >= 1800 && year <= 2100 ? year : null
}

function normalizeCategory(raw: string): string {
  return raw
    .replace(/^NEW\s*[:：]\s*/i, '')
    .split('>')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 3)
    .join(' > ')
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function validatePayload(value: unknown, input: AnalyzeInput): ParsedPayload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LlmAnalyzeError('MALFORMED_RESPONSE', 'LLM output is not a JSON object')
  }
  const record = value as Record<string, unknown>
  const title = asString(record.title) || safeFileStem(input.fileName)
  const categories: string[] = []
  if (Array.isArray(record.categories)) {
    for (const item of record.categories) {
      if (typeof item !== 'string') continue
      const category = normalizeCategory(item)
      if (category && !categories.includes(category)) categories.push(category)
      if (categories.length >= 3) break
    }
  }
  const byTitle = new Map<string, { id: string; title: string }>()
  for (const paper of input.existingPapers) byTitle.set(normalizeTitleKey(paper.title), paper)
  const relations: RelationHint[] = []
  if (Array.isArray(record.relations)) {
    for (const item of record.relations) {
      if (item === null || typeof item !== 'object') continue
      const hint = item as Record<string, unknown>
      const wanted = asString(hint.title)
      if (!wanted) continue
      const matched = byTitle.get(normalizeTitleKey(wanted))
      if (matched === undefined || matched.title === title) continue
      const relationRaw = asString(hint.relation).toLowerCase()
      relations.push({
        title: matched.title,
        relation: RELATION_KINDS.has(relationRaw) ? relationRaw : 'related',
      })
      if (relations.length >= 5) break
    }
  }
  return {
    title: title.slice(0, 500),
    authors: uniqueStrings(record.authors, 30),
    year: asNumber(record.year),
    venue: asString(record.venue).slice(0, 300),
    abstract: asString(record.abstract).slice(0, 6000),
    summary: asString(record.summary).slice(0, 2000),
    contributions: uniqueStrings(record.contributions, 8),
    method: asString(record.method).slice(0, 2000),
    keywords: uniqueStrings(record.keywords, 12),
    categories,
    relations,
  }
}

/** Drop model-proposed categories that are not in the fixed tree. */
function enforceFixedCategories(categories: string[]): string[] {
  const matched: string[] = []
  for (const category of categories) {
    const fixed = matchFixedCategory(category)
    if (fixed !== null && !matched.includes(fixed)) matched.push(fixed)
  }
  return matched.slice(0, 3)
}

function buildUserPrompt(input: AnalyzeInput, repairReason: string | null): string {
  const lines: string[] = []
  if (repairReason !== null) {
    lines.push('修正要求：上一次回复无法解析为 JSON（' + repairReason + '）。请重新输出完整、合法的 JSON 对象，不要截断，不要代码围栏。', '')
  }
  lines.push(
    input.taxonomyMode === 'fixed'
      ? '固定学科目录模式：下面列出的已入库类目仅作参考（用于避免重复），你输出的 categories 必须来自系统提示末尾的「固定学科目录」，不得照抄目录外的类目：'
      : '已有类目（优先复用，必须逐字一致；若为空则自行提出）：',
  )
  if (input.existingCategories.length === 0) lines.push('- （暂无）')
  else for (const category of input.existingCategories) lines.push('- ' + category)
  lines.push('')
  lines.push('已有论文标题（relations 只能引用这些标题）：')
  if (input.existingPapers.length === 0) lines.push('- （暂无）')
  else for (const paper of input.existingPapers) lines.push('- ' + paper.title)
  lines.push('')
  lines.push('文件名：' + input.fileName)
  lines.push('论文文本是否被截断：' + (input.truncated ? '是（只看到前半部分）' : '否'))
  lines.push('')
  lines.push('<document>')
  lines.push(input.text)
  lines.push('</document>')
  lines.push('')
  lines.push('请输出 JSON。')
  return lines.join('\n')
}

function toLlmError(error: unknown): LlmAnalyzeError {
  if (error instanceof LlmAnalyzeError) return error
  const code =
    typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
      ? ((error as { code: string }).code)
      : 'LLM_ERROR'
  const message = error instanceof Error ? error.message : String(error)
  return new LlmAnalyzeError(code, message)
}

export class LlmAnalyzer {
  private model: string | null = null
  private modelFromList = false

  constructor(
    private readonly getLlm: () => LlmService | null,
    private readonly config: LitgraphConfig,
    private readonly resolver: LlmTargetResolver = new LlmTargetResolver(getLlm, config),
  ) {}

  get targetResolver(): LlmTargetResolver {
    return this.resolver
  }

  async pickModel(): Promise<string> {
    if (this.config.llmModel) return this.config.llmModel
    const target = await this.resolver.resolve()
    return target.model
  }

  async analyze(input: AnalyzeInput): Promise<AnalyzeResult> {
    const targets = await this.resolver.candidates()
    let lastError: LlmAnalyzeError | null = null
    const unavailable: string[] = []
    for (const target of targets) {
      try {
        const result = await this.attemptAnalyze(input, target)
        this.resolver.markGood(target)
        return result
      } catch (error) {
        const typed = toLlmError(error)
        lastError = typed
        if (isCredentialFailure(typed.code)) {
          this.resolver.markFailed(target.provider)
          unavailable.push(target.provider + '/' + target.model + ': ' + typed.code)
          console.warn(
            '[litgraph] provider route ' + target.provider + '/' + target.model + ' unavailable (' + typed.code + '); trying the next route',
          )
          continue
        }
        throw typed
      }
    }
    if (lastError !== null && unavailable.length > 1) {
      const summary = new LlmAnalyzeError(
        lastError.code,
        lastError.message + ' (no usable model route; tried ' + unavailable.join(', ') + ')',
      )
      throw summary
    }
    throw lastError ?? new LlmAnalyzeError('LLM_ERROR', 'no usable LLM provider route')
  }

  /**
   * One-shot JSON completion for features that define their own schema (the
   * insight view). Retries malformed output like analyze() does; the caller
   * validates the shape.
   */
  async completeJson(
    systemPrompt: string,
    userPrompt: string,
    maxTokens = 3000,
  ): Promise<{ value: unknown; model: string; ms: number; attempts: number }> {
    const targets = await this.resolver.candidates()
    let lastError: LlmAnalyzeError | null = null
    const unavailable: string[] = []
    const maxAttempts = Math.max(1, 1 + this.config.maxParseRetries)
    for (const target of targets) {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const started = Date.now()
        try {
          const raw = await this.callOnce(target, userPrompt, maxTokens, systemPrompt)
          const value = parseJsonLoose(raw)
          this.resolver.markGood(target)
          return { value, model: target.model, ms: Date.now() - started, attempts: attempt + 1 }
        } catch (error) {
          const typed = toLlmError(error)
          lastError = typed
          if (isCredentialFailure(typed.code)) {
            this.resolver.markFailed(target.provider)
            unavailable.push(target.provider + '/' + target.model + ': ' + typed.code)
            break
          }
          if (!RETRYABLE.has(typed.code) || attempt === maxAttempts - 1) throw typed
          console.warn('[litgraph] insight completion attempt ' + (attempt + 1) + ' failed (' + typed.code + '), retrying')
        }
      }
    }
    if (lastError !== null && unavailable.length > 1) {
      throw new LlmAnalyzeError(
        lastError.code,
        lastError.message + ' (no usable model route; tried ' + unavailable.join(', ') + ')',
      )
    }
    throw lastError ?? new LlmAnalyzeError('LLM_ERROR', 'no usable LLM provider route')
  }

  private async attemptAnalyze(input: AnalyzeInput, target: LlmTarget): Promise<AnalyzeResult> {
    const maxAttempts = Math.max(1, 1 + this.config.maxParseRetries)
    const taxonomyMode: TaxonomyMode = input.taxonomyMode ?? 'free'
    const systemPrompt = buildSystemPrompt(taxonomyMode)
    let lastError: LlmAnalyzeError | null = null
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const maxTokens = Math.round(this.config.llmMaxTokens * (attempt === 0 ? 1 : 1.8))
      const prompt = buildUserPrompt(input, attempt === 0 ? null : (lastError?.message ?? 'invalid JSON'))
      const started = Date.now()
      try {
        const raw = await this.callOnce(target, prompt, maxTokens, systemPrompt)
        const payload = validatePayload(parseJsonLoose(raw), input)
        if (taxonomyMode === 'fixed') {
          const matched = enforceFixedCategories(payload.categories)
          if (matched.length === 0 && attempt < maxAttempts - 1) {
            throw new LlmAnalyzeError('MALFORMED_RESPONSE', 'categories 必须逐字来自固定学科目录')
          }
          if (matched.length === 0) {
            console.warn('[litgraph] fixed taxonomy mode: model returned no in-catalogue category; keeping empty categories')
          }
          payload.categories = matched
        }
        return {
          payload,
          raw,
          model: target.model,
          ms: Date.now() - started,
          attempts: attempt + 1,
          usedRetry: attempt > 0,
        }
      } catch (error) {
        const typed = toLlmError(error)
        lastError = typed
        if (isCredentialFailure(typed.code)) throw typed
        if (!RETRYABLE.has(typed.code)) throw typed
        if (attempt === maxAttempts - 1) throw typed
        console.warn('[litgraph] LLM attempt ' + (attempt + 1) + ' failed (' + typed.code + '), retrying once')
      }
    }
    throw lastError ?? new LlmAnalyzeError('LLM_ERROR', 'LLM call failed')
  }

  private async callOnce(target: LlmTarget, prompt: string, maxTokens: number, systemPrompt: string): Promise<string> {
    const llm = this.getLlm()
    if (llm === null) throw new LlmAnalyzeError('NO_LLM', 'ctx.llm service is not available in this host')
    if (typeof llm.prepareCall !== 'function') throw new LlmAnalyzeError('NO_LLM', 'ctx.llm.prepareCall is not a function')
    const base = {
      provider: target.provider,
      model: target.model,
      maxTokens,
      temperature: 0,
    }
    let call
    try {
      call = await llm.prepareCall(base, undefined, (controls: Record<string, unknown>) => ({
        ...controls,
        reasoningEffort: 'off',
      }))
    } catch (error) {
      const typed = toLlmError(error)
      if (typed.code !== 'UNSUPPORTED_REASONING_EFFORT') throw typed
      call = await llm.prepareCall(base)
    }
    const options: Record<string, unknown> = {
      ...call.config,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      system: systemPrompt,
    }
    let text = ''
    let finish: unknown = null
    for await (const chunk of call.stream(options) as AsyncIterable<LlmStreamChunk>) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      else if (chunk.type === 'finish') finish = chunk.reason ?? chunk
    }
    const reason = finish as { kind?: string; failure?: { code?: string; message?: string } } | null
    if (reason !== null && typeof reason === 'object') {
      if (reason.kind === 'error') {
        throw new LlmAnalyzeError(reason.failure?.code ?? 'LLM_ERROR', reason.failure?.message ?? 'LLM request failed')
      }
      if (reason.kind === 'max-tokens') {
        throw new LlmAnalyzeError('TRUNCATED', 'LLM output hit max_tokens before the JSON object was complete')
      }
    }
    if (text.trim() === '') throw new LlmAnalyzeError('EMPTY_RESPONSE', 'LLM returned an empty response')
    return text
  }
}

export { SYSTEM_PROMPT as LLM_SYSTEM_PROMPT, buildUserPrompt }
