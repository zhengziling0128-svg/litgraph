/**
 * 洞察 tab — 数据库内论文研究趋势.
 *
 * Statistical half: method frequency / first year / recent share / trend, all
 * computed by the host from real paper years. Narrative half: one cached model
 * call per scope returns evolution, solved problems, limits, method×problem gaps
 * and open questions, each tied to evidence paper ids. Nothing here claims to be
 * the external state of the art; every card can jump back to the star map.
 */
import * as React from 'react'
import { fetchInsight, fetchPaper, fetchSettings, saveSettings, updatePaper } from '../api'
import type {
  GraphPayload,
  InsightPayload,
  InsightScope,
  InsightTrend,
  LibrarySettings,
} from '../types'
import { ensureInsightStyles } from '../styles-insight'

ensureInsightStyles()

const SCOPE_OPTIONS: Array<{ value: InsightScope; label: string }> = [
  { value: 'cluster', label: '当前聚类' },
  { value: 'group', label: '同一学科' },
  { value: 'all', label: '全部文献' },
]

const YEAR_OPTIONS = [3, 5, 10]

const TREND_LABEL: Record<InsightTrend, string> = {
  new: '新出现',
  rising: '升温',
  steady: '平稳',
  cooling: '退潮',
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function percent(value: number): string {
  return Math.round(value * 100) + '%'
}

function downloadMarkdown(data: InsightPayload): void {
  const lines: string[] = []
  lines.push('# ' + data.clusterLabel + ' · 数据库内论文研究趋势')
  lines.push('')
  lines.push(
    '范围：' + data.scopeLabel + ' · 样本 ' + data.sampleSize + '/' + data.readyCount + ' 篇 · 近期 ' + data.recentFromYear + '–' + new Date().getFullYear() + ' 年',
  )
  lines.push('')
  lines.push('> ' + data.disclaimer)
  lines.push('')
  if (data.objects.length > 0) {
    lines.push('## 共同研究对象')
    lines.push('')
    lines.push(data.objects.join('、'))
    lines.push('')
  }
  lines.push('## 方法雷达')
  lines.push('')
  lines.push('| 方法 | 篇数 | 首次出现 | 近 ' + data.recentYears + ' 年占比 | 趋势 | 平均评分 |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  for (const method of data.methods) {
    lines.push(
      '| ' + method.name + ' | ' + method.count + ' | ' + (method.firstYear ?? '—') + ' | ' + percent(method.recentShare) + ' | ' + TREND_LABEL[method.trend] + ' | ' + (method.avgRating ?? '—') + ' |',
    )
  }
  lines.push('')
  const list = (title: string, items: string[]) => {
    if (items.length === 0) return
    lines.push('## ' + title)
    lines.push('')
    for (const item of items) lines.push('- ' + item)
    lines.push('')
  }
  list('方法演进', data.evolution)
  list('已解决的问题', data.solved)
  list('已知局限', data.limits)
  if (data.gaps.length > 0) {
    lines.push('## 空白组合（方法 × 问题）')
    lines.push('')
    for (const gap of data.gaps) {
      lines.push('- **' + gap.method + ' × ' + gap.problem + '** — ' + gap.why)
    }
    lines.push('')
  }
  if (data.questions.length > 0) {
    lines.push('## 研究问题')
    lines.push('')
    for (const question of data.questions) {
      lines.push('- **' + question.question + '** — ' + question.why)
    }
    lines.push('')
  }
  lines.push('## 证据论文')
  lines.push('')
  for (const paper of data.papers) {
    lines.push('- ' + paper.id + ' · ' + (paper.year ?? '年份未知') + ' · ' + paper.title)
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'litgraph-insight-' + data.clusterLabel.replace(/[\\/:*?"<>|]/gu, '_') + '.md'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export interface InsightViewProps {
  graph: GraphPayload | null
  selectedId: string | null
  onLocate: (id: string) => void
  onToast?: (kind: 'success' | 'error' | 'info', message: string) => void
  onSettingsChanged?: (settings: LibrarySettings) => void
  /** Bumped by the settings dialog so an already-mounted view re-reads its defaults. */
  settingsToken?: number
}

export function InsightView(props: InsightViewProps) {
  const { graph, selectedId, onLocate, onToast, onSettingsChanged, settingsToken } = props
  const [settings, setSettings] = React.useState<LibrarySettings | null>(null)
  const [scope, setScope] = React.useState<InsightScope>('cluster')
  const [years, setYears] = React.useState(3)
  const [data, setData] = React.useState<InsightPayload | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [noteSaving, setNoteSaving] = React.useState<string | null>(null)
  // Hold the first generation until the stored defaults arrived, otherwise the
  // view briefly generates (and shows) a cluster+cache result that the stored
  // scope / recent-window is about to replace.
  const [settingsReady, setSettingsReady] = React.useState(false)
  const abortRef = React.useRef<AbortController | null>(null)
  const precomputedRef = React.useRef(false)

  const selectedNode = graph !== null && selectedId !== null ? graph.nodes.find((node) => node.id === selectedId) ?? null : null
  const clusterId = selectedNode !== null ? selectedNode.clusterId : null
  const clusterLabel = graph !== null && clusterId !== null ? graph.clusters.find((cluster) => cluster.id === clusterId)?.label ?? '' : ''

  React.useEffect(() => {
    let alive = true
    fetchSettings()
      .then((payload) => {
        if (!alive) return
        setSettings(payload.settings)
        const savedScope = payload.settings.insightScope
        if (savedScope === 'cluster' || savedScope === 'group' || savedScope === 'all') setScope(savedScope)
        const savedYears = payload.settings.insightRecentYears
        if (typeof savedYears === 'number' && savedYears >= 1) setYears(Math.round(savedYears))
      })
      .catch(() => {
        /* settings are optional: keep the built-in defaults */
      })
      .finally(() => {
        if (alive) setSettingsReady(true)
      })
    return () => {
      alive = false
    }
  }, [settingsToken])

  const load = React.useCallback(
    async (refresh: boolean) => {
      if (scope === 'cluster' && clusterId === null) {
        setData(null)
        setError(null)
        setLoading(false)
        return
      }
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(null)
      try {
        const payload = await fetchInsight({ scope, clusterId, recentYears: years, refresh }, controller.signal)
        if (controller.signal.aborted) return
        setData(payload)
      } catch (caught) {
        if (controller.signal.aborted) return
        setError(describe(caught))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [scope, clusterId, years],
  )

  React.useEffect(() => {
    if (!settingsReady) return
    void load(false)
    return () => {
      abortRef.current?.abort()
    }
  }, [load, settingsReady])

  // Optional background cache warm-up for the other clusters (settings toggle).
  React.useEffect(() => {
    if (settings?.insightPrecompute !== true || graph === null || precomputedRef.current) return
    if (scope !== 'cluster') return
    const targets = graph.clusters.filter((cluster) => cluster.id !== clusterId)
    if (targets.length === 0) return
    precomputedRef.current = true
    void (async () => {
      let warmed = 0
      for (const cluster of targets) {
        try {
          await fetchInsight({ scope: 'cluster', clusterId: cluster.id, recentYears: years })
          warmed += 1
        } catch {
          /* one failing cluster must not stop the warm-up */
        }
      }
      if (warmed > 0) onToast?.('info', '已在后台缓存 ' + warmed + ' 个聚类的洞察')
    })()
  }, [settings, graph, scope, clusterId, years, onToast])

  const changeScope = (next: InsightScope) => {
    if (next === scope) return
    setScope(next)
    void saveSettings({ insightScope: next })
      .then((payload) => onSettingsChanged?.(payload.settings))
      .catch(() => {
        /* the view still works with the local choice */
      })
  }

  const changeYears = (next: number) => {
    if (next === years) return
    setYears(next)
    void saveSettings({ insightRecentYears: next })
      .then((payload) => onSettingsChanged?.(payload.settings))
      .catch(() => {
        /* ignore: local choice already applied */
      })
  }

  const saveToNote = async (key: string, title: string, body: string, paperIds: string[]) => {
    const id = paperIds[0]
    if (id === undefined || noteSaving !== null) return
    setNoteSaving(key)
    try {
      const paper = await fetchPaper(id)
      const stamp = new Date().toLocaleString('zh-CN', { hour12: false })
      const block = '\n\n[洞察 ' + stamp + '] ' + title + '\n' + body
      const notes = ((paper.notes ?? '') + block).slice(0, 20000)
      await updatePaper(id, { notes })
      onToast?.('success', '已写入《' + paper.title.slice(0, 22) + '》的笔记')
    } catch (caught) {
      onToast?.('error', '写入笔记失败：' + describe(caught))
    } finally {
      setNoteSaving(null)
    }
  }

  const canSaveNotes = settings?.insightSaveNotes !== false
  const maxCount = data !== null && data.methods.length > 0 ? data.methods[0].count : 1
  const currentYear = new Date().getFullYear()

  return (
    <div className="lgi-root">
      <div className="lgi-toolbar">
        <div className="lgi-seg" role="group" aria-label="洞察作用域">
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={'lgi-seg-btn' + (scope === option.value ? ' is-active' : '')}
              aria-pressed={scope === option.value}
              onClick={() => changeScope(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <select
          className="lgi-select"
          value={years}
          aria-label="近期窗口"
          onChange={(event) => changeYears(Number(event.target.value))}
        >
          {YEAR_OPTIONS.map((value) => (
            <option key={value} value={value}>
              近期 {value} 年
            </option>
          ))}
        </select>
        <span className="lgi-spacer" />
        {data !== null ? (
          <span className="lgi-meta">
            {data.sampleSize}/{data.readyCount} 篇 · {data.cached ? '缓存' : '刚生成'}
          </span>
        ) : null}
        <button type="button" className="lg-btn lg-btn-sm lg-btn-ghost" disabled={loading} onClick={() => void load(true)}>
          重新生成
        </button>
        <button type="button" className="lg-btn lg-btn-sm" disabled={data === null} onClick={() => data !== null && downloadMarkdown(data)}>
          导出 Markdown
        </button>
      </div>

      {scope === 'cluster' && clusterId === null ? (
        <div className="lgi-empty">
          <div className="lgi-empty-title">先选一篇文献</div>
          <div className="lgi-empty-hint">
            洞察默认按「当前选中聚类」统计。在星图上点一个节点或从右侧论文库选一篇，这里会分析该聚类的方法分布与空白；
            也可以把上方作用域切到「全部文献」直接看整库趋势。
          </div>
        </div>
      ) : loading && data === null ? (
        <div className="lgi-loading">
          <span className="lgi-spin" />
          正在阅读 {scope === 'cluster' ? '「' + clusterLabel + '」' : '所选范围'} 的论文并生成洞察…首次约 5–20 秒，之后读缓存。
        </div>
      ) : error !== null ? (
        <div className="lgi-error-row">
          <div className="lgi-error">{error}</div>
          <button type="button" className="lg-btn lg-btn-sm" onClick={() => void load(true)}>
            重试
          </button>
        </div>
      ) : data !== null ? (
        <div className="lgi-scroll">
          <div className="lgi-hero">
            <div className="lgi-hero-title">
              数据库内论文研究趋势
              <span className="lgi-hero-badge">{data.clusterLabel}</span>
            </div>
            <div className="lgi-hero-sub">
              {data.scopeLabel} · 样本 {data.sampleSize}
              {data.truncated ? ' / ' + data.readyCount + ' 篇（分层抽样）' : ' 篇'} · 近 {data.recentYears} 年 = {data.recentFromYear}–
              {currentYear} 年 · {data.model} · {(data.ms / 1000).toFixed(1)}s
            </div>
          </div>

          <div className="lgi-note">{data.disclaimer}</div>

          {data.objects.length > 0 ? (
            <div className="lgi-section">
              <div className="lgi-section-head">
                <span className="lgi-section-title">共同研究对象</span>
                <span className="lgi-section-hint">模型从样本标题 / 关键词里归纳</span>
              </div>
              <div className="lgi-chips">
                {data.objects.map((object) => (
                  <span key={object} className="lgi-chip is-static">
                    {object}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="lgi-section">
            <div className="lgi-section-head">
              <span className="lgi-section-title">方法雷达</span>
              <span className="lgi-section-hint">
                {data.methods.length} 种方法 · 篇数 / 首次出现年份 / 近 {data.recentYears} 年占比 / 平均评分
              </span>
            </div>
            {data.methods.length === 0 ? (
              <div className="lgi-section-hint">这批论文的方法字段为空，模型也没抽出方法名。</div>
            ) : (
              data.methods.map((method) => (
                <div key={method.name} className="lgi-method">
                  <div className="lgi-method-name">
                    <span className="lgi-method-title" title={method.name}>
                      {method.name}
                    </span>
                    {method.note !== '' ? <span className="lgi-method-note">{method.note}</span> : null}
                  </div>
                  <div className="lgi-bar" aria-hidden="true">
                    <div className="lgi-bar-fill" style={{ width: Math.max(6, (method.count / maxCount) * 100) + '%' }} />
                  </div>
                  <div className="lgi-method-meta">
                    <span>{method.count} 篇</span>
                    <span>{method.firstYear !== null ? '首次 ' + method.firstYear : '年份未知'}</span>
                    <span>近期 {percent(method.recentShare)}</span>
                    <span className="lgi-trend" data-trend={method.trend}>
                      {TREND_LABEL[method.trend]}
                    </span>
                    {method.avgRating !== null ? <span>★ {method.avgRating}</span> : null}
                  </div>
                </div>
              ))
            )}
          </div>

          {data.evolution.length > 0 ? (
            <div className="lgi-section">
              <div className="lgi-section-head">
                <span className="lgi-section-title">方法演进</span>
              </div>
              <ul className="lgi-list">
                {data.evolution.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.solved.length > 0 || data.limits.length > 0 ? (
            <div className="lgi-cols">
              {data.solved.length > 0 ? (
                <div className="lgi-section">
                  <div className="lgi-section-head">
                    <span className="lgi-section-title">已解决的问题</span>
                  </div>
                  <ul className="lgi-list">
                    {data.solved.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {data.limits.length > 0 ? (
                <div className="lgi-section">
                  <div className="lgi-section-head">
                    <span className="lgi-section-title">论文指出的局限</span>
                  </div>
                  <ul className="lgi-list">
                    {data.limits.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {data.gaps.length > 0 ? (
            <div className="lgi-section">
              <div className="lgi-section-head">
                <span className="lgi-section-title">空白组合</span>
                <span className="lgi-section-hint">方法 × 问题 · 点证据回星图 · 标「推测」不入结论</span>
              </div>
              <div className="lgi-cards">
                {data.gaps.map((gap, index) => {
                  const key = 'gap-' + index
                  return (
                    <div key={key} className="lgi-card">
                      <div className="lgi-card-title">
                        {gap.method} × {gap.problem}
                      </div>
                      <div className="lgi-card-body">{gap.why}</div>
                      <div className="lgi-card-foot">
                        {gap.paperIds.map((id) => {
                          const paper = data.papers.find((entry) => entry.id === id)
                          return (
                            <button
                              key={id}
                              type="button"
                              className="lgi-chip"
                              title={paper !== undefined ? paper.title : id}
                              onClick={() => onLocate(id)}
                            >
                              {paper !== undefined ? paper.title : id}
                            </button>
                          )
                        })}
                        {canSaveNotes ? (
                          <button
                            type="button"
                            className="lgi-text-btn"
                            disabled={noteSaving !== null || gap.paperIds.length === 0}
                            onClick={() =>
                              void saveToNote(
                                key,
                                gap.method + ' × ' + gap.problem,
                                gap.why,
                                gap.paperIds,
                              )
                            }
                          >
                            {noteSaving === key ? '写入中…' : '存笔记'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {data.questions.length > 0 ? (
            <div className="lgi-section">
              <div className="lgi-section-head">
                <span className="lgi-section-title">可以往下做的研究问题</span>
                <span className="lgi-section-hint">基于本库空白组合的推测</span>
              </div>
              <div className="lgi-cards">
                {data.questions.map((question, index) => {
                  const key = 'question-' + index
                  return (
                    <div key={key} className="lgi-card">
                      <div className="lgi-card-title">{question.question}</div>
                      <div className="lgi-card-body">{question.why}</div>
                      <div className="lgi-card-foot">
                        {question.paperIds.map((id) => {
                          const paper = data.papers.find((entry) => entry.id === id)
                          return (
                            <button
                              key={id}
                              type="button"
                              className="lgi-chip"
                              title={paper !== undefined ? paper.title : id}
                              onClick={() => onLocate(id)}
                            >
                              {paper !== undefined ? paper.title : id}
                            </button>
                          )
                        })}
                        {canSaveNotes ? (
                          <button
                            type="button"
                            className="lgi-text-btn"
                            disabled={noteSaving !== null || question.paperIds.length === 0}
                            onClick={() =>
                              void saveToNote(key, question.question, question.why, question.paperIds)
                            }
                          >
                            {noteSaving === key ? '写入中…' : '存笔记'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="lgi-section">
            <div className="lgi-section-head">
              <span className="lgi-section-title">样本论文</span>
              <span className="lgi-section-hint">点任意一篇回星图定位</span>
            </div>
            <div className="lgi-chips">
              {data.papers.map((paper) => (
                <button
                  key={paper.id}
                  type="button"
                  className="lgi-chip"
                  title={paper.title}
                  onClick={() => onLocate(paper.id)}
                >
                  {paper.year !== null ? paper.year + ' · ' : ''}
                  {paper.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="lgi-empty">
          <div className="lgi-empty-title">还没有生成洞察</div>
          <div className="lgi-empty-hint">选一个聚类或切换到「全部文献」，然后点「重新生成」。</div>
        </div>
      )}
    </div>
  )
}
