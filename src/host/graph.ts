/**
 * Graph projection: clusters, edges, degrees — no embeddings.
 *
 * Clusters are derived from the *second* level of the LLM-assigned category path
 * (e.g. 机械工程 > 故障诊断), so a broad field with 24 papers splits into several
 * constellations instead of one oversized blob. Every cluster keeps its top-level
 * field as `group`, which the sky map uses as the galaxy layer (one nebula per
 * research field, one constellation per sub-field).
 *
 * Edge weights are keyword Jaccard similarity inside a cluster, category-path
 * chains, a light hub between sub-fields of the same field, plus explicit LLM
 * relation hints (paper.relations) as high-weight cross-cluster edges.
 */
import type { Cluster, GraphEdge, GraphNode, Paper, PaperRelation } from './types.js'

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  clusters: Cluster[]
}

/** One colour family per research field; sub-fields get shades of the family hue. */
const FAMILY_PALETTE = [
  '#ffd166', '#f78c6c', '#67e8f9', '#a78bfa', '#34d399', '#f472b6',
  '#facc15', '#60a5fa', '#fb923c', '#4ade80', '#e879f9', '#2dd4bf',
]

/** Shade multipliers applied to the family colour, in order, for sub-fields. */
const SHADES = [0, 0.26, -0.2, 0.42, -0.34, 0.14, -0.1, 0.36]

const UNCLASSIFIED = '未分类'
const DEFAULT_DEPTH = 2

function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function hexToRgb(hex: string): [number, number, number] | null {
  const value = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(value)) return null
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
}

function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')
}

/** Blend a hex colour toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (rgb === null) return hex
  const target: [number, number, number] = amount >= 0 ? [255, 255, 255] : [12, 16, 24]
  const t = Math.min(1, Math.abs(amount))
  return rgbToHex([rgb[0] + (target[0] - rgb[0]) * t, rgb[1] + (target[1] - rgb[1]) * t, rgb[2] + (target[2] - rgb[2]) * t])
}

export interface ClusterKey {
  /** Full cluster path, e.g. "机械工程 > 故障诊断". */
  path: string
  /** Short display name (last path segment). */
  label: string
  /** Top-level research field, e.g. "机械工程". */
  group: string
}

/**
 * Cluster key of one paper: the first category path truncated to `depth` segments.
 * Papers without any category land in the 未分类 constellation.
 */
export function categoryCluster(paper: Paper, depth: number = DEFAULT_DEPTH): ClusterKey {
  const safeDepth = Math.max(1, Math.min(3, Math.round(depth)))
  for (const category of paper.categories) {
    const segments = category
      .split('>')
      .map((segment) => segment.trim())
      .filter((segment) => segment !== '')
    if (segments.length === 0) continue
    const used = segments.slice(0, Math.min(safeDepth, segments.length))
    return {
      path: used.join(' > '),
      label: used[used.length - 1],
      group: used[0],
    }
  }
  return { path: UNCLASSIFIED, label: UNCLASSIFIED, group: UNCLASSIFIED }
}

/** First segment of the first category (kept for compatibility with older callers). */
export function categoryTop(paper: Paper): string {
  return categoryCluster(paper, 1).group
}

function clusterIdFor(label: string): string {
  return 'c' + fnv1a(label).toString(36)
}

function keywordSet(paper: Paper): string[] {
  const set = new Set<string>()
  for (const keyword of paper.keywords) {
    const normalized = keyword
      .toLowerCase()
      .replace(/[^\p{L}\p{N}+#./ -]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (normalized.length >= 2) set.add(normalized)
  }
  return [...set]
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  let intersection = 0
  for (const value of b) if (setA.has(value)) intersection += 1
  const union = a.length + b.length - intersection
  return union > 0 ? intersection / union : 0
}

interface PendingEdge {
  source: string
  target: string
  kind: 'category' | 'similar'
  weight: number
}

export function buildGraph(papers: Paper[], depth: number = DEFAULT_DEPTH): GraphData {
  const keyByPaper = new Map<string, ClusterKey>()
  for (const paper of papers) keyByPaper.set(paper.id, categoryCluster(paper, depth))

  const countByPath = new Map<string, number>()
  const groupByPath = new Map<string, string>()
  for (const key of keyByPaper.values()) {
    countByPath.set(key.path, (countByPath.get(key.path) ?? 0) + 1)
    groupByPath.set(key.path, key.group)
  }
  const labelByPath = new Map<string, string>()
  for (const key of keyByPaper.values()) labelByPath.set(key.path, key.label)

  const countByGroup = new Map<string, number>()
  for (const [path, count] of countByPath) {
    const group = groupByPath.get(path) ?? UNCLASSIFIED
    countByGroup.set(group, (countByGroup.get(group) ?? 0) + count)
  }
  const groups = [...countByGroup.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([group]) => group)
  const groupIndex = new Map(groups.map((group, index) => [group, index]))

  const paths = [...countByPath.keys()].sort((a, b) => {
    const groupA = groupIndex.get(groupByPath.get(a) ?? UNCLASSIFIED) ?? 0
    const groupB = groupIndex.get(groupByPath.get(b) ?? UNCLASSIFIED) ?? 0
    if (groupA !== groupB) return groupA - groupB
    return (countByPath.get(b) ?? 0) - (countByPath.get(a) ?? 0) || a.localeCompare(b, 'zh-Hans-CN')
  })

  const colorByPath = new Map<string, string>()
  const shadeCursor = new Map<string, number>()
  for (const path of paths) {
    const group = groupByPath.get(path) ?? UNCLASSIFIED
    const family = FAMILY_PALETTE[(groupIndex.get(group) ?? 0) % FAMILY_PALETTE.length]
    const cursor = shadeCursor.get(group) ?? 0
    shadeCursor.set(group, cursor + 1)
    colorByPath.set(path, shade(family, SHADES[cursor % SHADES.length]))
  }

  const nodeById = new Map<string, GraphNode>()
  const nodes: GraphNode[] = papers.map((paper) => {
    const key = keyByPaper.get(paper.id) ?? categoryCluster(paper, depth)
    const node: GraphNode = {
      id: paper.id,
      title: paper.title,
      clusterId: clusterIdFor(key.path),
      clusterLabel: key.label,
      categories: paper.categories,
      year: paper.year,
      status: paper.status,
      degree: 0,
    }
    nodeById.set(node.id, node)
    return node
  })

  const edgeByKey = new Map<string, PendingEdge>()
  const addEdge = (source: string, target: string, kind: 'category' | 'similar', weight: number): void => {
    if (source === target || !nodeById.has(source) || !nodeById.has(target)) return
    const [first, second] = source < target ? [source, target] : [target, source]
    const key = first + '|' + second + '|' + kind
    const existing = edgeByKey.get(key)
    if (existing === undefined) edgeByKey.set(key, { source: first, target: second, kind, weight })
    else if (weight > existing.weight) existing.weight = weight
  }

  const byPath = new Map<string, Paper[]>()
  for (const paper of papers) {
    const key = keyByPaper.get(paper.id)
    if (!key) continue
    if (!byPath.has(key.path)) byPath.set(key.path, [])
    byPath.get(key.path)!.push(paper)
  }

  // 1) category edges: papers sharing the exact cluster path form a chain
  for (const list of byPath.values()) {
    for (let index = 0; index + 1 < list.length; index += 1) addEdge(list[index].id, list[index + 1].id, 'category', 1)
  }

  // 2) keyword Jaccard inside a cluster, top-2 neighbours per node
  const keywordsById = new Map<string, string[]>()
  for (const paper of papers) keywordsById.set(paper.id, keywordSet(paper))
  const SIMILAR_THRESHOLD = 0.2
  const candidates = new Map<string, Array<{ other: string; score: number }>>()
  for (const list of byPath.values()) {
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i]
      const keywordsA = keywordsById.get(a.id) ?? []
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j]
        const score = jaccard(keywordsA, keywordsById.get(b.id) ?? [])
        if (score < SIMILAR_THRESHOLD) continue
        if (!candidates.has(a.id)) candidates.set(a.id, [])
        if (!candidates.has(b.id)) candidates.set(b.id, [])
        candidates.get(a.id)!.push({ other: b.id, score })
        candidates.get(b.id)!.push({ other: a.id, score })
      }
    }
  }
  for (const [id, list] of candidates) {
    list.sort((a, b) => b.score - a.score)
    for (const entry of list.slice(0, 2)) addEdge(id, entry.other, 'similar', Math.round(entry.score * 100) / 100)
  }

  // 3) explicit LLM relation hints (cross-cluster), weight 0.9
  for (const paper of papers) {
    const relations: PaperRelation[] | undefined = paper.relations
    if (!Array.isArray(relations)) continue
    for (const relation of relations) {
      addEdge(paper.id, relation.paperId, 'similar', 0.9)
    }
  }

  // 4) sub-field hub: bridge sibling constellations of one field so galaxies stay connected
  const pathsByGroup = new Map<string, string[]>()
  for (const path of paths) {
    const group = groupByPath.get(path) ?? UNCLASSIFIED
    if (!pathsByGroup.has(group)) pathsByGroup.set(group, [])
    pathsByGroup.get(group)!.push(path)
  }
  for (const list of pathsByGroup.values()) {
    if (list.length < 2) continue
    const representatives = list.map((path) => byPath.get(path)?.[0]).filter((paper): paper is Paper => paper !== undefined)
    for (let index = 0; index + 1 < representatives.length; index += 1) {
      addEdge(representatives[index].id, representatives[index + 1].id, 'category', 0.35)
    }
  }

  // 5) fallback chain so every node in a cluster has at least one edge
  const degreeCounter = new Map<string, number>()
  for (const edge of edgeByKey.values()) {
    degreeCounter.set(edge.source, (degreeCounter.get(edge.source) ?? 0) + 1)
    degreeCounter.set(edge.target, (degreeCounter.get(edge.target) ?? 0) + 1)
  }
  for (const list of byPath.values()) {
    for (let index = 0; index < list.length; index += 1) {
      const current = list[index]
      if ((degreeCounter.get(current.id) ?? 0) > 0) continue
      const next = list[(index + 1) % list.length]
      if (next.id !== current.id) addEdge(current.id, next.id, 'similar', 0.25)
    }
  }

  const edges: GraphEdge[] = [...edgeByKey.values()]
  for (const node of nodes) node.degree = degreeCounter.get(node.id) ?? 0
  const clusters: Cluster[] = paths.map((path) => ({
    id: clusterIdFor(path),
    label: labelByPath.get(path) ?? path,
    color: colorByPath.get(path) ?? FAMILY_PALETTE[0],
    group: groupByPath.get(path) ?? UNCLASSIFIED,
    path,
  }))
  return { nodes, edges, clusters }
}
