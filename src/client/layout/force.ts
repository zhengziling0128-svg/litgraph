/**
 * Deterministic two-level "sky map" layout. No external dependency.
 *
 * Hierarchy:
 *   galaxy      one per top-level research field (Cluster.group), drawn as a soft nebula
 *   constellation (ClusterCenter)   one per sub-field (Cluster.label), drawn as a small nebula
 *   star        one paper, placed with a sunflower (phyllotaxis) spiral inside its constellation
 *
 * Why not a force simulation: a spring/repulsion solve settles into an even ring or blob
 * and reads as noise once a library has dozens of sub-fields. Packing galaxies by size,
 * then constellations inside their galaxy, then papers as a phyllotaxis rosette gives a
 * composition that looks organic but is fully deterministic, O(n) in the paper count, and
 * stable across re-renders (relayout only rotates the seed).
 */
import type { Cluster, GraphEdge, GraphNode } from '../types'

export const WORLD_WIDTH = 1200
export const WORLD_HEIGHT = 800
const WORLD_CX = WORLD_WIDTH / 2
const WORLD_CY = WORLD_HEIGHT / 2
const PADDING = 78
/** Golden angle: consecutive points of a phyllotaxis spiral. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export interface PositionedNode extends GraphNode {
  x: number
  y: number
  radius: number
}

export interface PositionedEdge {
  id: string
  source: string
  target: string
  kind: GraphEdge['kind']
  weight: number
  path: string
  color: string
  opacity: number
}

export interface ClusterCenter {
  cluster: Cluster
  x: number
  y: number
  count: number
  /** drawn radius of the constellation (used by the nebula glow and the label) */
  radius: number
}

/** One top-level research field: the "galaxy" a group of constellations lives in. */
export interface GalaxyCenter {
  group: string
  label: string
  color: string
  x: number
  y: number
  /** drawn radius of the whole galaxy nebula */
  radius: number
  count: number
}

export interface GraphLayout {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
  byId: Map<string, PositionedNode>
  clusterCenters: ClusterCenter[]
  galaxies: GalaxyCenter[]
  seed: number
}

export const FALLBACK_CLUSTER_COLORS = [
  '#ffd166',
  '#f78c6c',
  '#67e8f9',
  '#a78bfa',
  '#34d399',
  '#f472b6',
  '#facc15',
  '#60a5fa',
]

export function clusterColor(cluster: Cluster | undefined, index: number): string {
  if (cluster && typeof cluster.color === 'string' && cluster.color.trim() !== '') return cluster.color
  return FALLBACK_CLUSTER_COLORS[index % FALLBACK_CLUSTER_COLORS.length]
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Target drawn radius of a constellation: grows with sqrt(count) so the per-node
 * density stays roughly constant from a handful of papers to a thousand.
 */
export function clusterTargetRadius(count: number): number {
  return 20 + Math.sqrt(Math.max(1, count)) * 27
}

function groupOf(cluster: Cluster): string {
  const group = typeof cluster.group === 'string' ? cluster.group.trim() : ''
  if (group !== '') return group
  const label = cluster.label.split('>')[0].trim()
  return label !== '' ? label : '未分类'
}

interface GroupBucket {
  group: string
  clusters: Cluster[]
  count: number
  color: string
  radius: number
  x: number
  y: number
}

/** Radius that comfortably wraps the given constellations (area heuristic + largest lobe). */
function galaxySize(radii: number[]): number {
  if (radii.length === 0) return 60
  let sumSquares = 0
  let maxRadius = 0
  for (const radius of radii) {
    sumSquares += radius * radius
    maxRadius = Math.max(maxRadius, radius)
  }
  return Math.sqrt(sumSquares) * 0.64 + maxRadius * 0.78 + 26
}

/**
 * Place galaxy discs on a golden-angle spiral, skipping positions that would overlap a
 * disc already placed. Deterministic and good enough for a dozen fields.
 */
function packGalaxies(buckets: GroupBucket[]): void {
  const placed: GroupBucket[] = []
  for (const bucket of buckets) {
    if (placed.length === 0) {
      bucket.x = WORLD_CX
      bucket.y = WORLD_CY
      placed.push(bucket)
      continue
    }
    let accepted = false
    for (let step = 1; step <= 2400; step += 1) {
      const angle = step * GOLDEN_ANGLE
      const distance = 16 * Math.sqrt(step)
      const x = WORLD_CX + Math.cos(angle) * distance
      const y = WORLD_CY + Math.sin(angle) * distance * 0.86
      let collides = false
      for (const other of placed) {
        const gap = bucket.radius + other.radius + 64
        if (Math.hypot(x - other.x, y - other.y) < gap) {
          collides = true
          break
        }
      }
      if (collides) continue
      bucket.x = x
      bucket.y = y
      placed.push(bucket)
      accepted = true
      break
    }
    if (!accepted) {
      // extremely dense case: stack outward on the last known radius
      const last = placed[placed.length - 1]
      bucket.x = last.x + last.radius + bucket.radius + 60
      bucket.y = last.y
      placed.push(bucket)
    }
  }
}

/** Push constellation discs apart inside their galaxy so they never overlap. */
function relaxClusters(centers: ClusterCenter[], galaxy: GroupBucket): void {
  const count = centers.length
  if (count === 0) return
  if (count === 1) {
    centers[0].x = galaxy.x
    centers[0].y = galaxy.y
    return
  }
  for (let iteration = 0; iteration < 90; iteration += 1) {
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const a = centers[i]
        const b = centers[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let distance = Math.hypot(dx, dy)
        const minDistance = a.radius + b.radius + 8
        if (distance >= minDistance) continue
        if (distance < 0.01) {
          dx = 1
          dy = 0
          distance = 1
        }
        const push = (minDistance - distance) * 0.5
        const ux = dx / distance
        const uy = dy / distance
        a.x -= ux * push
        a.y -= uy * push
        b.x += ux * push
        b.y += uy * push
      }
    }
    for (const center of centers) {
      const dx = center.x - galaxy.x
      const dy = center.y - galaxy.y
      const distance = Math.hypot(dx, dy)
      const limit = Math.max(0, galaxy.radius - center.radius - 6)
      if (distance > limit && distance > 0.01) {
        const scale = limit / distance
        center.x = galaxy.x + dx * scale
        center.y = galaxy.y + dy * scale
      }
    }
  }
}

function phyllotaxis(count: number, radius: number, phase: number, squash: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  for (let index = 0; index < count; index += 1) {
    if (count === 1) {
      points.push({ x: 0, y: 0 })
      continue
    }
    const fraction = (index + 0.58) / count
    const distance = radius * Math.sqrt(fraction)
    const angle = index * GOLDEN_ANGLE + phase
    points.push({ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * squash })
  }
  return points
}

export interface LayoutInput {
  nodes: GraphNode[]
  edges: GraphEdge[]
  clusters: Cluster[]
  seed?: number
}

const EMPTY_LAYOUT: GraphLayout = {
  nodes: [],
  edges: [],
  byId: new Map(),
  clusterCenters: [],
  galaxies: [],
  seed: 1,
}

export function computeLayout(input: LayoutInput): GraphLayout {
  const { nodes, edges, clusters } = input
  if (nodes.length === 0) return { ...EMPTY_LAYOUT, seed: input.seed ?? 1 }
  const seed = input.seed ?? 7
  const random = mulberry32(seed * 2654435761)
  const colorByCluster = new Map<string, string>()
  clusters.forEach((cluster, index) => colorByCluster.set(cluster.id, clusterColor(cluster, index)))

  const countByCluster = new Map<string, number>()
  for (const node of nodes) countByCluster.set(node.clusterId, (countByCluster.get(node.clusterId) ?? 0) + 1)

  // A cluster that the payload did not describe (old cached graph) still gets a constellation.
  const clusterById = new Map<string, Cluster>()
  for (const cluster of clusters) clusterById.set(cluster.id, cluster)
  for (const node of nodes) {
    if (clusterById.has(node.clusterId)) continue
    const label = node.clusterLabel || '未分类'
    clusterById.set(node.clusterId, {
      id: node.clusterId,
      label,
      color: FALLBACK_CLUSTER_COLORS[clusterById.size % FALLBACK_CLUSTER_COLORS.length],
      group: label.split('>')[0].trim() || '未分类',
    })
  }
  const activeClusters = [...clusterById.values()].filter((cluster) => (countByCluster.get(cluster.id) ?? 0) > 0)

  // 1) group constellations into galaxies
  const bucketByGroup = new Map<string, GroupBucket>()
  for (const cluster of activeClusters) {
    const group = groupOf(cluster)
    let bucket = bucketByGroup.get(group)
    if (!bucket) {
      bucket = { group, clusters: [], count: 0, color: clusterColor(cluster, bucketByGroup.size), radius: 0, x: WORLD_CX, y: WORLD_CY }
      bucketByGroup.set(group, bucket)
    }
    bucket.clusters.push(cluster)
    bucket.count += countByCluster.get(cluster.id) ?? 0
    if (bucket.color === FALLBACK_CLUSTER_COLORS[0] && typeof cluster.color === 'string' && cluster.color.trim() !== '') {
      bucket.color = cluster.color
    }
  }
  const buckets = [...bucketByGroup.values()].sort(
    (a, b) => b.count - a.count || a.group.localeCompare(b.group, 'zh-Hans-CN'),
  )
  for (const bucket of buckets) {
    const radii = bucket.clusters.map((cluster) => clusterTargetRadius(countByCluster.get(cluster.id) ?? 1))
    bucket.radius = galaxySize(radii)
  }
  packGalaxies(buckets)

  // 2) constellation discs inside each galaxy
  const centerByCluster = new Map<string, ClusterCenter>()
  for (const bucket of buckets) {
    const list = bucket.clusters
      .map((cluster) => ({
        cluster,
        x: 0,
        y: 0,
        count: countByCluster.get(cluster.id) ?? 0,
        radius: clusterTargetRadius(countByCluster.get(cluster.id) ?? 1),
      }))
      .sort((a, b) => b.count - a.count || a.cluster.label.localeCompare(b.cluster.label, 'zh-Hans-CN'))
    const phase = random() * Math.PI * 2
    list.forEach((center, index) => {
      if (list.length === 1) {
        center.x = bucket.x
        center.y = bucket.y
        return
      }
      const spread = Math.max(20, bucket.radius - center.radius - 4)
      const distance = spread * Math.sqrt((index + 0.4) / list.length)
      const angle = index * GOLDEN_ANGLE + phase
      center.x = bucket.x + Math.cos(angle) * distance
      center.y = bucket.y + Math.sin(angle) * distance * 0.9
    })
    relaxClusters(list, bucket)
    for (const center of list) centerByCluster.set(center.cluster.id, center)
  }

  // Galaxy discs grow once their constellations settle, so re-pack with the measured
  // radii: two passes are enough for the radii to stabilise, and neighbours stay apart.
  for (let pass = 0; pass < 2; pass += 1) {
    const before = new Map(buckets.map((bucket) => [bucket.group, { x: bucket.x, y: bucket.y }]))
    for (const bucket of buckets) {
      let radius = 40
      for (const cluster of bucket.clusters) {
        const center = centerByCluster.get(cluster.id)
        if (!center) continue
        radius = Math.max(radius, Math.hypot(center.x - bucket.x, center.y - bucket.y) + center.radius)
      }
      bucket.radius = Math.max(bucket.radius, radius + 26)
    }
    packGalaxies(buckets)
    for (const bucket of buckets) {
      const previous = before.get(bucket.group)
      if (!previous) continue
      const dx = bucket.x - previous.x
      const dy = bucket.y - previous.y
      if (dx === 0 && dy === 0) continue
      for (const cluster of bucket.clusters) {
        const center = centerByCluster.get(cluster.id)
        if (!center) continue
        center.x += dx
        center.y += dy
      }
    }
  }

  // 3) papers as phyllotaxis rosettes inside their constellation
  const densityBoost = clamp(Math.sqrt(nodes.length / 240), 1, 1.8)
  const positionedNodes: PositionedNode[] = nodes.map((node) => {
    const center = centerByCluster.get(node.clusterId)
    const radius = clamp((3.6 + Math.sqrt(Math.max(0, node.degree) + 1) * 1.5) * densityBoost, 3, 16)
    if (!center) {
      return { ...node, x: WORLD_CX, y: WORLD_CY, radius }
    }
    const phase = ((node.clusterId.charCodeAt(1) ?? 7) % 17) * 0.37
    const angle = (node.degree * 0.9 + phase) % (Math.PI * 2)
    const distance = center.radius * 0.86 * Math.sqrt(random())
    return {
      ...node,
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance * 0.94,
      radius,
    }
  })
  const byId = new Map(positionedNodes.map((node) => [node.id, node]))

  // 4) fit everything into the visible sky box (shrink only, never magnify a small library)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const bucket of buckets) {
    minX = Math.min(minX, bucket.x - bucket.radius)
    maxX = Math.max(maxX, bucket.x + bucket.radius)
    minY = Math.min(minY, bucket.y - bucket.radius)
    maxY = Math.max(maxY, bucket.y + bucket.radius)
  }
  const skyWidth = Math.max(1, maxX - minX)
  const skyHeight = Math.max(1, maxY - minY)
  const fit = Math.min(1, (WORLD_WIDTH - PADDING * 2) / skyWidth, (WORLD_HEIGHT - PADDING * 2) / skyHeight)
  minX = minX * fit
  minY = minY * fit
  const offsetX = WORLD_CX - ((minX + maxX * fit) / 2)
  const offsetY = WORLD_CY - ((minY + maxY * fit) / 2)

  const positioned = positionedNodes.map((node) => ({
    ...node,
    x: Math.round((node.x * fit + offsetX) * 10) / 10,
    y: Math.round((node.y * fit + offsetY) * 10) / 10,
  }))
  const finalById = new Map(positioned.map((node) => [node.id, node]))

  // 5) categories -> constellation centres (recomputed from the final node positions)
  const clusterCenters: ClusterCenter[] = []
  for (const bucket of buckets) {
    for (const cluster of bucket.clusters) {
      const members = positioned.filter((node) => node.clusterId === cluster.id)
      if (members.length === 0) continue
      const x = members.reduce((sum, node) => sum + node.x, 0) / members.length
      const y = members.reduce((sum, node) => sum + node.y, 0) / members.length
      let radius = 34
      for (const node of members) radius = Math.max(radius, Math.hypot(node.x - x, node.y - y) + node.radius + 6)
      clusterCenters.push({
        cluster,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        count: members.length,
        radius: Math.round(radius),
      })
    }
  }

  // 6) galaxies -> bounding discs of their constellations (drawn as the largest nebula)
  const galaxies: GalaxyCenter[] = buckets.map((bucket) => {
    const centers = clusterCenters.filter((center) => groupOf(center.cluster) === bucket.group)
    if (centers.length === 0) {
      return {
        group: bucket.group,
        label: bucket.group,
        color: bucket.color,
        x: Math.round(bucket.x * fit + offsetX),
        y: Math.round(bucket.y * fit + offsetY),
        radius: Math.round(bucket.radius * fit),
        count: bucket.count,
      }
    }
    const total = centers.reduce((sum, center) => sum + center.count, 0)
    let x = 0
    let y = 0
    for (const center of centers) {
      x += center.x * center.count
      y += center.y * center.count
    }
    x /= Math.max(1, total)
    y /= Math.max(1, total)
    let radius = 40
    for (const center of centers) radius = Math.max(radius, Math.hypot(center.x - x, center.y - y) + center.radius)
    return {
      group: bucket.group,
      label: bucket.group,
      color: bucket.color,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      radius: Math.round(radius + 22),
      count: bucket.count,
    }
  })

  const positionedEdges: PositionedEdge[] = edges
    .map((edge) => {
      const source = finalById.get(edge.source)
      const target = finalById.get(edge.target)
      if (!source || !target) return null
      const dx = target.x - source.x
      const dy = target.y - source.y
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      // gentle curvature, alternating sides by a stable hash of the pair
      const hash = (edge.source.charCodeAt(0) + edge.target.charCodeAt(0) + edge.source.length) % 2
      const bend = (hash === 0 ? 1 : -1) * distance * 0.1
      const mx = (source.x + target.x) / 2 - (dy / distance) * bend
      const my = (source.y + target.y) / 2 + (dx / distance) * bend
      const color = colorByCluster.get(source.clusterId) ?? FALLBACK_CLUSTER_COLORS[0]
      return {
        id: edge.source + '→' + edge.target + ':' + edge.kind,
        source: edge.source,
        target: edge.target,
        kind: edge.kind,
        weight: edge.weight,
        path: 'M' + source.x + ',' + source.y + ' Q' + mx + ',' + my + ' ' + target.x + ',' + target.y,
        color,
        opacity: edge.kind === 'category' ? 0.14 + Math.min(0.24, edge.weight * 0.18) : 0.09 + Math.min(0.15, edge.weight * 0.11),
      }
    })
    .filter((edge): edge is PositionedEdge => edge !== null)

  return { nodes: positioned, edges: positionedEdges, byId: finalById, clusterCenters, galaxies, seed }
}

export interface Star {
  x: number
  y: number
  radius: number
  opacity: number
  delay: number
}

/** Deterministic star field for the empty space behind the constellations. */
export function makeStars(seed: number, count: number): Star[] {
  const random = mulberry32((seed + 1013) * 7919)
  const stars: Star[] = []
  for (let index = 0; index < count; index += 1) {
    const bright = random()
    stars.push({
      x: Math.round(random() * WORLD_WIDTH * 10) / 10,
      y: Math.round(random() * WORLD_HEIGHT * 10) / 10,
      radius: bright > 0.94 ? 1.9 : bright > 0.72 ? 1.15 : 0.7,
      opacity: 0.14 + bright * 0.55,
      delay: Math.round(random() * 6000),
    })
  }
  return stars
}
