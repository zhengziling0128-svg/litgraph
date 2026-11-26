/**
 * Timeline layout helpers (pure, unit-testable) for the year-axis view.
 *
 * The component owns rendering; this module owns the math: which lane a paper
 * belongs to, the padded year domain, "nice" tick years, and percent positions.
 */
import type { Cluster, GraphNode } from './types'

export interface TimelineNode {
  id: string
  title: string
  year: number | null
  clusterLabel: string
  color?: string
}

export interface YearDomain {
  min: number
  max: number
}

export interface TimelineLane {
  label: string
  color: string
  /** Sorted by year then title. */
  items: TimelineNode[]
}

const FALLBACK_COLORS = [
  '#7fd1ff',
  '#b48cff',
  '#ffb86b',
  '#6be3a4',
  '#ff7f9e',
  '#8bd0ff',
  '#d6a2ff',
  '#f7d774',
]

/** Stable fallback colour for clusters the graph did not colour. */
export function fallbackColor(label: string): string {
  let hash = 0
  for (let index = 0; index < label.length; index += 1) hash = (hash * 31 + label.charCodeAt(index)) % 1000003
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]
}

/** Adapter: graph nodes + cluster palette -> timeline nodes. */
export function buildTimelineNodes(nodes: GraphNode[], clusters: Cluster[]): TimelineNode[] {
  const palette = new Map<string, string>()
  for (const cluster of clusters) palette.set(cluster.id, cluster.color)
  return nodes.map((node) => {
    const clusterLabel = node.clusterLabel || '未分类'
    return {
      id: node.id,
      title: node.title,
      year: typeof node.year === 'number' && Number.isFinite(node.year) ? node.year : null,
      clusterLabel,
      color: palette.get(node.clusterId) ?? fallbackColor(clusterLabel),
    }
  })
}

/** Padded min/max year; a single-year library gets a +-1 domain, empty data a decade. */
export function computeYearDomain(nodes: TimelineNode[], currentYear?: number): YearDomain {
  const thisYear = currentYear ?? new Date().getFullYear()
  const years: number[] = []
  for (const node of nodes) {
    if (node.year !== null && Number.isFinite(node.year)) years.push(node.year)
  }
  if (years.length === 0) return { min: thisYear - 9, max: thisYear }
  let min = Math.min(...years)
  let max = Math.max(...years)
  if (min === max) {
    min -= 1
    max += 1
  } else {
    const pad = Math.max(1, Math.round((max - min) * 0.04))
    min -= pad
    max += pad
  }
  return { min, max }
}

/** "Nice" tick years: 1/2/5/10/20/25/50/100-year steps, at most maxTicks of them. */
export function computeYearTicks(domain: YearDomain, maxTicks = 8): number[] {
  const span = Math.max(1, domain.max - domain.min)
  const rawStep = span / Math.max(1, maxTicks - 1)
  const steps = [1, 2, 5, 10, 20, 25, 50, 100]
  let step = steps[steps.length - 1]
  for (const candidate of steps) {
    if (candidate >= rawStep) {
      step = candidate
      break
    }
  }
  const ticks: number[] = []
  const start = Math.ceil(domain.min / step) * step
  for (let year = start; year <= domain.max; year += step) ticks.push(year)
  return ticks
}

/** 0-100 horizontal position of a year inside the domain. */
export function yearToPercent(year: number, domain: YearDomain): number {
  const span = Math.max(1, domain.max - domain.min)
  const ratio = (year - domain.min) / span
  return Math.min(100, Math.max(0, ratio * 100))
}

/** One lane per cluster label, biggest clusters first, sorted by year. */
export function buildTimelineLanes(nodes: TimelineNode[]): TimelineLane[] {
  const lanes = new Map<string, TimelineLane>()
  for (const node of nodes) {
    if (node.year === null) continue
    const label = node.clusterLabel || '未分类'
    let lane = lanes.get(label)
    if (lane === undefined) {
      lane = { label, color: node.color || fallbackColor(label), items: [] }
      lanes.set(label, lane)
    }
    lane.items.push(node)
  }
  const list = Array.from(lanes.values())
  for (const lane of list) {
    lane.items.sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title, 'zh-Hans-CN'))
  }
  list.sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label, 'zh-Hans-CN'))
  return list
}

export function unknownYearNodes(nodes: TimelineNode[]): TimelineNode[] {
  return nodes.filter((node) => node.year === null)
}

/** Human summary for the header: "共 8 篇 · 1987–2024". */
export function timelineSummary(nodes: TimelineNode[]): string {
  const known = nodes.filter((node) => node.year !== null)
  if (known.length === 0) return '共 ' + nodes.length + ' 篇 · 暂无年份数据'
  let min = known[0].year as number
  let max = min
  for (const node of known) {
    const year = node.year as number
    if (year < min) min = year
    if (year > max) max = year
  }
  const range = min === max ? String(min) : min + '–' + max
  const unknown = nodes.length - known.length
  return '共 ' + nodes.length + ' 篇 · ' + range + (unknown > 0 ? '（另有 ' + unknown + ' 篇年份未知）' : '')
}
