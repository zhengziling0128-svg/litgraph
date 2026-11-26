/**
 * LitGraph theme + font-size preference store.
 *
 * Why the panel owns its palette: the shell can run a light skin whose
 * `--dsw-alias-label-*` tokens are dark ink (#4d5d7f / #52658c). Painting those on
 * the workbench's own dark panel is what made the first version look "all black".
 * Both palettes therefore live in styles.ts as self-contained `--lg-*` tokens and
 * this module only decides which one is active:
 *
 *   system  follow the shell background (host `--dsw-alias-bg-base` luminance),
 *           falling back to `prefers-color-scheme`, and track runtime changes
 *   dark    always the starry palette
 *   light   always the paper / daylight palette
 *
 * The same store owns the font step (14 / 15 / 16px). The workbench binds it with
 * `useSyncExternalStore`, both preferences persist in localStorage.
 */

export type ThemeMode = 'system' | 'dark' | 'light'
export type ResolvedTheme = 'dark' | 'light'
export type FontSize = 14 | 15 | 16

export interface ThemeSnapshot {
  mode: ThemeMode
  theme: ResolvedTheme
  fontSize: FontSize
  /** SVG label font size (user units) derived from the font step. */
  graphLabelSize: number
  /** SVG cluster caption font size (user units) derived from the font step. */
  graphClusterLabelSize: number
}

export const THEME_STORAGE_KEY = 'litgraph.theme'
export const FONT_STORAGE_KEY = 'litgraph.fontSize'
export const THEME_MODES: readonly ThemeMode[] = ['system', 'dark', 'light']
export const FONT_SIZES: readonly FontSize[] = [14, 15, 16]

export const THEME_LABELS: Record<ThemeMode, string> = {
  system: '跟随系统',
  dark: '深色',
  light: '浅色',
}

const BASE_FONT_SIZE = 14
const BASE_GRAPH_LABEL_SIZE = 12.5
const BASE_GRAPH_CLUSTER_LABEL_SIZE = 13

type Rgb = [number, number, number]

function localStore(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function readMode(): ThemeMode {
  const store = localStore()
  let raw: string | null = null
  try {
    raw = store ? store.getItem(THEME_STORAGE_KEY) : null
  } catch {
    raw = null
  }
  return raw === 'dark' || raw === 'light' || raw === 'system' ? raw : 'system'
}

function readFontSize(): FontSize {
  const store = localStore()
  let raw: string | null = null
  try {
    raw = store ? store.getItem(FONT_STORAGE_KEY) : null
  } catch {
    raw = null
  }
  const numeric = raw === null ? 0 : Number.parseInt(raw, 10)
  return numeric === 15 || numeric === 16 ? numeric : BASE_FONT_SIZE
}

function parseCssColor(value: string): Rgb | null {
  const text = value.trim()
  if (text === '') return null
  if (text.charAt(0) === '#') {
    let hex = text.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .slice(0, 3)
        .split('')
        .map((channel) => channel + channel)
        .join('')
    }
    if (hex.length !== 6 && hex.length !== 8) return null
    const numeric = Number.parseInt(hex.slice(0, 6), 16)
    if (!Number.isFinite(numeric)) return null
    return [Math.round((numeric >> 16) & 255), Math.round((numeric >> 8) & 255), numeric & 255]
  }
  const match = /^rgba?\(\s*([0-9.]+%?)[\s,]+([0-9.]+%?)[\s,]+([0-9.]+%?)/i.exec(text)
  if (!match) return null
  const channel = (part: string): number => {
    const numeric = Number.parseFloat(part)
    if (!Number.isFinite(numeric)) return 0
    return part.charAt(part.length - 1) === '%' ? Math.round((numeric / 100) * 255) : Math.round(numeric)
  }
  return [channel(match[1]), channel(match[2]), channel(match[3])]
}

/** Resolve any CSS color (including color-mix()/oklch()) through a throwaway element. */
function resolveCssColor(value: string): Rgb | null {
  const direct = parseCssColor(value)
  if (direct) return direct
  if (typeof document === 'undefined' || !document.body) return null
  const probe = document.createElement('span')
  probe.style.position = 'absolute'
  probe.style.opacity = '0'
  probe.style.pointerEvents = 'none'
  probe.style.color = value
  if (!probe.style.color) return null
  document.body.appendChild(probe)
  let resolved = ''
  try {
    resolved = getComputedStyle(probe).color
  } finally {
    document.body.removeChild(probe)
  }
  return parseCssColor(resolved)
}

function relativeLuminance(rgb: Rgb): number {
  const toLinear = (channel: number): number => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2])
}

function isTransparent(value: string): boolean {
  const match = /^rgba\(\s*[0-9.]+\s*,\s*[0-9.]+\s*,\s*[0-9.]+\s*,\s*([0-9.]+)\s*\)$/i.exec(value.trim())
  return match !== null && Number.parseFloat(match[1]) === 0
}

/**
 * Shell background, ideally via the documented `--dsw-alias-bg-base` token. The
 * workbench root (when mounted) and its ancestors are inspected first because some
 * hosts scope the theme variables on a wrapper instead of `<html>`.
 */
function shellBackground(): Rgb | null {
  if (typeof document === 'undefined') return null
  const starts: Element[] = []
  if (rootElement) starts.push(rootElement)
  if (document.documentElement) starts.push(document.documentElement)
  if (document.body) starts.push(document.body)

  const visited = new Set<Element>()
  for (const start of starts) {
    let element: Element | null = start
    while (element && !visited.has(element)) {
      visited.add(element)
      let token = ''
      try {
        token = getComputedStyle(element).getPropertyValue('--dsw-alias-bg-base').trim()
      } catch {
        token = ''
      }
      if (token !== '') {
        const parsed = resolveCssColor(token)
        if (parsed) return parsed
      }
      element = element.parentElement
    }
  }

  if (document.body) {
    try {
      const painted = getComputedStyle(document.body).backgroundColor
      if (painted && !isTransparent(painted)) {
        const parsed = parseCssColor(painted)
        if (parsed) return parsed
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Resolve `system` against the shell background, then the OS preference. */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode
  const background = shellBackground()
  if (background) return relativeLuminance(background) > 0.5 ? 'light' : 'dark'
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {
      return 'dark'
    }
  }
  return 'dark'
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function buildSnapshot(): ThemeSnapshot {
  const scale = fontSize / BASE_FONT_SIZE
  return {
    mode,
    theme: resolveTheme(mode),
    fontSize,
    graphLabelSize: round2(BASE_GRAPH_LABEL_SIZE * scale),
    graphClusterLabelSize: round2(BASE_GRAPH_CLUSTER_LABEL_SIZE * scale),
  }
}

// Runtime state. `rootElement` must be declared before the first snapshot is built:
// resolving "system" inspects the shell background starting from that element.
let rootElement: HTMLElement | null = null
let mediaQuery: MediaQueryList | null = null
let observer: MutationObserver | null = null
let initCount = 0

let mode: ThemeMode = readMode()
let fontSize: FontSize = readFontSize()
let snapshot: ThemeSnapshot = buildSnapshot()
const listeners = new Set<() => void>()

function applyToRoot(): void {
  if (!rootElement) return
  rootElement.setAttribute('data-lg-theme', snapshot.theme)
  rootElement.setAttribute('data-lg-theme-mode', snapshot.mode)
  rootElement.setAttribute('data-lg-font', String(snapshot.fontSize))
  rootElement.style.setProperty('color-scheme', snapshot.theme)
}

function emit(): void {
  for (const listener of Array.from(listeners)) listener()
}

function refresh(): void {
  if (rootElement) {
    const next = buildSnapshot()
    const changed =
      next.mode !== snapshot.mode || next.theme !== snapshot.theme || next.fontSize !== snapshot.fontSize
    snapshot = next
    applyToRoot()
    if (changed) emit()
    return
  }
  const next = buildSnapshot()
  const changed =
    next.mode !== snapshot.mode || next.theme !== snapshot.theme || next.fontSize !== snapshot.fontSize
  snapshot = next
  if (changed) emit()
}

function persist(key: string, value: string): void {
  const store = localStore()
  try {
    if (store) store.setItem(key, value)
  } catch {
    /* storage can be unavailable/read-only in embedded webviews */
  }
}

export function getThemeSnapshot(): ThemeSnapshot {
  return snapshot
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Bind the live panel root so the palette/font attributes follow the store. */
export function registerThemeRoot(element: HTMLElement | null): void {
  rootElement = element
  applyToRoot()
  refresh()
}

/** Cycle 跟随系统 → 深色 → 浅色 and persist. */
export function cycleTheme(): ThemeMode {
  const index = THEME_MODES.indexOf(mode)
  mode = THEME_MODES[(index + 1) % THEME_MODES.length]
  persist(THEME_STORAGE_KEY, mode)
  refresh()
  return mode
}

/** Cycle 14 → 15 → 16px and persist. */
export function cycleFontSize(): FontSize {
  const index = FONT_SIZES.indexOf(fontSize)
  fontSize = FONT_SIZES[(index + 1) % FONT_SIZES.length]
  persist(FONT_STORAGE_KEY, String(fontSize))
  refresh()
  return fontSize
}

/**
 * Start watching the shell for theme switches (class/style changes on <html>, skin
 * stylesheet swaps) and OS colour-scheme changes; returns a disposer. Reference
 * counted because both apply() and the workbench keep it alive.
 */
export function initTheme(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
  initCount += 1
  if (initCount === 1) {
    if (typeof window.matchMedia === 'function') {
      try {
        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', refresh)
      } catch {
        mediaQuery = null
      }
    }
    if (typeof MutationObserver !== 'undefined') {
      try {
        observer = new MutationObserver(() => refresh())
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme', 'data-dsh-theme', 'data-dsw-theme'],
        })
        if (document.head) observer.observe(document.head, { childList: true })
      } catch {
        observer = null
      }
    }
    refresh()
  }
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    initCount = Math.max(0, initCount - 1)
    if (initCount > 0) return
    if (mediaQuery && typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', refresh)
    }
    mediaQuery = null
    if (observer) {
      observer.disconnect()
      observer = null
    }
  }
}
