/**
 * Zotero import dialog (client half).
 *
 * Self-contained modal: scan the local Zotero library through the host bridge,
 * pick items, then import their PDFs and/or records into LitGraph.
 *
 * Mounting is owned by the host UI; this component receives
 * { open, onClose, onImported? } and renders nothing while open === false.
 * Styles live in src/client/styles-zotero.ts (injected on mount, lg-zot prefix).
 */
import * as React from 'react'
import { createPortal } from 'react-dom'
import { ensureZoteroStyles } from '../styles-zotero'
import {
  importZoteroSelection,
  scanZoteroLibrary,
  type ZoteroImportMode,
  type ZoteroImportResult,
  type ZoteroItemSummary,
  type ZoteroScanResult,
} from '../zoteroApi'

export interface ZoteroImportProps {
  open: boolean
  onClose: () => void
  /** Called once per finished import with the number of accepted items (duplicates included). */
  onImported?: (count: number) => void
  /** Optional shell toast hook (matches the existing LitGraph toast style). */
  onToast?: (kind: 'info' | 'success' | 'error', message: string) => void
}

type ScanPhase = 'idle' | 'scanning' | 'ready' | 'error'

const VISIBLE_LIMIT = 300

const SOURCE_LABEL: Record<ZoteroScanResult['source'], string> = {
  'local-api': 'Zotero 本地 API',
  sqlite: 'zotero.sqlite 副本',
}

const TYPE_LABEL: Record<string, string> = {
  journalArticle: '期刊论文',
  magazineArticle: '杂志文章',
  newspaperArticle: '报纸文章',
  conferencePaper: '会议论文',
  book: '图书',
  bookSection: '图书章节',
  thesis: '学位论文',
  report: '报告',
  preprint: '预印本',
  manuscript: '手稿',
  patent: '专利',
  standard: '标准',
  dataset: '数据集',
  document: '文档',
  webpage: '网页',
  encyclopediaArticle: '百科条目',
  dictionaryEntry: '词典条目',
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function authorsText(creators: string[]): string {
  if (creators.length === 0) return '作者未知'
  if (creators.length <= 3) return creators.join(' / ')
  return creators.slice(0, 3).join(' / ') + ' 等 ' + creators.length + ' 人'
}

function typeLabel(itemType: string): string {
  return TYPE_LABEL[itemType] ?? itemType
}

function hasUsablePdf(item: ZoteroItemSummary): boolean {
  return item.attachment !== null && item.attachment.path !== ''
}

function highlight(text: string, query: string): React.ReactNode {
  const needle = query.trim().toLowerCase()
  if (needle === '') return text
  const haystack = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let from = 0
  let index = haystack.indexOf(needle)
  let key = 0
  while (index >= 0 && partitionGuard(key)) {
    if (index > from) parts.push(text.slice(from, index))
    parts.push(
      React.createElement('mark', { key: 'm' + key, className: 'lg-zot-mark' }, text.slice(index, index + needle.length)),
    )
    from = index + needle.length
    index = haystack.indexOf(needle, from)
    key += 1
  }
  if (from < text.length) parts.push(text.slice(from))
  return parts.length === 0 ? text : parts
}

function partitionGuard(count: number): boolean {
  return count < 24
}

function CloseGlyph(): React.ReactElement {
  return React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('path', {
      d: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
    }),
  )
}

function SearchGlyph(): React.ReactElement {
  return React.createElement(
    'svg',
    { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('circle', { cx: 7, cy: 7, r: 4.4, stroke: 'currentColor', strokeWidth: 1.4 }),
    React.createElement('path', { d: 'M10.4 10.4L14 14', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
  )
}

function ZoteroGlyph(): React.ReactElement {
  return React.createElement('span', { className: 'lg-zot-glyph', 'aria-hidden': 'true' }, 'Z')
}

function attachmentBadge(item: ZoteroItemSummary): React.ReactElement {
  if (item.attachment === null) {
    return React.createElement('span', { className: 'lg-zot-badge is-none' }, '无 PDF')
  }
  if (item.attachment.path === '') {
    return React.createElement(
      'span',
      { className: 'lg-zot-badge is-missing', title: item.attachment.fileName },
      '附件缺失',
    )
  }
  const size = formatBytes(item.attachment.size)
  return React.createElement(
    'span',
    { className: 'lg-zot-badge is-pdf', title: item.attachment.path },
    size === '' ? 'PDF' : 'PDF ' + size,
  )
}

type ZoteroTheme = 'dark' | 'light'

/**
 * Read the active LitGraph theme from the shell root.
 *
 * The dialog portals to <body>, i.e. outside .lg-root, so it cannot inherit the
 * theme CSS variables; it mirrors data-lg-theme onto its own overlay instead.
 */
function readZoteroTheme(): ZoteroTheme {
  if (typeof document === 'undefined') return 'dark'
  const root = document.querySelector('.lg-root')
  const value = root !== null ? root.getAttribute('data-lg-theme') : null
  return value === 'light' ? 'light' : 'dark'
}

export function ZoteroImport(props: ZoteroImportProps): React.ReactElement | null {
  const { open, onClose, onImported, onToast } = props
  const [phase, setPhase] = React.useState<ScanPhase>('idle')
  const [scan, setScan] = React.useState<ZoteroScanResult | null>(null)
  const [scanError, setScanError] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [mode, setMode] = React.useState<ZoteroImportMode>('pdf')
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set<string>())
  const [importing, setImporting] = React.useState(false)
  const [importError, setImportError] = React.useState('')
  const [result, setResult] = React.useState<ZoteroImportResult | null>(null)
  const [theme, setTheme] = React.useState<ZoteroTheme>(() => readZoteroTheme())

  const abortRef = React.useRef<AbortController | null>(null)
  const runIdRef = React.useRef(0)
  const aliveRef = React.useRef(true)

  React.useEffect(() => {
    aliveRef.current = true
    ensureZoteroStyles()
    return () => {
      aliveRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  // Follow the shell theme while the dialog is open: read it on open, then watch
  // .lg-root's data-lg-theme (we portal to <body>, outside .lg-root).
  React.useEffect(() => {
    if (!open) return undefined
    setTheme(readZoteroTheme())
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return undefined
    const observer = new MutationObserver(() => setTheme(readZoteroTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lg-theme'], subtree: true })
    return () => observer.disconnect()
  }, [open])

  const runScan = React.useCallback(async (): Promise<void> => {
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('scanning')
    setScanError('')
    setImportError('')
    setResult(null)
    try {
      const next = await scanZoteroLibrary(controller.signal)
      if (!aliveRef.current || runIdRef.current !== runId) return
      setScan(next)
      setPhase('ready')
      const preSelected = new Set<string>()
      for (const item of next.items) {
        if (hasUsablePdf(item)) preSelected.add(item.key)
      }
      setSelected(preSelected)
    } catch (error) {
      if (!aliveRef.current || runIdRef.current !== runId) return
      if (error instanceof DOMException && error.name === 'AbortError') return
      setScan(null)
      setSelected(new Set<string>())
      setScanError(describe(error))
      setPhase('error')
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    setQuery('')
    setMode('pdf')
    setImportError('')
    setResult(null)
    void runScan()
  }, [open, runScan])

  React.useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !importing) {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, importing, onClose])

  const items = scan !== null ? scan.items : EMPTY_ITEMS

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return items
    return items.filter((item) => {
      const haystack = [item.title, item.venue, item.doi, item.creators.join(' '), item.collections.join(' '), item.tags.join(' ')]
        .join(' ')
        .toLowerCase()
      return haystack.indexOf(needle) >= 0
    })
  }, [items, query])

  const visible = filtered.slice(0, VISIBLE_LIMIT)
  const selectedItems = items.filter((item) => selected.has(item.key))
  const selectedPdfCount = selectedItems.filter(hasUsablePdf).length
  const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.has(item.key))
  const warnings = scan !== null ? scan.warnings : EMPTY_STRINGS

  const toggleOne = React.useCallback((key: string): void => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleAllVisible = React.useCallback((): void => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (allVisibleSelected) for (const item of visible) next.delete(item.key)
      else for (const item of visible) next.add(item.key)
      return next
    })
  }, [allVisibleSelected, visible])

  const clearSelection = React.useCallback((): void => setSelected(new Set<string>()), [])

  const runImport = React.useCallback(async (): Promise<void> => {
    if (importing) return
    if (selectedItems.length === 0) {
      onToast?.('info', '请先勾选要导入的 Zotero 条目')
      return
    }
    setImporting(true)
    setImportError('')
    try {
      const next = await importZoteroSelection(
        selectedItems.map((item) => item.key),
        mode,
      )
      if (!aliveRef.current) return
      setResult(next)
      if (next.accepted.length > 0) onImported?.(next.accepted.length)
      const summary =
        '已导入 ' + next.accepted.length + ' 条' + (next.skipped.length > 0 ? '，跳过 ' + next.skipped.length + ' 条' : '')
      onToast?.(next.skipped.length > 0 ? 'info' : 'success', summary)
    } catch (error) {
      if (!aliveRef.current) return
      const message = describe(error)
      setImportError(message)
      onToast?.('error', 'Zotero 导入失败：' + message)
    } finally {
      if (aliveRef.current) setImporting(false)
    }
  }, [importing, mode, onImported, onToast, selectedItems])

  const closeDialog = React.useCallback((): void => {
    if (importing) return
    abortRef.current?.abort()
    onClose()
  }, [importing, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) closeDialog()
  }

  const renderRow = (item: ZoteroItemSummary): React.ReactElement => {
    const checked = selected.has(item.key)
    const toggle = (): void => {
      if (!importing) toggleOne(item.key)
    }
    return React.createElement(
      'div',
      {
        key: item.key,
        className: 'lg-zot-row' + (checked ? ' is-checked' : ''),
        role: 'checkbox',
        'aria-checked': checked,
        'aria-label': item.title,
        tabIndex: 0,
        onClick: toggle,
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            toggle()
          }
        },
      },
      React.createElement('input', {
        type: 'checkbox',
        className: 'lg-zot-check',
        checked,
        disabled: importing,
        onChange: toggle,
        onClick: (event: React.MouseEvent<HTMLInputElement>) => event.stopPropagation(),
        tabIndex: -1,
      }),
      React.createElement(
        'div',
        { className: 'lg-zot-main' },
        React.createElement('div', { className: 'lg-zot-row-title' }, highlight(item.title, query)),
        React.createElement(
          'div',
          { className: 'lg-zot-row-meta' },
          React.createElement('span', { className: 'lg-zot-authors', title: authorsText(item.creators) }, authorsText(item.creators)),
          React.createElement('span', null, item.year === null ? '年份未知' : String(item.year)),
          item.venue !== '' ? React.createElement('span', { className: 'lg-zot-venue', title: item.venue }, item.venue) : null,
          React.createElement('span', { className: 'lg-zot-badge' }, typeLabel(item.itemType)),
          attachmentBadge(item),
          item.collections.slice(0, 2).map((collection) =>
            React.createElement('span', { key: 'c-' + collection, className: 'lg-zot-chip', title: collection }, collection),
          ),
        ),
      ),
    )
  }

  const dialogChildren: React.ReactNode[] = []

  dialogChildren.push(
    React.createElement(
      'div',
      { className: 'lg-zot-head', key: 'head' },
      ZoteroGlyph(),
      React.createElement(
        'div',
        { className: 'lg-zot-heading' },
        React.createElement('div', { className: 'lg-zot-title' }, '从 Zotero 导入'),
        React.createElement(
          'div',
          { className: 'lg-zot-sub', title: scan !== null ? scan.dataDir : '' },
          scan === null
            ? '读取本机 Zotero 文献库（PDF + 题录）'
            : scan.dataDir + ' · ' + SOURCE_LABEL[scan.source] + ' · 可导入 ' + scan.items.length + ' 条',
        ),
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'lg-zot-icon-btn',
          onClick: closeDialog,
          disabled: importing,
          title: '关闭',
          'aria-label': '关闭',
        },
        CloseGlyph(),
      ),
    ),
  )

  if (phase === 'scanning') {
    dialogChildren.push(
      React.createElement(
        'div',
        { className: 'lg-zot-loading', key: 'loading' },
        React.createElement('span', { className: 'lg-zot-spinner', 'aria-hidden': 'true' }),
        React.createElement('div', null, '正在扫描 Zotero 文献库…'),
        React.createElement(
          'div',
          { className: 'lg-zot-loading-hint' },
          '首次扫描会复制并解析 zotero.sqlite（不会写入或锁定原库），通常需要 1-3 秒。',
        ),
      ),
    )
  } else if (phase === 'error') {
    dialogChildren.push(
      React.createElement(
        'div',
        { className: 'lg-zot-error', key: 'error' },
        React.createElement('div', { className: 'lg-zot-error-text' }, scanError || '扫描 Zotero 失败'),
        React.createElement(
          'div',
          { className: 'lg-zot-empty-hint' },
          '请确认本机已安装 Zotero 7 并至少打开过一次。若数据目录不是默认的「用户目录 / Zotero」，可在宿主环境用 LITGRAPH_ZOTERO_DATA_DIR 指定。',
        ),
        React.createElement(
          'button',
          { type: 'button', className: 'lg-zot-btn', onClick: () => void runScan() },
          '重试',
        ),
      ),
    )
  } else if (result !== null) {
    const byKey = new Map<string, ZoteroItemSummary>()
    for (const item of items) byKey.set(item.key, item)
    const acceptedRows = result.accepted.map((entry) => {
      const found = byKey.get(entry.key)
      return React.createElement(
        'div',
        { key: 'a-' + entry.key, className: 'lg-zot-result-item' },
        React.createElement('span', { className: 'lg-zot-result-item-title' }, found !== undefined ? found.title : entry.key),
        React.createElement('span', { className: 'lg-zot-badge is-pdf' }, entry.jobId !== undefined ? '后台解析中' : '已导入'),
      )
    })
    const skippedRows = result.skipped.map((entry) => {
      const found = byKey.get(entry.key)
      return React.createElement(
        'div',
        { key: 's-' + entry.key, className: 'lg-zot-result-item' },
        React.createElement(
          'span',
          { className: 'lg-zot-result-item-title' },
          (found !== undefined ? found.title : entry.key) + ' — ',
          React.createElement('span', { className: 'lg-zot-skip' }, entry.reason),
        ),
      )
    })
    dialogChildren.push(
      React.createElement(
        'div',
        { className: 'lg-zot-result', key: 'result', 'aria-live': 'polite' },
        React.createElement(
          'div',
          { className: 'lg-zot-result-summary' },
          React.createElement('div', { className: 'lg-zot-result-num' }, String(result.accepted.length)),
          React.createElement(
            'div',
            { className: 'lg-zot-result-text' },
            '条已加入 LitGraph' + (result.skipped.length > 0 ? '，' + result.skipped.length + ' 条被跳过' : ''),
          ),
          React.createElement(
            'div',
            { className: 'lg-zot-result-hint' },
            '重复文献会按内容或标题自动去重；带 PDF 的条目会在后台解析并交给大模型分类，进度可在主界面查看。',
          ),
        ),
        acceptedRows.length > 0
          ? React.createElement(
              'div',
              { className: 'lg-zot-result-section' },
              React.createElement('div', { className: 'lg-zot-result-title' }, '已导入'),
              acceptedRows,
            )
          : null,
        skippedRows.length > 0
          ? React.createElement(
              'div',
              { className: 'lg-zot-result-section' },
              React.createElement('div', { className: 'lg-zot-result-title' }, '跳过'),
              skippedRows,
            )
          : null,
        importError !== '' ? React.createElement('div', { className: 'lg-zot-error-inline' }, importError) : null,
      ),
    )
    dialogChildren.push(
      React.createElement(
        'div',
        { className: 'lg-zot-foot', key: 'foot' },
        React.createElement(
          'div',
          { className: 'lg-zot-foot-info' },
          '导入完成。若列表没有立即刷新，可稍后按 F5 刷新页面。',
        ),
        React.createElement(
          'div',
          { className: 'lg-zot-actions' },
          React.createElement(
            'button',
            { type: 'button', className: 'lg-zot-btn', onClick: () => void runScan() },
            '再次扫描',
          ),
          React.createElement('button', { type: 'button', className: 'lg-zot-btn is-primary', onClick: closeDialog }, '完成'),
        ),
      ),
    )
  } else {
    dialogChildren.push(
      React.createElement(
        'div',
        { className: 'lg-zot-toolbar', key: 'toolbar' },
        React.createElement(
          'label',
          { className: 'lg-zot-search' },
          SearchGlyph(),
          React.createElement('input', {
            value: query,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
            placeholder: '搜索标题 / 作者 / 分类 / DOI',
            'aria-label': '搜索 Zotero 条目',
            disabled: importing,
          }),
        ),
        React.createElement(
          'div',
          { className: 'lg-zot-mode', role: 'group', 'aria-label': '导入方式' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'lg-zot-mode-btn' + (mode === 'pdf' ? ' is-active' : ''),
              onClick: () => setMode('pdf'),
              disabled: importing,
              title: '有 PDF 的条目走完整解析，缺 PDF 的条目自动退化为仅导入题录',
            },
            '导入 PDF',
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'lg-zot-mode-btn' + (mode === 'meta' ? ' is-active' : ''),
              onClick: () => setMode('meta'),
              disabled: importing,
              title: '只导入题录信息，不动 PDF 文件',
            },
            '仅导入记录',
          ),
        ),
        React.createElement(
          'button',
          { type: 'button', className: 'lg-zot-btn', onClick: () => void runScan(), disabled: importing },
          '重新扫描',
        ),
      ),
    )

    if (warnings.length > 0) {
      const shown = warnings.slice(0, 4)
      dialogChildren.push(
        React.createElement(
          'div',
          { className: 'lg-zot-warnings', key: 'warnings' },
          React.createElement('span', { className: 'lg-zot-warnings-title' }, '提示'),
          shown.map((warning, index) => React.createElement('div', { key: 'w' + index }, warning)),
          warnings.length > shown.length
            ? React.createElement('div', { key: 'w-more' }, '还有 ' + (warnings.length - shown.length) + ' 条提示')
            : null,
        ),
      )
    }

    dialogChildren.push(
      React.createElement(
        'div',
        { className: 'lg-zot-list-head', key: 'list-head' },
        React.createElement(
          'label',
          { className: 'lg-zot-check-label' },
          React.createElement('input', {
            type: 'checkbox',
            checked: allVisibleSelected,
            onChange: toggleAllVisible,
            disabled: importing || visible.length === 0,
          }),
          '全选' + (filtered.length !== items.length ? '（当前 ' + filtered.length + ' 条结果）' : ''),
        ),
        React.createElement('span', { className: 'lg-zot-list-count' }, '已选 ' + selectedItems.length + ' / ' + items.length),
        selectedItems.length > 0
          ? React.createElement('button', { type: 'button', className: 'lg-zot-link', onClick: clearSelection }, '清空选择')
          : null,
      ),
    )

    dialogChildren.push(
      React.createElement(
        'div',
        { className: 'lg-zot-list', key: 'list' },
        items.length === 0
          ? React.createElement(
              'div',
              { className: 'lg-zot-empty' },
              React.createElement('div', null, 'Zotero 文献库里还没有可导入的论文条目'),
              React.createElement(
                'div',
                { className: 'lg-zot-empty-hint' },
                '笔记、附件、软件等非论文类型会被自动跳过。可以先去 Zotero 里添加文献，再回来点「重新扫描」。',
              ),
            )
          : visible.length === 0
            ? React.createElement(
                'div',
                { className: 'lg-zot-empty' },
                React.createElement('div', null, '没有匹配「' + query.trim() + '」的条目'),
                React.createElement('div', { className: 'lg-zot-empty-hint' }, '换个关键词，或清空搜索框查看全部条目。'),
              )
            : visible.map(renderRow),
        filtered.length > VISIBLE_LIMIT
          ? React.createElement(
              'div',
              { className: 'lg-zot-more', key: 'more' },
              '只显示前 ' + VISIBLE_LIMIT + ' 条，请用搜索缩小范围（共 ' + filtered.length + ' 条）',
            )
          : null,
      ),
    )

    dialogChildren.push(
      React.createElement(
        'div',
        { className: 'lg-zot-foot', key: 'foot' },
        React.createElement(
          'div',
          { className: 'lg-zot-foot-info' },
          '已选 ' +
            selectedItems.length +
            ' 条' +
            (mode === 'pdf' && selectedItems.length > 0
              ? '（其中 ' + selectedPdfCount + ' 条有可用 PDF' + (selectedPdfCount < selectedItems.length ? '，其余按题录导入' : '') + '）'
              : '') +
            (mode === 'meta' ? ' · 仅导入题录，不复制 PDF' : ''),
          importError !== ''
            ? React.createElement('div', { className: 'lg-zot-error-inline' }, importError)
            : null,
        ),
        React.createElement(
          'div',
          { className: 'lg-zot-actions' },
          React.createElement('button', { type: 'button', className: 'lg-zot-btn', onClick: closeDialog, disabled: importing }, '取消'),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'lg-zot-btn is-primary',
              onClick: () => void runImport(),
              disabled: importing || selectedItems.length === 0,
            },
            importing ? '导入中…' : '导入所选 ' + selectedItems.length + ' 条',
          ),
        ),
      ),
    )
  }

  return createPortal(
    React.createElement(
      'div',
      { className: 'lg-zot-backdrop', 'data-lg-theme': theme, onMouseDown: handleBackdropMouseDown },
      React.createElement(
        'div',
        { className: 'lg-zot-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': '从 Zotero 导入' },
        dialogChildren,
      ),
    ),
    document.body,
  )
}

const EMPTY_ITEMS: ZoteroItemSummary[] = []
const EMPTY_STRINGS: string[] = []

export default ZoteroImport
