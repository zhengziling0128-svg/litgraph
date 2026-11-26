/** Left column: everything the host knows about the selected paper (plus notes / tags / star). */
import * as React from 'react'
import type { Cluster, JournalMetrics, PaperDetail, PaperPatch, ZoteroState } from '../types'
import { STATUS_LABEL } from '../types'
import {
  ApiError,
  authorizeZotero,
  fetchPaper,
  fetchZoteroState,
  refreshMetrics,
  setPaperCollections,
  syncZotero,
  updatePaper,
} from '../api'
import { ensureFeatureStyles } from '../styles-features'
import { ExternalIcon, TrashIcon, LocateIcon, InfoIcon } from './icons'

ensureFeatureStyles()

export type ToastKind = 'success' | 'error' | 'info'

export interface DetailPanelProps {
  detail: PaperDetail | null
  loading: boolean
  error: string | null
  clusters: Cluster[]
  deleting: boolean
  onOpenFile: (id: string) => void
  onDelete: (id: string, title: string) => void
  onLocate: (id: string) => void
  onRetry: () => void
  /** Called after a successful PATCH so the workbench can refresh graph/list/detail. */
  onChanged?: (paper: PaperDetail) => void
  /** Host-provided toast; a quiet inline hint is used when omitted. */
  onToast?: (kind: ToastKind, message: string) => void
  /** Optional hook: click a tag chip to filter the library by it. */
  onTagFilter?: (tag: string) => void
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const NOTES_MAX = 20000
const TAGS_MAX = 24
const TAG_LEN_MAX = 40
const NOTES_DEBOUNCE_MS = 800
const RATING_VALUES: number[] = [1, 2, 3, 4, 5]
/** After POST /metrics/refresh, poll GET /paper until metrics appear. */
const METRICS_POLL_INTERVAL_MS = 1200
const METRICS_POLL_TIMEOUT_MS = 20000

export function DetailPanel(props: DetailPanelProps) {
  const { detail, loading, error, clusters, deleting, onOpenFile, onDelete, onLocate, onRetry, onChanged, onToast, onTagFilter } = props
  const cluster = detail && detail.clusterId ? clusters.find((item) => item.id === detail.clusterId) : undefined
  const clusterColor = cluster ? cluster.color : '#7fd1ff'
  const paperId = detail ? detail.id : null
  const readAt = typeof detail?.zotero?.lastRead === 'number' ? detail.zotero.lastRead : 0
  const readState = readAt > 0
  const [notesDraft, setNotesDraft] = React.useState('')
  const [saveState, setSaveState] = React.useState<SaveState>('idle')
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [tags, setTags] = React.useState<string[]>([])
  const [tagDraft, setTagDraft] = React.useState('')
  const [tagHint, setTagHint] = React.useState<string | null>(null)
  const [tagsSaving, setTagsSaving] = React.useState(false)
  const [rating, setRating] = React.useState(0)
  const [ratingBusy, setRatingBusy] = React.useState(false)
  const [metricsBusy, setMetricsBusy] = React.useState(false)
  const [metricsHint, setMetricsHint] = React.useState<string | null>(null)
  const [metricsOverride, setMetricsOverride] = React.useState<JournalMetrics | null>(null)
  /** Id whose metrics poll is still running; cleared on selection change/unmount. */
  const pollIdRef = React.useRef<string | null>(null)
  // Local metrics snapshot wins until another paper is selected, so the panel
  // updates even when the workbench does not re-feed the detail promise.
  const metrics = metricsOverride ?? (detail && detail.metrics ? detail.metrics : null)

  const [zoteroState, setZoteroState] = React.useState<ZoteroState | null>(null)
  const [zoteroBusy, setZoteroBusy] = React.useState(false)
  const [zoteroHint, setZoteroHint] = React.useState<string | null>(null)
  const [collectionEditing, setCollectionEditing] = React.useState(false)
  const [collectionDraft, setCollectionDraft] = React.useState<string[]>([])

  const zoteroRef = detail ? detail.zotero : undefined

  const loadZoteroState = React.useCallback(async (): Promise<void> => {
    try {
      setZoteroState(await fetchZoteroState())
    } catch (caught) {
      setZoteroState(null)
      setZoteroHint('读取 Zotero 状态失败：' + describeError(caught))
    }
  }, [])

  React.useEffect(() => {
    void loadZoteroState()
  }, [loadZoteroState])

  const syncZoteroLink = React.useCallback(async (): Promise<void> => {
    if (paperId === null) return
    setZoteroBusy(true)
    setZoteroHint(null)
    try {
      const result = await syncZotero()
      if (!result.ok) {
        setZoteroHint(result.error ?? '同步失败：请先打开 Zotero（高级 → 杂项 → 允许其他应用通讯）')
        return
      }
      const paper = await fetchPaper(paperId)
      onChanged?.(paper)
      await loadZoteroState()
      onToast?.(
        'success',
        result.matched > 0
          ? '已同步 Zotero：匹配 ' + result.matched + '/' + result.total + ' 篇'
          : 'Zotero 里没有找到标题一致的条目',
      )
    } catch (caught) {
      setZoteroHint('同步失败：' + describeError(caught))
    } finally {
      setZoteroBusy(false)
    }
  }, [paperId, onChanged, onToast, loadZoteroState])

  const authorizeZoteroWrite = React.useCallback(async (): Promise<void> => {
    setZoteroBusy(true)
    setZoteroHint('Zotero 会弹出授权确认，请点「Always Allow」以便长期记录阅读时间。')
    try {
      const result = await authorizeZotero()
      if (!result.ok) {
        setZoteroHint(result.error ?? 'Zotero 授权失败')
        return
      }
      await loadZoteroState()
      setZoteroHint(result.remembered === false ? '授权成功（仅本次有效，下次写入会再询问）' : null)
      onToast?.('success', '已授权 LitGraph 修改 Zotero')
    } catch (caught) {
      setZoteroHint('授权失败：' + describeError(caught))
    } finally {
      setZoteroBusy(false)
    }
  }, [loadZoteroState, onToast])

  const startCollectionEdit = (): void => {
    setCollectionDraft([...(detail?.zotero?.collections ?? [])])
    setCollectionEditing(true)
    setZoteroHint(null)
  }

  const toggleCollectionDraft = (key: string): void => {
    setCollectionDraft((draft) =>
      draft.includes(key) ? draft.filter((item) => item !== key) : [...draft, key],
    )
  }

  const saveCollections = React.useCallback(async (): Promise<void> => {
    if (paperId === null) return
    setZoteroBusy(true)
    setZoteroHint(null)
    try {
      const result = await setPaperCollections(paperId, collectionDraft)
      if (!result.ok) {
        setZoteroHint(result.error ?? '保存失败')
        if (result.code === 'NEED_AUTH') await loadZoteroState()
        return
      }
      if (result.paper) onChanged?.(result.paper)
      setCollectionEditing(false)
      onToast?.('success', '已更新 Zotero 分类')
    } catch (caught) {
      const raw = describeError(caught)
      if (raw.includes('NEED_AUTH')) {
        setZoteroHint('需要先授权：点「授权 Zotero」并在弹窗里选 Always Allow，然后再点保存。')
        await loadZoteroState()
      } else if (raw.includes('NOT_LINKED')) {
        setZoteroHint('这篇还没链接到 Zotero 条目，先点「同步 Zotero」。')
      } else {
        setZoteroHint('保存失败：' + raw.slice(0, 240))
      }
    } finally {
      setZoteroBusy(false)
    }
  }, [paperId, collectionDraft, onChanged, onToast, loadZoteroState])

  const savedRef = React.useRef<{ id: string; notes: string } | null>(null)
  const draftRef = React.useRef('')
  const prevIdRef = React.useRef<string | null>(null)
  const timerRef = React.useRef<number | null>(null)
  draftRef.current = notesDraft

  // Reset the editable fields whenever another paper becomes selected.
  React.useEffect(() => {
    savedRef.current = paperId ? { id: paperId, notes: detail?.notes ?? '' } : null
    setNotesDraft(detail?.notes ?? '')
    setTags(detail?.tags ?? [])
    setRating(readRating(detail))
    setSaveState('idle')
    setSaveError(null)
    setTagDraft('')
    setTagHint(null)
    setTagsSaving(false)
    setRatingBusy(false)
    pollIdRef.current = null
    setMetricsBusy(false)
    setMetricsHint(null)
    setMetricsOverride(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId])

  // Flush an unsaved draft when the selection changes or the panel unmounts.
  React.useEffect(() => {
    return () => {
      const prevId = prevIdRef.current
      if (!prevId) return
      const saved = savedRef.current
      if (saved && saved.id === prevId && saved.notes !== draftRef.current) {
        void updatePaper(prevId, { notes: draftRef.current }).catch(() => undefined)
      }
    }
  }, [paperId])

  React.useEffect(() => {
    prevIdRef.current = paperId
  }, [paperId])

  const saveNotes = React.useCallback(
    async (id: string, text: string) => {
      setSaveState('saving')
      setSaveError(null)
      try {
        const result = await updatePaper(id, { notes: text })
        if (savedRef.current && savedRef.current.id === id) savedRef.current.notes = text
        setSaveState(draftRef.current === text ? 'saved' : 'pending')
        onChanged?.(result.paper)
      } catch (caught) {
        setSaveState('error')
        setSaveError(describeError(caught))
        onToast?.('error', '笔记保存失败：' + describeError(caught))
      }
    },
    [onChanged, onToast],
  )

  // Debounced autosave: fires 800ms after the last keystroke.
  React.useEffect(() => {
    if (!paperId) return
    const saved = savedRef.current
    if (!saved || saved.id !== paperId) return
    if (notesDraft === saved.notes) {
      setSaveState((state) => (state === 'pending' ? 'idle' : state))
      return
    }
    setSaveState((state) => (state === 'saving' ? state : 'pending'))
    setSaveError(null)
    const timer = window.setTimeout(() => {
      timerRef.current = null
      void saveNotes(paperId, notesDraft)
    }, NOTES_DEBOUNCE_MS)
    timerRef.current = timer
    return () => {
      window.clearTimeout(timer)
      if (timerRef.current === timer) timerRef.current = null
    }
  }, [notesDraft, paperId, saveNotes])

  // Let "已保存" fade back to idle after a moment.
  React.useEffect(() => {
    if (saveState !== 'saved') return
    const timer = window.setTimeout(() => setSaveState((state) => (state === 'saved' ? 'idle' : state)), 2200)
    return () => window.clearTimeout(timer)
  }, [saveState])

  const flushNotes = React.useCallback(() => {
    const id = paperId
    const saved = savedRef.current
    if (!id || !saved || saved.id !== id) return
    if (notesDraft === saved.notes) return
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    void saveNotes(id, notesDraft)
  }, [paperId, notesDraft, saveNotes])

  const applyPatch = React.useCallback(
    async (patch: PaperPatch): Promise<PaperDetail | null> => {
      if (!paperId) return null
      return updatePaper(paperId, patch)
    },
    [paperId],
  )

  const saveTags = React.useCallback(
    async (next: string[]) => {
      if (!paperId) return
      const previous = tags
      setTags(next)
      setTagsSaving(true)
      setTagHint(null)
      try {
        const result = await applyPatch({ tags: next })
        if (result && Array.isArray(result.paper.tags)) setTags(result.paper.tags)
        if (result) onChanged?.(result.paper)
      } catch (caught) {
        setTags(previous)
        setTagHint('标签保存失败：' + describeError(caught))
        onToast?.('error', '标签保存失败')
      } finally {
        setTagsSaving(false)
      }
    },
    [paperId, tags, applyPatch, onChanged, onToast],
  )

  const addTag = React.useCallback(
    (raw: string) => {
      if (!paperId || tagsSaving) return
      const value = raw
        .replace(/[\s,，、;；]+/g, ' ')
        .trim()
      if (!value) {
        setTagDraft('')
        return
      }
      if (value.length > TAG_LEN_MAX) {
        setTagHint('单个标签最多 ' + TAG_LEN_MAX + ' 个字符')
        return
      }
      if (tags.length >= TAGS_MAX) {
        setTagHint('最多 ' + TAGS_MAX + ' 个标签')
        return
      }
      if (tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
        setTagHint('已存在同名标签')
        setTagDraft('')
        return
      }
      setTagDraft('')
      setTagHint(null)
      void saveTags([...tags, value])
    },
    [paperId, tagsSaving, tags, saveTags],
  )

  const removeTag = React.useCallback(
    (target: string) => {
      if (tagsSaving) return
      setTagHint(null)
      void saveTags(tags.filter((tag) => tag !== target))
    },
    [tagsSaving, tags, saveTags],
  )

  // Star rating: clicking the active value clears it back to 0. The legacy
  // "starred" flag is patched alongside so older hosts keep the star filter in
  // sync (rating >= 1 <=> starred).
  const rate = React.useCallback(
    async (value: number) => {
      if (!paperId || ratingBusy) return
      const next = value === rating ? 0 : value
      const previous = rating
      setRating(next)
      setRatingBusy(true)
      try {
        const result = await applyPatch({ rating: next, starred: next >= 1 })
        if (result) {
          setRating(readRating(result.paper))
          onChanged?.(result.paper)
        }
        onToast?.('success', next === 0 ? '已清除评分' : '已评 ' + next + ' 星')
      } catch (caught) {
        setRating(previous)
        onToast?.('error', '评分更新失败：' + describeError(caught))
      } finally {
        setRatingBusy(false)
      }
    },
    [paperId, ratingBusy, rating, applyPatch, onChanged, onToast],
  )

  // Ask the host to resolve journal metrics, then poll GET /paper until the
  // lookup lands (the host queues the EasyScholar request asynchronously).
  const queryMetrics = React.useCallback(async () => {
    const id = paperId
    if (!id || metricsBusy) return
    pollIdRef.current = id
    setMetricsBusy(true)
    setMetricsHint(null)
    try {
      const queued = await refreshMetrics([id], { force: true })
      if (pollIdRef.current !== id) return
      if (!queued.ok) {
        setMetricsHint('宿主暂不支持期刊指标查询')
        return
      }
      onToast?.('info', queued.queued > 0 ? '已提交期刊指标查询…' : '指标已是最新，正在刷新')
      const deadline = Date.now() + METRICS_POLL_TIMEOUT_MS
      let found: JournalMetrics | null = null
      while (Date.now() < deadline && pollIdRef.current === id) {
        await sleep(METRICS_POLL_INTERVAL_MS)
        if (pollIdRef.current !== id) return
        try {
          const paper = await fetchPaper(id)
          if (paper.metrics) {
            found = paper.metrics
            onChanged?.(paper)
            break
          }
        } catch {
          // Keep polling: the host may still be resolving the lookup.
        }
      }
      if (pollIdRef.current !== id) return
      if (found) {
        setMetricsOverride(found)
        onToast?.('success', '期刊指标已更新')
      } else {
        let reason = ''
        try {
          const paper = await fetchPaper(id)
          const match = /\|\s*metrics:\s*(.+)$/u.exec(paper.parseNote ?? '')
          if (match !== null) reason = match[1].trim()
        } catch {
          // Keep the generic hint when the reason is unavailable.
        }
        setMetricsHint(
          reason === ''
            ? '重新查询也没拿到指标：会议论文通常没有分区数据，或期刊名与 EasyScholar 收录名不一致'
            : 'EasyScholar 没收录这个期刊名（' + reason + '）。可以核对文献里的期刊字段。',
        )
      }
    } catch (caught) {
      if (pollIdRef.current === id) {
        const status = caught instanceof ApiError ? caught.status : 0
        setMetricsHint(
          status === 401 || status === 404
            ? '当前运行的宿主是旧版本，还没有指标接口：完全退出并重开 DeepSeek Harness 后再试'
            : '查询指标失败：' + describeError(caught),
        )
      }
    } finally {
      if (pollIdRef.current === id) {
        pollIdRef.current = null
        setMetricsBusy(false)
      }
    }
  }, [paperId, metricsBusy, onChanged, onToast])

  // Abort a running metrics poll once the panel goes away.
  React.useEffect(() => {
    return () => {
      pollIdRef.current = null
    }
  }, [])

  if (loading && !detail) {
    return (
      <div className="lg-detail lg-scroll" data-litgraph="detail">
        <DetailSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="lg-detail lg-scroll" data-litgraph="detail">
        <div className="lg-detail-empty">
          <div className="lg-detail-empty-title">详情加载失败</div>
          <div className="lg-detail-empty-hint">{error}</div>
          <button type="button" className="lg-btn lg-btn-ghost" onClick={onRetry}>
            重试
          </button>
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="lg-detail lg-scroll" data-litgraph="detail">
        <div className="lg-detail-empty">
          <div className="lg-detail-empty-title">还没有选中文献</div>
          <div className="lg-detail-empty-hint">在星图上点一个节点，或从右侧论文库挑一篇，这里会显示作者、摘要和 AI 理解结果。</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={'lg-detail lg-scroll ' + (readState ? 'is-read' : 'is-unread')}
      data-litgraph="detail"
    >
      <div className="lg-detail-eyebrow">
        <span className="lg-detail-dot" style={{ background: clusterColor }} />
        <span>文献详情</span>
        <span className="lg-detail-year">{detail.year ?? '年份未知'}</span>
        <span
          className={'lgf-read-pill is-' + (readState ? 'read' : 'unread')}
          title={readState ? 'Zotero 有阅读记录：' + formatUnix(readAt) : 'Zotero 里还没有阅读记录'}
        >
          <span className="lgf-read-icon" aria-hidden="true">
            {readState ? '✓' : '!'}
          </span>
          {readState ? '已读' : '未读'}
        </span>
      </div>
      <h2 className="lg-detail-title">{detail.title}</h2>
      <div className="lg-detail-sub">
        {detail.authors.length > 0 ? detail.authors.join('、') : '作者未知'}
        {detail.venue ? ' · ' + detail.venue : ''}
      </div>

      <div className="lg-detail-chips">
        {detail.status === 'processing' ? <span className="lg-chip lg-chip-warn">{STATUS_LABEL.processing}</span> : null}
        {detail.status === 'failed' ? <span className="lg-chip lg-chip-danger">{STATUS_LABEL.failed}</span> : null}
        {cluster ? (
          <span className="lg-chip lg-chip-cluster" style={{ borderColor: clusterColor, color: clusterColor }}>
            {detail.clusterLabel || cluster.label}
          </span>
        ) : null}
        {typeof detail.degree === 'number' ? <span className="lg-chip">图中关联 {detail.degree}</span> : null}
      </div>

      <div className="lg-detail-actions">
        <div className="lgf-rating" role="group" aria-label="文献评分">
          {RATING_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              className={'lgf-rating-btn' + (value <= rating ? ' is-on' : '')}
              disabled={ratingBusy}
              aria-label={value + ' 星'}
              aria-pressed={value <= rating}
              title={value === rating ? '再次点击清除评分' : '评 ' + value + ' 星'}
              onClick={() => void rate(value)}
            >
              {value <= rating ? '★' : '☆'}
            </button>
          ))}
          <span className="lgf-rating-label">{rating > 0 ? rating + ' 星' : '未评分'}</span>
        </div>
        <button type="button" className="lg-btn lg-btn-primary" disabled={!detail.hasFile} onClick={() => onOpenFile(detail.id)}>
          <ExternalIcon size={12} /> 打开原文
        </button>
        <button type="button" className="lg-btn" onClick={() => onLocate(detail.id)}>
          <LocateIcon size={12} /> 图谱中定位
        </button>
        <button type="button" className="lg-btn lg-btn-danger" disabled={deleting} onClick={() => onDelete(detail.id, detail.title)}>
          <TrashIcon size={12} /> {deleting ? '删除中…' : '删除'}
        </button>
      </div>

      <section className="lg-detail-section">
        <div className="lgf-section-head">
          <h3>笔记</h3>
          <SaveIndicator state={saveState} error={saveError} onRetry={() => void saveNotes(detail.id, notesDraft)} />
        </div>
        <textarea
          className="lgf-textarea"
          value={notesDraft}
          maxLength={NOTES_MAX}
          rows={4}
          placeholder="写下想法、复现要点或待读问题… 输入后自动保存"
          aria-label="笔记"
          onChange={(event) => setNotesDraft(event.target.value)}
          onBlur={flushNotes}
        />
        {saveState === 'error' && saveError ? (
          <div className="lgf-hint is-error">{saveError}</div>
        ) : (
          <div className="lgf-hint">{notesDraft.length > 0 ? notesDraft.length + ' / ' + NOTES_MAX + ' 字' : '输入后 0.8 秒自动保存'}</div>
        )}
      </section>

      <section className="lg-detail-section">
        <div className="lgf-section-head">
          <h3>标签</h3>
          {tags.length > 0 ? (
            <span className="lgf-save-state">
              {tags.length} / {TAGS_MAX}
            </span>
          ) : null}
        </div>
        <div className="lgf-tag-editor">
          {tags.map((tag) => (
            <span className="lgf-tag" key={tag}>
              {onTagFilter ? (
                <button
                  type="button"
                  className="lgf-tag-label"
                  title={'按标签筛选：' + tag}
                  onClick={() => onTagFilter(tag)}
                >
                  {tag}
                </button>
              ) : (
                <span className="lgf-tag-label" title={tag}>
                  {tag}
                </span>
              )}
              <button
                type="button"
                className="lgf-tag-x"
                aria-label={'删除标签 ' + tag}
                title="删除标签"
                disabled={tagsSaving}
                onClick={() => removeTag(tag)}
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="lgf-tag-input"
            value={tagDraft}
            maxLength={TAG_LEN_MAX}
            disabled={tagsSaving || tags.length >= TAGS_MAX}
            placeholder={tags.length === 0 ? '输入标签，回车添加' : tags.length >= TAGS_MAX ? '标签已满' : '继续添加…'}
            aria-label="添加标签"
            onChange={(event) => {
              setTagDraft(event.target.value)
              if (tagHint) setTagHint(null)
            }}
            onBlur={() => {
              if (tagDraft.trim()) addTag(tagDraft)
            }}
            onKeyDown={(event) => {
              if ((event.nativeEvent as { isComposing?: boolean }).isComposing) return
              if (event.key === 'Enter' || event.key === ',' || event.key === '，' || event.key === '、' || event.key === ';' || event.key === '；') {
                event.preventDefault()
                addTag(tagDraft)
                return
              }
              if (event.key === 'Backspace' && tagDraft === '' && tags.length > 0) {
                event.preventDefault()
                removeTag(tags[tags.length - 1])
              }
            }}
          />
        </div>
        {tagHint ? <div className="lgf-hint is-error">{tagHint}</div> : <div className="lgf-hint">回车添加、点 × 删除；点击标签可按它筛选论文库</div>}
      </section>

      <section className="lg-detail-section lgf-zotero">
        <div className="lgf-section-head">
          <h3>Zotero</h3>
          <span className="lgf-zotero-status">
            {zoteroState === null
              ? '检测中…'
              : zoteroState.available
                ? '已连接 ' + zoteroState.version
                : '未连接'}
          </span>
        </div>
        {zoteroRef === undefined ? (
          <>
            <div className="lgf-hint">这篇还没有匹配到 Zotero 条目。匹配后可以在这里直接改 Zotero 分类，打开原文也会经 Zotero 记录最后阅读时间。</div>
            <div className="lgf-zotero-actions">
              <button type="button" className="lgf-zotero-btn" disabled={zoteroBusy} onClick={() => void syncZoteroLink()}>
                {zoteroBusy ? '同步中…' : '同步 Zotero'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="lgf-zotero-meta">
              <span>条目 {zoteroRef.key}</span>
              <span>{zoteroRef.lastRead ? '最后阅读 ' + formatUnix(zoteroRef.lastRead) : '还没有阅读记录'}</span>
            </div>
            <div className="lgf-zotero-chips">
              {(zoteroRef.collections ?? []).length === 0 ? (
                <span className="lgf-hint">未归入任何分类</span>
              ) : null}
              {(zoteroRef.collections ?? []).map((key) => (
                <span key={key} className="lgf-zotero-chip">
                  {collectionName(zoteroState, key)}
                </span>
              ))}
            </div>
            {collectionEditing ? (
              <>
                <div className="lgf-zotero-list">
                  {(zoteroState?.collections ?? []).length === 0 ? (
                    <div className="lgf-hint">Zotero 里还没有分类（先在 Zotero 新建分类再同步）</div>
                  ) : null}
                  {(zoteroState?.collections ?? []).map((collection) => (
                    <label key={collection.key} className="lgf-zotero-option">
                      <input
                        type="checkbox"
                        checked={collectionDraft.includes(collection.key)}
                        onChange={() => toggleCollectionDraft(collection.key)}
                      />
                      <span>{collection.name}</span>
                    </label>
                  ))}
                </div>
                <div className="lgf-zotero-actions">
                  <button type="button" className="lgf-zotero-btn is-primary" disabled={zoteroBusy} onClick={() => void saveCollections()}>
                    {zoteroBusy ? '保存中…' : '保存分类'}
                  </button>
                  <button
                    type="button"
                    className="lgf-zotero-btn"
                    disabled={zoteroBusy}
                    onClick={() => {
                      setCollectionEditing(false)
                      setZoteroHint(null)
                    }}
                  >
                    取消
                  </button>
                  {zoteroState !== null && !zoteroState.authorized ? (
                    <button type="button" className="lgf-zotero-btn" disabled={zoteroBusy} onClick={() => void authorizeZoteroWrite()}>
                      授权 Zotero
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="lgf-zotero-actions">
                <button type="button" className="lgf-zotero-btn" disabled={zoteroBusy} onClick={startCollectionEdit}>
                  编辑分类
                </button>
                <button type="button" className="lgf-zotero-btn" disabled={zoteroBusy} onClick={() => void syncZoteroLink()}>
                  {zoteroBusy ? '同步中…' : '重新同步'}
                </button>
                {zoteroState !== null && !zoteroState.authorized ? (
                  <button type="button" className="lgf-zotero-btn" disabled={zoteroBusy} onClick={() => void authorizeZoteroWrite()}>
                    授权 Zotero
                  </button>
                ) : null}
              </div>
            )}
            {zoteroHint ? (
              <div className="lgf-hint is-error">{zoteroHint}</div>
            ) : (
              <div className="lgf-hint">分类改动会直接写回 Zotero；打开原文会经 Zotero 并记录最后阅读时间。</div>
            )}
          </>
        )}
      </section>
      <section className="lg-detail-section lgf-metrics">
        <div className="lgf-section-head">
          <h3>期刊指标</h3>
          {metrics ? <span className="lgf-metrics-source">EasyScholar</span> : null}
        </div>
        {metrics ? (
          <>
            <dl className="lgf-metrics-grid">
              <div className="lgf-metric">
                <dt>影响因子</dt>
                <dd className="lgf-metric-value">{formatMetric(metrics.impactFactor)}</dd>
              </div>
              <div className="lgf-metric">
                <dt>5 年 IF</dt>
                <dd className="lgf-metric-value">{formatMetric(metrics.impactFactor5)}</dd>
              </div>
              <div className="lgf-metric">
                <dt>JCR 分区</dt>
                <dd>{metrics.jcrQuartile || '—'}</dd>
              </div>
              <div className="lgf-metric">
                <dt>中科院分区</dt>
                <dd>
                  {metrics.casPartition || '—'}
                  {metrics.casTop ? <span className="lgf-metrics-top">TOP</span> : null}
                  {metrics.casSmall ? <span className="lgf-metric-sub">小类 {metrics.casSmall}</span> : null}
                </dd>
              </div>
              <div className="lgf-metric">
                <dt>ESI</dt>
                <dd>{metrics.esi || '—'}</dd>
              </div>
            </dl>
            <div className="lgf-hint">数据来自 EasyScholar · 查询于 {formatTime(metrics.fetchedAt)}</div>
            <button type="button" className="lgf-metrics-query" disabled={metricsBusy} onClick={() => void queryMetrics()}>
              {metricsBusy ? '查询中…' : '重新查询指标'}
            </button>
          </>
        ) : (
          <>
            <div className="lgf-hint">{metricsHint ?? '还没有查询这篇文献的期刊指标（影响因子、JCR / 中科院分区、ESI）。'}</div>
            <button type="button" className="lgf-metrics-query" disabled={metricsBusy} onClick={() => void queryMetrics()}>
              {metricsBusy ? '查询中…' : '查询指标'}
            </button>
          </>
        )}
      </section>

      {detail.parseNote ? (
        <div className="lg-detail-note">
          <InfoIcon size={13} /> {detail.parseNote}
        </div>
      ) : null}

      {detail.abstract ? (
        <section className="lg-detail-section">
          <h3>摘要</h3>
          <p className="lg-detail-prose">{detail.abstract}</p>
        </section>
      ) : null}

      {detail.summary ? (
        <section className="lg-detail-section">
          <h3>AI 总结</h3>
          <p className="lg-detail-prose">{detail.summary}</p>
        </section>
      ) : null}

      {detail.contributions.length > 0 ? (
        <section className="lg-detail-section">
          <h3>主要贡献</h3>
          <ul className="lg-detail-bullets">
            {detail.contributions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {detail.method ? (
        <section className="lg-detail-section">
          <h3>方法</h3>
          <p className="lg-detail-prose">{detail.method}</p>
        </section>
      ) : null}

      {detail.keywords.length > 0 ? (
        <section className="lg-detail-section">
          <h3>关键词</h3>
          <div className="lg-detail-chips">
            {detail.keywords.map((keyword) => (
              <span key={keyword} className="lg-chip">
                {keyword}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="lg-detail-section">
        <h3>来源</h3>
        <dl className="lg-meta-grid">
          <dt>文件名</dt>
          <dd title={detail.fileName}>{detail.fileName || '—'}</dd>
          <dt>文件大小</dt>
          <dd>{detail.size > 0 ? formatSize(detail.size) : '—'}</dd>
          <dt>导入时间</dt>
          <dd>{formatTime(detail.addedAt)}</dd>
          <dt>最近更新</dt>
          <dd>{formatTime(detail.updatedAt)}</dd>
        </dl>
      </section>
    </div>
  )
}

function SaveIndicator(props: { state: SaveState; error: string | null; onRetry: () => void }) {
  const { state, error, onRetry } = props
  if (state === 'idle') return null
  const label = state === 'pending' ? '未保存' : state === 'saving' ? '保存中…' : state === 'saved' ? '已保存' : '保存失败'
  return (
    <span className="lgf-save-state" data-state={state} title={state === 'error' && error ? error : label}>
      {state === 'error' ? (
        <>
          {label}
          <button type="button" className="lgf-save-retry" onClick={onRetry}>
            重试
          </button>
        </>
      ) : (
        label
      )}
    </span>
  )
}

function DetailSkeleton() {
  return (
    <div className="lg-detail-skeleton" aria-label="加载中">
      <div className="lg-skeleton lg-skeleton-eyebrow" />
      <div className="lg-skeleton lg-skeleton-title" />
      <div className="lg-skeleton lg-skeleton-title lg-skeleton-title-short" />
      <div className="lg-skeleton lg-skeleton-line" />
      <div className="lg-skeleton lg-skeleton-line" />
      <div className="lg-skeleton lg-skeleton-line lg-skeleton-line-short" />
      <div className="lg-skeleton lg-skeleton-block" />
    </div>
  )
}

/** 0..5 star rating, tolerating hosts that only know the legacy starred flag. */
function readRating(paper: { rating?: number; starred?: boolean } | null | undefined): number {
  if (!paper) return 0
  const raw = typeof paper.rating === 'number' ? paper.rating : paper.starred === true ? 1 : 0
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(5, Math.round(raw)))
}

/** One-decimal metric value; null / missing / non-positive renders as an em dash. */
function formatMetric(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function describeError(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message
  return '网络错误，请重试'
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

/** Unix seconds -> local date-time label for the Zotero last-read chip. */
function formatUnix(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  try {
    return new Date(seconds * 1000).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return '—'
  }
}

/** Collection key -> display name, falling back to the key when Zotero is unavailable. */
function collectionName(state: ZoteroState | null, key: string): string {
  if (state === null) return key
  const found = state.collections.find((collection) => collection.key === key)
  return found === undefined ? key : found.name
}
function formatTime(value: string): string {
  if (!value) return '—'
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return value
  }
}
