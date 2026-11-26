/** Right column: sortable, paginated, cluster-filtered library list. */
import * as React from 'react'
import type { Cluster, PapersPage, PaperListItem, PaperDetail, OcrEngine, SortKey, SortOrder, TaxonomyMode } from '../types'
import { OCR_ENGINE_OPTIONS, SORT_OPTIONS, STATUS_LABEL, TAXONOMY_MODE_OPTIONS } from '../types'
import { deletePaper, fetchAllPapers, fetchPaperDetails, fetchSettings, saveSettings, updatePaper } from '../api'
import { buildBibtex, downloadBibtexFile, BIBTEX_FILENAME, type BibtexPaper } from '../bibtex'
import { ensureFeatureStyles } from '../styles-features'
import { ChevronIcon, SortIcon, SearchIcon } from './icons'

ensureFeatureStyles()

export type ToastKind = 'success' | 'error' | 'info'

type RowPatch = { starred?: boolean; rating?: number; tags?: string[] }

type ClusterLevel = 1 | 2 | 3

const CLUSTER_LEVEL_OPTIONS: Array<{ value: ClusterLevel; label: string; hint: string }> = [
  { value: 1, label: '一级 · 宽学科', hint: '按大类分星座，例如 机械工程 / 人工智能，适合总览' },
  { value: 2, label: '二级 · 子领域（推荐）', hint: '按子领域分星座，例如 机械工程 > 故障诊断，兼顾总览与区分度' },
  { value: 3, label: '三级 · 具体主题', hint: '按更细主题分星座，星座最多，适合精读与查找' },
]
type Notice = { kind: ToastKind; message: string; at: number }

export interface LibraryPanelProps {
  clusters: Cluster[]
  activeCluster: string
  sort: SortKey
  order: SortOrder
  pageData: PapersPage | null
  loading: boolean
  error: string | null
  selectedId: string | null
  onCluster: (cluster: string) => void
  onSort: (sort: SortKey) => void
  onOrder: (order: SortOrder) => void
  onPage: (page: number) => void
  onSelect: (id: string) => void
  onRetry: () => void
  onImportClick: () => void
  /** Controlled "starred only" filter (host-side query). Omit to filter the current page locally. */
  starredOnly?: boolean
  onStarredOnly?: (value: boolean) => void
  /** Called after the graph cluster granularity changed, so the owner can reload the graph. */
  onClusterLevelChanged?: () => void
  /** Controlled tag filter (host-side, exact tag match). Omit to filter the current page locally. */
  activeTag?: string | null
  onTag?: (tag: string | null) => void
  /** Controlled "minimum rating" filter (host-side query minRating). Omit to filter the current page locally. */
  minRating?: number | null
  onMinRating?: (value: number | null) => void
  /** Current search text; only used by "导出当前筛选结果". */
  query?: string
  /** Host-provided toast; a local banner is used when omitted. */
  onToast?: (kind: ToastKind, message: string) => void
  /** Fired after a row star toggle so the workbench can refresh shared state. */
  onPaperPatched?: (paper: PaperDetail) => void
  /** Fired after a batch delete so the workbench can refresh graph/list/status. */
  onBatchDeleted?: (ids: string[]) => void
}

export function LibraryPanel(props: LibraryPanelProps) {
  const {
    clusters,
    activeCluster,
    sort,
    order,
    pageData,
    loading,
    error,
    selectedId,
    onCluster,
    onSort,
    onOrder,
    onPage,
    onSelect,
    onRetry,
    onImportClick,
    starredOnly,
    onStarredOnly,
    activeTag,
    onTag,
    minRating,
    onMinRating,
    query,
    onToast,
    onPaperPatched,
    onBatchDeleted,
    onClusterLevelChanged,
  } = props

  const items = pageData ? pageData.items : []
  const total = pageData ? pageData.total : 0
  const pageSize = pageData ? pageData.pageSize : 20
  const page = pageData ? pageData.page : 1
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))

  // Filters are controlled by the workbench when the host-side query props exist,
  // otherwise we fall back to filtering the currently loaded page.
  const starredLocal = starredOnly === undefined
  const tagLocal = activeTag === undefined
  const ratingLocal = minRating === undefined
  const [localStarred, setLocalStarred] = React.useState(false)
  const [localTag, setLocalTag] = React.useState<string | null>(null)
  const [localMinRating, setLocalMinRating] = React.useState<number | null>(null)
  const resolvedStarred = starredOnly === undefined ? localStarred : starredOnly
  const resolvedTag = activeTag === undefined ? localTag : activeTag
  const resolvedMinRating = minRating === undefined ? localMinRating : minRating

  const [localPatch, setLocalPatch] = React.useState<Record<string, RowPatch>>({})
  const [starBusyId, setStarBusyId] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [exportProgress, setExportProgress] = React.useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [settingsMode, setSettingsMode] = React.useState<TaxonomyMode | null>(null)
  const [settingsLoading, setSettingsLoading] = React.useState(false)
  const [settingsError, setSettingsError] = React.useState<string | null>(null)
  const [settingsSaving, setSettingsSaving] = React.useState<TaxonomyMode | null>(null)
  const [settingsEngine, setSettingsEngine] = React.useState<OcrEngine | null>(null)
  const [engineSaving, setEngineSaving] = React.useState<OcrEngine | null>(null)
  const [settingsCluster, setSettingsCluster] = React.useState<ClusterLevel | null>(null)
  const [clusterSaving, setClusterSaving] = React.useState<ClusterLevel | null>(null)
  const exportWrapRef = React.useRef<HTMLDivElement | null>(null)

  // ---- batch selection ------------------------------------------------------
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [selectAllBusy, setSelectAllBusy] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const filterRowRef = React.useRef<HTMLDivElement | null>(null)
  const checkAllRef = React.useRef<HTMLInputElement | null>(null)

  // Vertical wheel scrolls the (single-row) cluster filter chips horizontally.
  React.useEffect(() => {
    const el = filterRowRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      const before = el.scrollLeft
      el.scrollLeft = before + event.deltaY
      if (el.scrollLeft !== before) event.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const notify = React.useCallback(
    (kind: ToastKind, message: string) => {
      setNotice({ kind, message, at: Date.now() })
      onToast?.(kind, message)
    },
    [onToast],
  )

  React.useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => {
      setNotice((current) => (current === notice ? null : current))
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const patchOf = React.useCallback(
    (item: PaperListItem): PaperListItem => {
      const patch = localPatch[item.id]
      return patch ? ({ ...item, ...patch } as PaperListItem) : item
    },
    [localPatch],
  )

  const visibleItems = React.useMemo(() => {
    const filterStar = starredLocal && resolvedStarred
    const filterTag = tagLocal && resolvedTag !== null
    const minR = typeof resolvedMinRating === 'number' && resolvedMinRating >= 1 ? resolvedMinRating : 0
    let list = items
    if (filterStar || filterTag || minR > 0) {
      list = items.filter((raw) => {
        const item = patchOf(raw)
        if (filterStar && item.starred !== true) return false
        if (filterTag && resolvedTag) {
          const tags = item.tags ?? []
          if (!tags.some((tag) => tag.toLowerCase() === resolvedTag.toLowerCase())) return false
        }
        if (minR > 0 && readRating(item) < minR) return false
        return true
      })
    }
    // Hosts that predate ratings ignore sort=rating, so re-sort the visible page
    // locally (highest rating first, then most recently updated).
    if (sort === 'rating' && list.length > 1) {
      list = list.slice().sort((a, b) => {
        const diff = readRating(patchOf(b)) - readRating(patchOf(a))
        if (diff !== 0) return diff
        return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
      })
    }
    return list
  }, [items, starredLocal, tagLocal, resolvedStarred, resolvedTag, resolvedMinRating, patchOf, sort])

  // ---- selection derived state / actions ------------------------------------
  const itemIds = React.useMemo(() => visibleItems.map((item) => item.id), [visibleItems])
  const pageAllSelected = itemIds.length > 0 && itemIds.every((id) => selected.has(id))
  const pageSomeSelected = !pageAllSelected && itemIds.some((id) => selected.has(id))
  const selectedCount = selected.size

  React.useEffect(() => {
    const el = checkAllRef.current
    if (el) el.indeterminate = pageSomeSelected
  }, [pageSomeSelected])

  const toggleOne = React.useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const togglePageAll = () => {
    setSelected((current) => {
      const next = new Set(current)
      if (pageAllSelected) for (const id of itemIds) next.delete(id)
      else for (const id of itemIds) next.add(id)
      return next
    })
  }

  const selectAllFiltered = async () => {
    if (selectAllBusy) return
    setSelectAllBusy(true)
    try {
      const all = await fetchAllPapers({
        sort,
        order,
        q: query ?? '',
        cluster: activeCluster,
        tag: resolvedTag ?? undefined,
        starred: resolvedStarred || undefined,
        minRating: typeof resolvedMinRating === 'number' ? resolvedMinRating : undefined,
      })
      setSelected(new Set(all.map((item) => item.id)))
    } catch (caught) {
      notify('error', '全选失败：' + describeError(caught))
    } finally {
      setSelectAllBusy(false)
    }
  }

  const clearSelection = () => setSelected(new Set())

  const deleteSelected = async () => {
    if (bulkBusy || selected.size === 0) return
    const ids = Array.from(selected)
    if (typeof window !== 'undefined' && !window.confirm('确定删除选中的 ' + ids.length + ' 篇文献？这会同时从图谱中移除，且不可撤销。')) {
      return
    }
    setBulkBusy(true)
    const deleted: string[] = []
    const failed: string[] = []
    const queue = ids.slice()
    const worker = async () => {
      for (;;) {
        const id = queue.shift()
        if (id === undefined) return
        try {
          await deletePaper(id)
          deleted.push(id)
        } catch {
          failed.push(id)
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, () => worker()))
    } finally {
      setBulkBusy(false)
    }
    setSelected(new Set(failed))
    if (deleted.length > 0) onBatchDeleted?.(deleted)
    if (failed.length > 0) notify('error', '已删除 ' + deleted.length + ' 篇，' + failed.length + ' 篇删除失败')
    else notify('success', '已删除 ' + deleted.length + ' 篇文献')
  }

  const setStarredFilter = (value: boolean) => {
    if (onStarredOnly) onStarredOnly(value)
    else setLocalStarred(value)
  }

  const setTagFilter = (tag: string | null) => {
    if (onTag) onTag(tag)
    else setLocalTag(tag)
  }

  const setMinRatingFilter = (value: number | null) => {
    if (!ratingLocal && onMinRating) onMinRating(value)
    else setLocalMinRating(value)
  }

  // Close the export dropdown on outside click / Escape.
  React.useEffect(() => {
    if (!exportOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (exportWrapRef.current && !exportWrapRef.current.contains(event.target as Node)) setExportOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [exportOpen])

  React.useEffect(() => {
    if (!settingsOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && settingsSaving === null && engineSaving === null && clusterSaving === null) setSettingsOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen, settingsSaving, engineSaving, clusterSaving])

  const openSettings = () => {
    setSettingsOpen(true)
    setSettingsMode(null)
    setSettingsEngine(null)
    setSettingsCluster(null)
    setSettingsError(null)
    setSettingsLoading(true)
    fetchSettings()
      .then((payload) => {
        setSettingsMode(payload.settings.taxonomyMode)
        setSettingsEngine(payload.settings.ocrEngine ?? 'auto')
        const level = payload.settings.clusterLevel
        setSettingsCluster(level === 1 || level === 3 ? level : 2)
      })
      .catch((caught) => setSettingsError(describeError(caught)))
      .finally(() => setSettingsLoading(false))
  }

  const chooseMode = async (mode: TaxonomyMode) => {
    if (settingsSaving !== null || settingsMode === mode) return
    const previous = settingsMode
    setSettingsMode(mode)
    setSettingsError(null)
    setSettingsSaving(mode)
    try {
      const payload = await saveSettings({ taxonomyMode: mode })
      setSettingsMode(payload.settings.taxonomyMode)
      notify('success', '分类体系已切换为「' + labelOfTaxonomy(payload.settings.taxonomyMode) + '」')
    } catch (caught) {
      setSettingsMode(previous)
      setSettingsError('保存失败：' + describeError(caught))
    } finally {
      setSettingsSaving(null)
    }
  }

  const chooseEngine = async (engine: OcrEngine) => {
    if (engineSaving !== null || settingsEngine === engine) return
    const previous = settingsEngine
    setSettingsEngine(engine)
    setSettingsError(null)
    setEngineSaving(engine)
    try {
      const payload = await saveSettings({ ocrEngine: engine })
      setSettingsEngine(payload.settings.ocrEngine ?? engine)
      notify('success', '扫描件 OCR 已切换为「' + labelOfEngine(payload.settings.ocrEngine ?? engine) + '」')
    } catch (caught) {
      setSettingsEngine(previous)
      setSettingsError('保存失败：' + describeError(caught))
    } finally {
      setEngineSaving(null)
    }
  }

  const chooseClusterLevel = async (level: ClusterLevel) => {
    if (clusterSaving !== null || settingsCluster === level) return
    const previous = settingsCluster
    setSettingsCluster(level)
    setSettingsError(null)
    setClusterSaving(level)
    try {
      const payload = await saveSettings({ clusterLevel: level })
      const saved = payload.settings.clusterLevel
      setSettingsCluster(saved === 1 || saved === 3 ? saved : 2)
      notify('success', '图谱聚类粒度已切换为「' + labelOfClusterLevel(saved === 1 || saved === 3 ? saved : 2) + '」')
      onClusterLevelChanged?.()
    } catch (caught) {
      setSettingsCluster(previous)
      setSettingsError('保存失败：' + describeError(caught))
    } finally {
      setClusterSaving(null)
    }
  }

  // The row star stays a quick 0/1 shortcut: starring files the paper under one
  // star (keeping a higher existing rating), un-starring clears the rating.
  const toggleRowStar = async (item: PaperListItem) => {
    if (starBusyId !== null) return
    const effective = patchOf(item)
    const currentRating = readRating(effective)
    const next = effective.starred !== true
    const nextRating = next ? Math.max(1, currentRating) : 0
    setLocalPatch((current) => ({ ...current, [item.id]: { ...current[item.id], starred: next, rating: nextRating } }))
    setStarBusyId(item.id)
    try {
      const result = await updatePaper(item.id, { starred: next, rating: nextRating })
      setLocalPatch((current) => ({
        ...current,
        [item.id]: { starred: result.paper.starred === true, rating: readRating(result.paper), tags: result.paper.tags },
      }))
      onPaperPatched?.(result.paper)
      notify('success', next ? '已加入星标' : '已取消星标')
    } catch (caught) {
      setLocalPatch((current) => {
        const copy = { ...current }
        const entry = { ...copy[item.id] }
        delete entry.starred
        delete entry.rating
        if (Object.keys(entry).length === 0) delete copy[item.id]
        else copy[item.id] = entry
        return copy
      })
      notify('error', '星标更新失败：' + describeError(caught))
    } finally {
      setStarBusyId(null)
    }
  }

  const runExport = async (mode: 'all' | 'filtered') => {
    setExportOpen(false)
    if (exporting) return
    setExporting(true)
    setExportProgress('准备导出…')
    try {
      const filters =
        mode === 'filtered'
          ? {
              cluster: activeCluster || undefined,
              tag: resolvedTag ?? undefined,
              starred: resolvedStarred ? true : undefined,
              minRating: typeof resolvedMinRating === 'number' ? resolvedMinRating : undefined,
              q: query && query.trim() ? query.trim() : undefined,
            }
          : {}
      const papers = await fetchAllPapers(filters, (fetched, all) => {
        setExportProgress('读取文献列表 ' + fetched + '/' + all)
      })
      if (papers.length === 0) {
        notify('info', '当前筛选下没有可导出的文献')
        return
      }
      setExportProgress('加载详情 0/' + papers.length)
      const details = await fetchPaperDetails(
        papers.map((paper) => paper.id),
        {
          concurrency: 6,
          onProgress: (done, all) => setExportProgress('加载详情 ' + done + '/' + all),
        },
      )
      const detailById = new Map(details.map((detail) => [detail.id, detail]))
      const entries: BibtexPaper[] = papers.map((paper) => {
        const detail = detailById.get(paper.id)
        return {
          id: paper.id,
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          venue: paper.venue,
          abstract: detail ? detail.abstract : '',
          keywords: detail ? detail.keywords : [],
          fileName: paper.fileName,
          tags: paper.tags ?? [],
        }
      })
      const content = buildBibtex(entries)
      if (!downloadBibtexFile(content)) {
        notify('error', '当前环境不支持文件下载')
        return
      }
      notify('success', '已导出 ' + entries.length + ' 篇文献（' + BIBTEX_FILENAME + '）')
    } catch (caught) {
      notify('error', '导出失败：' + describeError(caught))
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  const secondaryText = loading && !pageData ? '加载中…' : total === 0 ? '还没有文献' : '共 ' + total + ' 篇'

  return (
    <div className="lg-library" data-litgraph="library">
      <div className="lg-library-head">
        <div>
          <div className="lg-library-title">论文库</div>
          <div className="lg-library-sub">
            {secondaryText}
            {activeCluster ? ' · 已过滤' : ''}
            {resolvedStarred ? ' · 仅星标' : ''}
            {typeof resolvedMinRating === 'number' && resolvedMinRating > 0 ? ' · ≥' + resolvedMinRating + ' 星' : ''}
            {resolvedTag ? ' · 标签：' + resolvedTag : ''}
          </div>
        </div>
        <div className="lgf-head-actions">
          <div className="lgf-menu-wrap" ref={exportWrapRef}>
            <button
              type="button"
              className="lgf-tool-btn"
              title="导出 BibTeX"
              aria-label="导出 BibTeX"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              disabled={exporting}
              onClick={() => setExportOpen((open) => !open)}
            >
              {exporting ? '…' : '↓'}
            </button>
            {exportOpen ? (
              <div className="lgf-menu" role="menu" aria-label="导出 BibTeX">
                <div className="lgf-menu-note">BibTeX · 导出为 .bib 文件</div>
                <button
                  type="button"
                  role="menuitem"
                  className="lgf-menu-item"
                  disabled={exporting}
                  onClick={() => void runExport('all')}
                >
                  ↓ 导出全部文献
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="lgf-menu-item"
                  disabled={exporting}
                  onClick={() => void runExport('filtered')}
                >
                  ↓ 导出当前筛选结果
                  <small>{total} 篇</small>
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="lgf-tool-btn" title="设置" aria-label="设置" onClick={openSettings}>
            ⚙
          </button>
          <button
            type="button"
            className="lg-btn lg-btn-primary lg-btn-sm"
            style={{ marginLeft: 0 }}
            disabled={exporting}
            onClick={onImportClick}
          >
            导入
          </button>
        </div>
      </div>

      {exportProgress ? (
        <div className="lgf-notice" data-kind="info" role="status">
          {exportProgress}
        </div>
      ) : notice ? (
        <div className="lgf-notice" data-kind={notice.kind} role="status">
          {notice.message}
        </div>
      ) : null}

      <div className="lg-library-toolbar">
        <label className="lg-select-wrap">
          <select
            className="lg-select"
            value={sort}
            aria-label="排序字段"
            onChange={(event) => onSort(event.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="lg-icon-btn lg-order-btn"
          disabled={sort === 'rating'}
          title={sort === 'rating' ? '评分固定按高→低排序' : order === 'desc' ? '降序，点击切换' : '升序，点击切换'}
          aria-label="切换排序方向"
          onClick={() => onOrder(order === 'desc' ? 'asc' : 'desc')}
        >
          <SortIcon order={sort === 'rating' ? 'desc' : order} />
        </button>
        {sort === 'rating' ? <span className="lgf-sort-hint">当前页按评分排序</span> : null}
      </div>

      <div className="lg-filter-row lg-scroll-x" ref={filterRowRef}>
        <button
          type="button"
          className={'lg-filter-chip lgf-star-filter' + (resolvedStarred ? ' is-active' : '')}
          aria-pressed={resolvedStarred}
          title={resolvedStarred ? '显示全部文献' : '只看星标文献'}
          onClick={() => setStarredFilter(!resolvedStarred)}
        >
          ★ 仅星标
        </button>
        <button
          type="button"
          className={'lg-filter-chip lgf-rating-filter' + (resolvedMinRating === 4 ? ' is-active' : '')}
          aria-pressed={resolvedMinRating === 4}
          title={resolvedMinRating === 4 ? '显示全部评分' : '只看 4 星及以上'}
          onClick={() => setMinRatingFilter(resolvedMinRating === 4 ? null : 4)}
        >
          ≥4 星
        </button>
        {resolvedTag ? (
          <button
            type="button"
            className="lg-filter-chip is-active"
            title="清除标签筛选"
            onClick={() => setTagFilter(null)}
          >
            标签：{resolvedTag} ×
          </button>
        ) : null}
        {clusters.length > 0 ? (
          <>
            <span className="lgf-filter-label">聚类</span>
            <button
              type="button"
              className={'lg-filter-chip' + (activeCluster === '' ? ' is-active' : '')}
              onClick={() => onCluster('')}
            >
              全部
            </button>
            {clusters.map((cluster) => (
              <button
                key={cluster.id}
                type="button"
                className={'lg-filter-chip' + (activeCluster === cluster.id ? ' is-active' : '')}
                style={activeCluster === cluster.id ? { borderColor: cluster.color, color: cluster.color } : undefined}
                onClick={() => onCluster(activeCluster === cluster.id ? '' : cluster.id)}
              >
                <i style={{ background: cluster.color }} />
                {cluster.label}
              </button>
            ))}
          </>
        ) : null}
      </div>

      {visibleItems.length > 0 ? (
        <div className="lg-select-bar">
          <label className="lg-check">
            <input
              ref={checkAllRef}
              type="checkbox"
              checked={pageAllSelected}
              aria-label="全选本页"
              onChange={togglePageAll}
            />
            <span>{pageAllSelected ? '取消本页' : '全选本页'}</span>
          </label>
          {total > visibleItems.length ? (
            <button
              type="button"
              className="lg-select-all-btn"
              disabled={selectAllBusy || bulkBusy}
              onClick={() => void selectAllFiltered()}
            >
              {selectAllBusy ? '选取中…' : '全部 ' + total + ' 篇'}
            </button>
          ) : null}
          <span className="lg-select-gap" />
          {selectedCount > 0 ? (
            <>
              <span className="lg-select-count">已选 {selectedCount} 篇</span>
              <button
                type="button"
                className="lg-btn lg-btn-sm lg-btn-danger"
                disabled={bulkBusy}
                onClick={() => void deleteSelected()}
              >
                {bulkBusy ? '删除中…' : '删除所选'}
              </button>
              <button type="button" className="lg-btn lg-btn-sm lg-btn-ghost" disabled={bulkBusy} onClick={clearSelection}>
                取消
              </button>
            </>
          ) : (
            <span className="lg-select-hint">勾选后可批量删除</span>
          )}
        </div>
      ) : null}

      {error ? (
        <div className="lg-library-empty">
          <div>列表加载失败</div>
          <div className="lg-library-empty-hint">{error}</div>
          <button type="button" className="lg-btn lg-btn-ghost" onClick={onRetry}>
            重试
          </button>
        </div>
      ) : null}

      {!error && loading && !pageData ? <ListSkeleton /> : null}

      {!error && !loading && items.length === 0 ? (
        <div className="lg-library-empty">
          <SearchIcon size={22} />
          <div>
            {activeCluster
              ? '该聚类下还没有文献'
              : total === 0
                ? resolvedStarred
                  ? '还没有星标文献'
                  : '论文库是空的'
                : '没有匹配的文献'}
          </div>
          <div className="lg-library-empty-hint">
            {activeCluster
              ? '换个聚类，或把 PDF 拖进面板导入。'
              : resolvedStarred
                ? '在详情里点星星给文献评分，评分 ≥1 即视为星标。'
                : '把 PDF 拖进面板，AI 会自动理解并把它挂到星图上。'}
          </div>
        </div>
      ) : null}

      {!error && !loading && items.length > 0 && visibleItems.length === 0 ? (
        <div className="lg-library-empty">
          <SearchIcon size={22} />
          <div>当前筛选下没有文献</div>
          <div className="lg-library-empty-hint">关闭「仅星标」或清除标签筛选试试。</div>
        </div>
      ) : null}

      {visibleItems.length > 0 ? (
        <div className="lg-paper-list lg-scroll" role="list">
          {visibleItems.map((raw) => {
            const item = patchOf(raw)
            return (
              <PaperRow
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                checked={selected.has(item.id)}
                starBusy={starBusyId === item.id}
                onToggleCheck={toggleOne}
                onSelect={onSelect}
                onStarToggle={() => void toggleRowStar(raw)}
                onTagClick={setTagFilter}
                clusterColor={colorOf(clusters, item.clusterId)}
              />
            )
          })}
        </div>
      ) : null}

      {total > pageSize ? (
        <div className="lg-pagination">
          <button
            type="button"
            className="lg-page-btn"
            disabled={page <= 1}
            aria-label="上一页"
            onClick={() => onPage(page - 1)}
          >
            <ChevronIcon direction="left" size={13} />
          </button>
          {pageWindow(page, pageCount).map((value) => (
            <button
              key={value}
              type="button"
              className={'lg-page-btn' + (value === page ? ' is-active' : '')}
              onClick={() => onPage(value)}
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            className="lg-page-btn"
            disabled={page >= pageCount}
            aria-label="下一页"
            onClick={() => onPage(page + 1)}
          >
            <ChevronIcon direction="right" size={13} />
          </button>
          <span className="lg-page-info">
            {page}/{pageCount}
          </span>
        </div>
      ) : null}

      {settingsOpen ? (
        <div
          className="lgf-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && settingsSaving === null && engineSaving === null) setSettingsOpen(false)
          }}
        >
          <div className="lgf-modal" role="dialog" aria-modal="true" aria-labelledby="lgf-settings-title">
            <div className="lgf-modal-head">
              <div className="lgf-modal-title" id="lgf-settings-title">
                设置
              </div>
              <button
                type="button"
                className="lgf-modal-close"
                aria-label="关闭设置"
                disabled={settingsSaving !== null || engineSaving !== null}
                onClick={() => setSettingsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="lgf-modal-body">
              <div className="lgf-modal-section-title">分类体系</div>
              {settingsLoading ? <div className="lgf-modal-loading">正在读取设置…</div> : null}
              {settingsError && settingsMode === null ? (
                <div className="lgf-modal-error">
                  {settingsError}
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="lg-btn lg-btn-sm" onClick={openSettings}>
                      重试
                    </button>
                  </div>
                </div>
              ) : null}
              {settingsMode !== null
                ? TAXONOMY_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={settingsMode === option.value}
                      className={'lgf-radio-row' + (settingsMode === option.value ? ' is-active' : '')}
                      disabled={settingsSaving !== null || engineSaving !== null}
                      onClick={() => void chooseMode(option.value)}
                    >
                      <span className="lgf-radio-dot" />
                      <span className="lgf-radio-text">
                        <span className="lgf-radio-label">
                          {option.label}
                          {settingsSaving === option.value ? '（保存中…）' : ''}
                        </span>
                        <span className="lgf-radio-hint">{option.hint}</span>
                      </span>
                    </button>
                  ))
                : null}
              {settingsError && settingsMode !== null ? <div className="lgf-modal-error">{settingsError}</div> : null}
              <div className="lgf-modal-note">切换只影响之后导入的文献；已经入库文献的分类不会改变。</div>
              <div className="lgf-modal-section-title" style={{ marginTop: 18 }}>
                图谱聚类粒度
              </div>
              {settingsCluster !== null
                ? CLUSTER_LEVEL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={settingsCluster === option.value}
                      className={'lgf-radio-row' + (settingsCluster === option.value ? ' is-active' : '')}
                      disabled={settingsSaving !== null || engineSaving !== null || clusterSaving !== null}
                      onClick={() => void chooseClusterLevel(option.value)}
                    >
                      <span className="lgf-radio-dot" />
                      <span className="lgf-radio-text">
                        <span className="lgf-radio-label">
                          {option.label}
                          {clusterSaving === option.value ? '（保存中…）' : ''}
                        </span>
                        <span className="lgf-radio-hint">{option.hint}</span>
                      </span>
                    </button>
                  ))
                : null}
              <div className="lgf-modal-note">切换后星图会按新粒度重新聚类；论文本身的分类记录不变。</div>
              <div className="lgf-modal-section-title" style={{ marginTop: 18 }}>
                扫描件 OCR
              </div>
              {settingsEngine !== null
                ? OCR_ENGINE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={settingsEngine === option.value}
                      className={'lgf-radio-row' + (settingsEngine === option.value ? ' is-active' : '')}
                      disabled={engineSaving !== null || settingsSaving !== null}
                      onClick={() => void chooseEngine(option.value)}
                    >
                      <span className="lgf-radio-dot" />
                      <span className="lgf-radio-text">
                        <span className="lgf-radio-label">
                          {option.label}
                          {engineSaving === option.value ? '（保存中…）' : ''}
                        </span>
                        <span className="lgf-radio-hint">{option.hint}</span>
                      </span>
                    </button>
                  ))
                : null}
              <div className="lgf-modal-note">没有文本层的扫描版 PDF 才走 OCR；文本层 PDF 照旧直接解析。</div>
            </div>
            <div className="lgf-modal-foot">
              <button
                type="button"
                className="lg-btn"
                disabled={settingsSaving !== null || engineSaving !== null}
                onClick={() => setSettingsOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PaperRow(props: {
  item: PaperListItem
  selected: boolean
  checked: boolean
  clusterColor: string
  starBusy: boolean
  onSelect: (id: string) => void
  onStarToggle: () => void
  onTagClick: (tag: string) => void
  onToggleCheck: (id: string) => void
}) {
  const { item, selected, checked, clusterColor, starBusy, onSelect, onStarToggle, onTagClick, onToggleCheck } = props
  const tags = item.tags ?? []
  const shownTags = tags.slice(0, 3)
  const overflow = tags.length - shownTags.length
  const starred = item.starred === true
  const readState = typeof item.lastRead === 'number' && item.lastRead > 0
  const rating = readRating(item)
  const badges = metricsBadges(item)
  return (
    <div
      role="listitem"
      tabIndex={0}
      className={
        'lg-paper-row lgf-paper-row ' +
        (readState ? 'lgf-row-read' : 'lgf-row-unread') +
        (selected ? ' is-selected' : '')
      }
      onClick={() => onSelect(item.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(item.id)
        }
      }}
      title={item.title}
    >
      <span className="lgf-read-rail" aria-hidden="true" />
      <input
        type="checkbox"
        className="lg-row-check"
        checked={checked}
        aria-label={'选择《' + item.title + '》'}
        title={checked ? '取消选择' : '选择'}
        onClick={(event) => event.stopPropagation()}
        onChange={() => onToggleCheck(item.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
        }}
      />
      <span
        className={'lg-paper-dot' + (item.status === 'processing' ? ' is-processing' : '')}
        data-status={item.status}
        style={item.status === 'failed' ? undefined : { background: clusterColor }}
      />
      <span className="lg-paper-main">
        <span className="lg-paper-title">{item.title}</span>
        <span className="lg-paper-meta">
          <span>{item.year ?? '—'}</span>
          <span className="lg-paper-cat" style={{ color: clusterColor }}>
            {item.categories[0] || '未分类'}
          </span>
          <span className={'lg-paper-status is-' + item.status}>{STATUS_LABEL[item.status]}</span>
          <span
            className={'lgf-read-pill is-' + (readState ? 'read' : 'unread')}
            title={
              readState
                ? 'Zotero 有阅读记录：' + formatReadAt(item.lastRead)
                : 'Zotero 里还没有阅读记录'
            }
          >
            <span className="lgf-read-icon" aria-hidden="true">
              {readState ? '✓' : '!'}
            </span>
            {readState ? '已读' : '未读'}
          </span>
        </span>
        {tags.length > 0 ? (
          <span className="lgf-row-tags">
            {shownTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="lgf-row-tag"
                title={'按标签筛选：' + tag}
                onClick={(event) => {
                  event.stopPropagation()
                  onTagClick(tag)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
                }}
              >
                {tag}
              </button>
            ))}
            {overflow > 0 ? (
              <span className="lgf-row-tag is-more" title={tags.slice(3).join('、')}>
                +{overflow}
              </span>
            ) : null}
          </span>
        ) : null}
        {rating > 0 || badges.length > 0 ? (
          <span className="lgf-row-stats">
            {badges.length > 0 ? (
              <span className="lgf-row-metrics" title={badges.join(' · ')}>
                {badges.map((badge, index) => (
                  <span className="lgf-row-metric" key={badge + '#' + index}>
                    {badge}
                  </span>
                ))}
              </span>
            ) : null}
            {rating > 0 ? (
              <span className="lgf-row-rating" title={'评分 ' + rating + ' 星'} aria-label={'评分 ' + rating + ' 星'}>
                {ratingStars(rating)}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        className={'lgf-row-star' + (starred ? ' is-on' : '')}
        disabled={starBusy}
        aria-pressed={starred}
        aria-label={starred ? '取消星标' : '标记星标'}
        title={starred ? '取消星标' : '标记星标'}
        onClick={(event) => {
          event.stopPropagation()
          onStarToggle()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
        }}
      >
        {starred ? '★' : '☆'}
      </button>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="lg-paper-list" aria-label="加载中">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <div key={index} className="lg-skeleton lg-skeleton-row" />
      ))}
    </div>
  )
}

/** Unix seconds -> "2026/11/26 16:53" for the read-state tooltip. */
function formatReadAt(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '—'
  const date = new Date(seconds * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  )
}

/** 0..5 star rating, tolerating hosts that only know the legacy starred flag. */
function readRating(paper: { rating?: number; starred?: boolean } | null | undefined): number {
  if (!paper) return 0
  const raw = typeof paper.rating === 'number' ? paper.rating : paper.starred === true ? 1 : 0
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(5, Math.round(raw)))
}

/** "★★★☆☆" — filled stars for the rating, hollow for the rest. */
function ratingStars(rating: number): string {
  const value = Math.max(0, Math.min(5, Math.round(rating)))
  return '★'.repeat(value) + '☆'.repeat(5 - value)
}

/** Inline journal badges: "IF 7.8" / "Q1" / "工程技术1区 TOP". */
function metricsBadges(item: PaperListItem): string[] {
  const metrics = item.metrics
  if (!metrics) return []
  const badges: string[] = []
  const impact = metrics.impactFactor
  if (typeof impact === 'number' && Number.isFinite(impact) && impact > 0) {
    badges.push('IF ' + (Number.isInteger(impact) ? String(impact) : impact.toFixed(1)))
  }
  if (metrics.jcrQuartile) badges.push(metrics.jcrQuartile)
  if (metrics.casPartition) badges.push(metrics.casPartition + (metrics.casTop ? ' TOP' : ''))
  else if (metrics.casTop) badges.push('CAS TOP')
  if (badges.length === 0 && metrics.esi) badges.push(metrics.esi)
  return badges
}

function colorOf(clusters: Cluster[], clusterId: string): string {
  const found = clusters.find((cluster) => cluster.id === clusterId)
  return found ? found.color : '#7fd1ff'
}

function labelOfTaxonomy(mode: TaxonomyMode): string {
  const found = TAXONOMY_MODE_OPTIONS.find((option) => option.value === mode)
  return found ? found.label : mode
}

function labelOfEngine(engine: OcrEngine): string {
  const found = OCR_ENGINE_OPTIONS.find((option) => option.value === engine)
  return found ? found.label : engine
}

function labelOfClusterLevel(level: ClusterLevel): string {
  const found = CLUSTER_LEVEL_OPTIONS.find((option) => option.value === level)
  return found ? found.label : String(level)
}

function describeError(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message
  return '网络错误，请重试'
}

/** Windowed page numbers: first, last and up to five around the current page. */
function pageWindow(page: number, pageCount: number): number[] {
  const values: number[] = []
  const start = Math.max(1, Math.min(page - 2, pageCount - 4))
  const end = Math.min(pageCount, Math.max(page + 2, 5))
  for (let value = start; value <= end; value += 1) values.push(value)
  return values
}
