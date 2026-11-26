/**
 * The LitGraph workbench: one React tree that owns the whole main panel.
 *
 *   header     brand / search / host status
 *   columns    detail (left) · star map (center) · library (right)
 *   overlays   drop veil, import-job dock, toasts
 *
 * All data flows through the host's same-origin /api/litgraph/* routes.
 */
import * as React from 'react'
import {
  ApiError,
  deletePaper,
  fetchGraph,
  fetchJob,
  fetchPaper,
  fetchStatus,
  openPaper,
  formatBytes,
  isPdf,
  refreshMetrics,
  syncZotero,
  uploadPaper,
} from './api'
import { computeLayout, makeStars } from './layout/force'
import type { GraphPayload, ImportJob, PaperDetail, SortKey, SortOrder, StatusPayload } from './types'
import { PAGE_SIZE } from './types'
import { ensureStyles } from './styles'
import { StarMap } from './components/StarMap'
import { SearchBar } from './components/SearchBar'
import { DetailPanel } from './components/DetailPanel'
import { LibraryPanel } from './components/LibraryPanel'
import { TimelineView, buildTimelineNodes } from './components/TimelineView'
import { ZoteroImport } from './components/ZoteroImport'
import { Toasts } from './components/Toasts'
import type { ToastItem } from './components/Toasts'
import { ConstellationIcon, LayoutIcon, CloseIcon, ResetIcon } from './components/icons'
import {
  THEME_LABELS,
  cycleFontSize,
  cycleTheme,
  getThemeSnapshot,
  initTheme,
  registerThemeRoot,
  subscribeTheme,
} from './theme'
import type { ThemeMode } from './theme'
import { usePapers } from './hooks/usePapers'
import { ensureIntegrationStyles } from './styles-integration'

ensureIntegrationStyles()

const SEARCH_DEBOUNCE_MS = 180
const JOB_POLL_MS = 650
const MAX_MATCH_SUGGESTIONS = 8

interface FocusRequest {
  id: string
  token: number
}

let toastCounter = 0
/** One auto metrics backfill per plugin load (survives StrictMode remounts). */
let autoMetricsBootstrapped = false
/** One auto Zotero link sync per plugin load (matches existing papers to Zotero items). */
let autoZoteroSynced = false
function nextToastId(): string {
  toastCounter += 1
  return 'toast-' + toastCounter
}

export function Workbench() {
  // ---- graph -----------------------------------------------------------------
  const [graph, setGraph] = React.useState<GraphPayload | null>(null)
  const [graphLoading, setGraphLoading] = React.useState(true)
  const [graphError, setGraphError] = React.useState<string | null>(null)
  const [seed, setSeed] = React.useState<number>(11)
  const [status, setStatus] = React.useState<StatusPayload | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)

  // ---- search ----------------------------------------------------------------
  const [query, setQuery] = React.useState('')
  const [debouncedQuery, setDebouncedQuery] = React.useState('')

  // ---- selection -------------------------------------------------------------
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<PaperDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [detailError, setDetailError] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [focus, setFocus] = React.useState<FocusRequest | null>(null)

  // ---- library ---------------------------------------------------------------
  const [sort, setSort] = React.useState<SortKey>('updatedAt')
  const [order, setOrder] = React.useState<SortOrder>('desc')
  const [page, setPage] = React.useState(1)
  const [activeCluster, setActiveCluster] = React.useState('')
  const [activeTag, setActiveTag] = React.useState<string | null>(null)
  const [starredOnly, setStarredOnly] = React.useState(false)
  const [minRating, setMinRating] = React.useState<number | null>(null)

  // Cluster ids depend on the configured granularity; drop a stale filter when the
  // graph is rebuilt after switching 1/2/3 levels.
  React.useEffect(() => {
    if (!graph) return
    if (activeCluster !== '' && !graph.clusters.some((cluster) => cluster.id === activeCluster)) {
      setActiveCluster('')
      setPage(1)
    }
  }, [graph, activeCluster])

  // ---- center view (star map / year timeline) --------------------------------
  const [viewMode, setViewMode] = React.useState<'graph' | 'timeline'>('graph')
  const [zoteroOpen, setZoteroOpen] = React.useState(false)

  // ---- imports ---------------------------------------------------------------
  const [jobs, setJobs] = React.useState<ImportJob[]>([])
  const [toasts, setToasts] = React.useState<ToastItem[]>([])
  const [dragActive, setDragActive] = React.useState(false)
  const dragDepth = React.useRef(0)
  const timers = React.useRef<Set<number>>(new Set())
  const pollers = React.useRef<Map<string, number>>(new Map())
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  // ---- drawers for narrow containers ----------------------------------------
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [libraryOpen, setLibraryOpen] = React.useState(false)

  const cards = usePapers({
    sort,
    order,
    page,
    cluster: activeCluster,
    q: debouncedQuery,
    pageSize: PAGE_SIZE,
    refreshToken,
    tag: activeTag,
    starred: starredOnly,
    minRating,
  })

  const layout = React.useMemo(() => computeLayout({ nodes: graph ? graph.nodes : [], edges: graph ? graph.edges : [], clusters: graph ? graph.clusters : [], seed }), [graph, seed])
  const stars = React.useMemo(() => makeStars(seed, 150), [seed])
  const timelineNodes = React.useMemo(
    () => buildTimelineNodes(graph ? graph.nodes : [], graph ? graph.clusters : []),
    [graph],
  )

  const pushToast = React.useCallback((kind: ToastItem['kind'], message: string, ttl = 4200) => {
    const id = nextToastId()
    setToasts((current) => current.concat([{ id, kind, message }]).slice(-4))
    if (ttl > 0 && typeof window !== 'undefined') {
      const timer = window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id))
        timers.current.delete(timer)
      }, ttl)
      timers.current.add(timer)
    }
  }, [])

  // ---- style tag -------------------------------------------------------------
  React.useEffect(() => {
    const dispose = ensureStyles()
    return dispose
  }, [])

  // ---- theme + font-size preference ------------------------------------------
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const theme = React.useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeSnapshot)

  // watch the shell (skin/background swaps) while this panel is alive
  React.useEffect(() => initTheme(), [])

  // bind the store to the live root so data-lg-* / color-scheme follow every change
  React.useLayoutEffect(() => {
    registerThemeRoot(rootRef.current)
    return () => registerThemeRoot(null)
  }, [])

  // ---- debounce the search box ----------------------------------------------
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  // ---- graph + status --------------------------------------------------------
  const loadGraph = React.useCallback((signal?: AbortSignal) => {
    setGraphLoading(true)
    setGraphError(null)
    return fetchGraph(signal)
      .then((payload) => {
        setGraph(payload)
        setGraphLoading(false)
      })
      .catch((reason: any) => {
        if (reason && reason.name === 'AbortError') return
        setGraphError(messageOf(reason))
        setGraphLoading(false)
      })
  }, [])

  const loadStatus = React.useCallback((signal?: AbortSignal) => {
    fetchStatus(signal)
      .then((payload) => setStatus(payload))
      .catch(() => setStatus(null))
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    loadGraph(controller.signal)
    loadStatus(controller.signal)
    return () => controller.abort()
  }, [loadGraph, loadStatus, refreshToken])

  // ---- auto journal metrics --------------------------------------------------
  // Newly imported papers get their metrics queued by the host as soon as they
  // become ready; this one-shot call backfills the ones imported before the
  // metrics feature existed, so the user never has to click 查询指标 per paper.
  //
  // Module scope (not a component ref) so React 18 double-invoked effects in
  // dev/StrictMode cannot cancel the first request and then skip the retry.
  React.useEffect(() => {
    if (autoMetricsBootstrapped || typeof window === 'undefined') return
    autoMetricsBootstrapped = true
    void refreshMetrics()
      .then((result) => {
        if (result.queued <= 0) return
        // a single conference paper with no easyScholar entry would otherwise
        // pop the same notice on every reload: only speak up for real batches.
        if (result.queued >= 3) {
          pushToast('info', '正在后台自动查询 ' + result.queued + ' 篇文献的期刊指标…', 6000)
        }
        // the host serialises EasyScholar lookups (~550ms each): nudge the list
        // a few times so badges/partitions appear without a manual reload.
        for (const delay of [8000, 25000, 60000]) {
          const timer = window.setTimeout(() => setRefreshToken((token) => token + 1), delay)
          timers.current.add(timer)
        }
      })
      .catch(() => {
        // older hosts have no metrics routes: stay quiet
      })
  }, [pushToast])

  // ---- auto Zotero link sync ------------------------------------------------
  // Papers imported before the Zotero feature existed have no item key, so they
  // cannot record read time or show collections. Re-match them by title once per
  // load; the call is cheap and stays silent when Zotero is not running.
  React.useEffect(() => {
    if (autoZoteroSynced || typeof window === 'undefined') return
    autoZoteroSynced = true
    void syncZotero()
      .then((result) => {
        if (!result.ok) return
        if (result.updated !== undefined && result.updated > 0) setRefreshToken((token) => token + 1)
      })
      .catch(() => {
        // older hosts have no /zotero/sync route: stay quiet
      })
  }, [])

  // ---- detail ----------------------------------------------------------------
  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setDetailError(null)
      setDetailLoading(false)
      return
    }
    const controller = new AbortController()
    setDetailLoading(true)
    setDetailError(null)
    fetchPaper(selectedId, controller.signal)
      .then((payload) => {
        setDetail(payload)
        setDetailLoading(false)
      })
      .catch((reason: any) => {
        if (reason && reason.name === 'AbortError') return
        setDetailError(messageOf(reason))
        setDetailLoading(false)
      })
    return () => controller.abort()
  }, [selectedId, refreshToken])

  // keep the selection inside the graph
  React.useEffect(() => {
    if (!graph || !selectedId) return
    if (!graph.nodes.some((node) => node.id === selectedId)) {
      setSelectedId(null)
      setDetail(null)
    }
  }, [graph, selectedId])

  React.useEffect(() => {
    setPage(1)
  }, [debouncedQuery, activeCluster, activeTag, starredOnly, sort, order])

  // ---- cleanup ---------------------------------------------------------------
  React.useEffect(() => {
    return () => {
      for (const timer of timers.current) window.clearTimeout(timer)
      timers.current.clear()
      for (const timer of pollers.current.values()) window.clearTimeout(timer)
      pollers.current.clear()
    }
  }, [])

  // ---- search matches --------------------------------------------------------
  const matches = React.useMemo(() => {
    if (!graph || debouncedQuery === '') return null
    const needle = debouncedQuery.toLowerCase()
    const ids = new Set<string>()
    for (const node of graph.nodes) {
      const haystack = [node.title, node.clusterLabel, node.categories.join(' '), node.year === null ? '' : String(node.year)]
        .join(' ')
        .toLowerCase()
      if (haystack.indexOf(needle) >= 0) ids.add(node.id)
    }
    return ids
  }, [graph, debouncedQuery])

  const suggestions = React.useMemo(() => {
    if (!graph || !matches) return []
    return graph.nodes
      .filter((node) => matches.has(node.id))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, MAX_MATCH_SUGGESTIONS)
  }, [graph, matches])

  const totalNodes = graph ? graph.nodes.length : 0
  const matchCount = matches ? matches.size : 0

  // ---- actions ---------------------------------------------------------------
  const selectPaper = (id: string | null) => {
    setSelectedId(id)
    if (id) {
      setDetailOpen(true)
      setLibraryOpen(false)
    }
  }

  const focusNode = (id: string) => {
    setSelectedId(id)
    setFocus({ id, token: Date.now() })
    setDetailOpen(true)
  }

  const locateNode = (id: string) => {
    setFocus({ id, token: Date.now() })
    setDetailOpen(false)
    setLibraryOpen(false)
  }

  const relayout = () => {
    setSeed((current) => current + 1)
    pushToast('info', '正在用新的随机种子重新计算布局…', 2400)
  }

  // Open the stored PDF through the host: the desktop shell hands it to the OS
  // (or to Zotero for zotero:// links). window.open does nothing in the shell.
  const openFile = (id: string) => {
    void openPaper(id)
      .then((result) => {
        if (result.ok) {
          const message =
            result.via === 'zotero'
              ? '已在 Zotero 中打开'
              : result.via === 'retainpdf'
                ? '已导入并在 RetainPDF 中打开'
                : '已用系统默认阅读器打开'
          pushToast('success', message, 2400)
          return
        }
        pushToast('error', result.error === 'no file' ? '这篇只有题录，没有本地 PDF 文件' : '打开失败：' + (result.error ?? '未知原因'), 3600)
      })
      .catch((reason) => pushToast('error', '打开失败：' + messageOf(reason)))
  }

  const removePaper = (id: string, title: string) => {
    if (typeof window === 'undefined') return
    if (!window.confirm('确定删除《' + title + '》？这会同时从图谱中移除。')) return
    setDeleting(true)
    deletePaper(id)
      .then(() => {
        pushToast('success', '已删除《' + truncate(title, 28) + '》')
        setRefreshToken((value) => value + 1)
        if (selectedId === id) {
          setSelectedId(null)
          setDetail(null)
          setFocus(null)
        }
      })
      .catch((reason) => pushToast('error', '删除失败：' + messageOf(reason)))
      .finally(() => setDeleting(false))
  }

  // Batch delete from the library list: drop selection-related UI state and refresh everything.
  const reloadAfterBatchDelete = (ids: string[]) => {
    if (ids.length === 0) return
    setRefreshToken((value) => value + 1)
    loadGraph()
    loadStatus()
    if (selectedId !== null && ids.includes(selectedId)) {
      setSelectedId(null)
      setDetail(null)
      setFocus(null)
    }
  }

  const refreshAll = () => {
    setRefreshToken((value) => value + 1)
    loadGraph()
    loadStatus()
  }

  // notes / tags / star edited in the detail panel or the library rows
  const applyPaperPatch = (paper: PaperDetail) => {
    setDetail((current) =>
      current !== null && current.id === paper.id
        ? { ...current, notes: paper.notes, tags: paper.tags, starred: paper.starred, rating: paper.rating, metrics: paper.metrics, zotero: paper.zotero }
        : current,
    )
    setRefreshToken((value) => value + 1)
  }

  const filterByTag = (tag: string) => {
    setActiveTag((current) => (current === tag ? null : tag))
    setStarredOnly(false)
    setPage(1)
  }

  // ---- uploads ---------------------------------------------------------------
  const startJobPoll = React.useCallback(
    (jobId: string) => {
      const tick = () => {
        fetchJob(jobId)
          .then((job) => {
            setJobs((current) => upsertJob(current, job))
            if (job.state === 'done' || job.state === 'failed') {
              const timer = pollers.current.get(jobId)
              if (timer !== undefined) window.clearTimeout(timer)
              pollers.current.delete(jobId)
              if (job.state === 'done') {
                pushToast('success', '《' + jobTitle(job, jobs) + '》处理完成，图谱已更新', 5200)
                setRefreshToken((value) => value + 1)
                loadStatus()
              } else {
                pushToast('error', '处理失败：' + (job.message || '请查看宿主日志'), 6000)
              }
              return
            }
            const next = window.setTimeout(tick, JOB_POLL_MS)
            pollers.current.set(jobId, next)
          })
          .catch(() => {
            const next = window.setTimeout(tick, JOB_POLL_MS * 2)
            pollers.current.set(jobId, next)
          })
      }
      const first = window.setTimeout(tick, JOB_POLL_MS)
      pollers.current.set(jobId, first)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadStatus, pushToast],
  )

  const importFiles = React.useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const pdfs = files.filter(isPdf)
      const skipped = files.length - pdfs.length
      if (skipped > 0) pushToast('info', '已跳过 ' + skipped + ' 个非 PDF 文件', 3200)
      if (pdfs.length === 0) {
        if (skipped === 0) pushToast('info', '没有可导入的文件', 2600)
        return
      }
      pushToast('info', '开始导入 ' + pdfs.length + ' 篇文献…', 2600)
      for (const file of pdfs) {
        try {
          const accepted = await uploadPaper(file)
          setJobs((current) =>
            upsertJob(current, {
              id: accepted.jobId,
              state: 'queued',
              progress: 0,
              message: '已接收 ' + file.name,
              paperId: accepted.paperId || null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
          )
          startJobPoll(accepted.jobId)
        } catch (reason) {
          pushToast('error', '上传 ' + file.name + ' 失败：' + messageOf(reason), 6000)
        }
      }
    },
    [pushToast, startJobPoll],
  )

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = 0
    setDragActive(false)
    const files = collectFiles(event.dataTransfer)
    if (files.length > 0) void importFiles(files)
  }

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    if (!dragActive) setDragActive(true)
  }

  const onDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current += 1
    setDragActive(true)
  }

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragActive(false)
  }

  const openFilePicker = () => fileInputRef.current && fileInputRef.current.click()

  const onFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const files = input.files ? Array.from(input.files) : []
    input.value = ''
    if (files.length > 0) void importFiles(files)
  }

  // ---- render ----------------------------------------------------------------
  const online = status !== null
  const paperCount = status ? status.paperCount : totalNodes

  return (
    <div
      ref={rootRef}
      className="lg-root"
      data-litgraph="workbench"
      data-lg-theme={theme.theme}
      data-lg-theme-mode={theme.mode}
      data-lg-font={String(theme.fontSize)}
      data-detail-open={detailOpen ? 'true' : 'false'}
      data-library-open={libraryOpen ? 'true' : 'false'}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="lg-header">
        <div className="lg-brand">
          <span className="lg-brand-mark">
            <ConstellationIcon size={20} />
          </span>
          <span className="lg-brand-text">
            <span className="lg-brand-name">LitGraph</span>
            <span className="lg-brand-sub">文献知识图谱</span>
          </span>
        </div>

        <SearchBar
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            setDebouncedQuery(query.trim())
            if (suggestions[0]) focusNode(suggestions[0].id)
          }}
          onPick={focusNode}
          suggestions={suggestions}
          matchCount={matchCount}
          total={totalNodes}
        />

        <div className="lg-header-meta">
          <span className={'lg-badge ' + (online ? 'is-online' : 'is-offline')} title={online ? '宿主路由已连接 · 存储：' + status!.storage : '未连接宿主路由，正在使用内置空图谱'}>
            <i />
            {online ? '宿主在线' : '离线'}
          </span>
          <span className="lg-meta-text">{paperCount} 篇 · {graph ? graph.clusters.length : 0} 聚类</span>
          <button
            type="button"
            className="lg-icon-btn lg-zotero-btn"
            title="从 Zotero 导入（读取文献记录与 PDF）"
            aria-label="从 Zotero 导入"
            onClick={() => setZoteroOpen(true)}
          >
            <span className="lg-zotero-glyph">Z</span>
            <span className="lg-zotero-text">Zotero</span>
          </button>
          <button
            type="button"
            className="lg-icon-btn lg-theme-btn"
            title={'主题：' + THEME_LABELS[theme.mode] + '（点击切换：跟随系统 → 深色 → 浅色）'}
            aria-label={'主题：' + THEME_LABELS[theme.mode]}
            onClick={() => cycleTheme()}
          >
            <ThemeGlyph mode={theme.mode} />
            <span className="lg-theme-text">{THEME_LABELS[theme.mode]}</span>
          </button>
          <button
            type="button"
            className="lg-icon-btn lg-font-btn"
            title={'字号：' + theme.fontSize + 'px（点击切换 14 / 15 / 16）'}
            aria-label={'字号：' + theme.fontSize + 'px'}
            onClick={() => cycleFontSize()}
          >
            <span className="lg-font-glyph">Aa</span>
            <span className="lg-font-value">{theme.fontSize}</span>
          </button>
          <button type="button" className="lg-icon-btn lg-mobile-toggle" title="详情" aria-label="详情" onClick={() => { setDetailOpen((value) => !value); setLibraryOpen(false) }}>
            <LayoutIcon size={14} />
          </button>
          <button type="button" className="lg-icon-btn lg-mobile-toggle" title="论文库" aria-label="论文库" onClick={() => { setLibraryOpen((value) => !value); setDetailOpen(false) }}>
            <ResetIcon size={14} />
          </button>
        </div>
      </header>

      <div className="lg-columns">
        <aside className={'lg-col-detail' + (detailOpen ? ' is-open' : '')}>
          <DetailPanel
            detail={detail}
            loading={detailLoading}
            error={detailError}
            clusters={graph ? graph.clusters : []}
            deleting={deleting}
            onOpenFile={openFile}
            onDelete={removePaper}
            onLocate={locateNode}
            onRetry={() => setRefreshToken((value) => value + 1)}
            onChanged={applyPaperPatch}
            onToast={pushToast}
            onTagFilter={filterByTag}
          />
        </aside>

        <main className="lg-col-center">
          <div className="lg-view-toggle" role="tablist" aria-label="中央视图">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'graph'}
              className={'lg-view-btn' + (viewMode === 'graph' ? ' is-active' : '')}
              onClick={() => setViewMode('graph')}
            >
              星图
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'timeline'}
              className={'lg-view-btn' + (viewMode === 'timeline' ? ' is-active' : '')}
              onClick={() => setViewMode('timeline')}
            >
              时间轴
            </button>
          </div>

          {viewMode === 'timeline' ? (
            <TimelineView
              nodes={timelineNodes}
              selectedId={selectedId}
              onSelect={selectPaper}
              onClear={() => selectPaper(null)}
            />
          ) : (
            <StarMap
              layout={layout}
              clusters={graph ? graph.clusters : []}
              stars={stars}
              selectedId={selectedId}
              matches={matches}
              focus={focus}
              loading={graphLoading}
              error={graphError}
              onSelect={selectPaper}
              onFit={() => setSeed((current) => current)}
              onRelayout={relayout}
              theme={theme.theme}
              labelFontSize={theme.graphLabelSize}
              clusterLabelSize={theme.graphClusterLabelSize}
            >
              {graphError ? (
                <div className="lg-graph-retry">
                  <button type="button" className="lg-btn lg-btn-ghost" onClick={() => loadGraph()}>
                    重试
                  </button>
                </div>
              ) : null}
            </StarMap>
          )}

          {viewMode === 'graph' && query.trim() !== '' && matchCount === 0 && graph ? (
            <div className="lg-search-empty">没有匹配「{query.trim()}」的节点，试试作者名或关键词。</div>
          ) : null}
        </main>

        <aside className={'lg-col-library' + (libraryOpen ? ' is-open' : '')}>
          <LibraryPanel
            clusters={graph ? graph.clusters : []}
            activeCluster={activeCluster}
            sort={sort}
            order={order}
            pageData={cards.pageData}
            loading={cards.loading}
            error={cards.error}
            selectedId={selectedId}
            onCluster={setActiveCluster}
            onSort={setSort}
            onOrder={setOrder}
            onPage={setPage}
            onSelect={focusNode}
            onRetry={() => setRefreshToken((value) => value + 1)}
            onImportClick={openFilePicker}
            starredOnly={starredOnly}
            onStarredOnly={(value) => {
              setStarredOnly(value)
              setPage(1)
            }}
            activeTag={activeTag}
            onTag={(tag) => {
              setActiveTag(tag)
              setPage(1)
            }}
            minRating={minRating}
            onMinRating={(value) => {
              setMinRating(value)
              setPage(1)
            }}
            query={debouncedQuery}
            onToast={pushToast}
            onPaperPatched={applyPaperPatch}
            onBatchDeleted={reloadAfterBatchDelete}
            onClusterLevelChanged={() => {
              loadGraph()
              void loadStatus()
              setPage(1)
            }}
          />
        </aside>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="lg-file-input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={onFileInputChange}
      />

      <ZoteroImport
        open={zoteroOpen}
        onClose={() => setZoteroOpen(false)}
        onImported={(count) => {
          pushToast('success', '已从 Zotero 导入 ' + count + ' 篇文献', 5200)
          refreshAll()
        }}
        onToast={pushToast}
      />

      {dragActive ? (
        <div className="lg-drop-overlay" data-litgraph="drop-overlay">
          <div className="lg-drop-card">
            <div className="lg-drop-title">松手导入 PDF</div>
            <div className="lg-drop-hint">AI 会自动解析、理解并把它挂到星图上</div>
          </div>
        </div>
      ) : null}

      <Toasts
        toasts={toasts}
        jobs={jobs}
        onDismissToast={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
        onDismissJob={(id) => setJobs((current) => current.filter((job) => job.id !== id))}
      />

      <div className="lg-footer-hint">
        <span>拖入 PDF 或点击「导入」 · 滚轮缩放 · 拖拽平移 · 点击节点查看详情</span>
        {graph ? <span>{graph.edges.length} 条关联</span> : null}
      </div>
    </div>
  )
}

// ---- theme glyphs -----------------------------------------------------------

function MonitorIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

function MoonIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />
    </svg>
  )
}

function SunIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
    </svg>
  )
}

function ThemeGlyph({ mode, size = 14 }: { mode: ThemeMode; size?: number }) {
  if (mode === 'light') return <SunIcon size={size} />
  if (mode === 'dark') return <MoonIcon size={size} />
  return <MonitorIcon size={size} />
}

// ---- helpers ----------------------------------------------------------------

function messageOf(reason: unknown): string {
  if (reason instanceof ApiError) return reason.message
  if (reason instanceof Error) return reason.message
  return String(reason)
}

function upsertJob(jobs: ImportJob[], job: ImportJob): ImportJob[] {
  const index = jobs.findIndex((item) => item.id === job.id)
  if (index < 0) return jobs.concat([job])
  const copy = jobs.slice()
  copy[index] = { ...jobs[index], ...job }
  return copy
}

function jobTitle(job: ImportJob, jobs: ImportJob[]): string {
  return job.paperId && job.paperId !== '' ? '文献' : '文献'
}

function collectFiles(transfer: DataTransfer | null): File[] {
  if (!transfer) return []
  const files: File[] = []
  if (transfer.files && transfer.files.length > 0) {
    for (let index = 0; index < transfer.files.length; index += 1) files.push(transfer.files[index])
    return files
  }
  if (transfer.items) {
    for (let index = 0; index < transfer.items.length; index += 1) {
      const item = transfer.items[index]
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}

function truncate(value: string, max: number): string {
  if (!value) return ''
  return value.length > max ? value.slice(0, max - 1) + '…' : value
}
