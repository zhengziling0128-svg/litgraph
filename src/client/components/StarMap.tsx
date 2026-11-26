/**
 * The star map: an SVG viewport over the force layout.
 *
 * Interaction model
 *   - wheel            zoom about the cursor (native non-passive listener so preventDefault works)
 *   - pointer drag     pan (pointer capture on the svg)
 *   - click node       select (detail panel), click empty space keeps the selection
 *   - hover node       tooltip with title / year / categories
 *   - search matches   matching nodes stay lit, everything else dims
 *   - focus token      (from search or the library) re-centers the viewport on a node
 */
import * as React from 'react'
import type { Cluster, GraphNode } from '../types'
import type { ClusterCenter, GalaxyCenter, GraphLayout, PositionedNode, Star } from '../layout/force'
import { clusterColor, WORLD_WIDTH } from '../layout/force'

const MIN_SCALE = 0.08
const MAX_SCALE = 4

export interface StarMapProps {
  layout: GraphLayout
  clusters: Cluster[]
  stars: Star[]
  selectedId: string | null
  matches: Set<string> | null
  focus: { id: string; token: number } | null
  loading: boolean
  error: string | null
  onSelect: (id: string | null) => void
  onFit: () => void
  onRelayout: () => void
  /** Resolved palette; light mode tints the host cluster colours toward ink. */
  theme?: 'dark' | 'light'
  /** Node label size in user units (follows the font step). */
  labelFontSize?: number
  /** Cluster caption size in user units (follows the font step). */
  clusterLabelSize?: number
  children?: React.ReactNode
}

interface Viewport {
  scale: number
  x: number
  y: number
}

const INITIAL_VIEW: Viewport = { scale: 1, x: 0, y: 0 }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function nodeColor(node: PositionedNode, clusters: Cluster[], colorMap: Map<string, string>): string {
  const cached = colorMap.get(node.clusterId)
  if (cached) return cached
  return clusterColor(undefined, 0)
}

function buildColorMap(clusters: Cluster[]): Map<string, string> {
  const map = new Map<string, string>()
  clusters.forEach((cluster, index) => map.set(cluster.id, clusterColor(cluster, index)))
  return map
}

interface LabelPlacement {
  x: number
  y: number
  anchor: 'start' | 'end' | 'middle'
  /** Screen-space box of a placed caption, reused as an obstacle for node labels. */
  rect?: Rect
}

interface Rect {
  x1: number
  y1: number
  x2: number
  y2: number
}

function textWidth(text: string, fontSize: number): number {
  let width = 0
  for (let index = 0; index < text.length; index += 1) {
    width += text.charCodeAt(index) > 255 ? fontSize : fontSize * 0.56
  }
  return width
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
}

const DEFAULT_LABEL_FONT_SIZE = 12.5
const DEFAULT_CLUSTER_FONT_SIZE = 13
const LABEL_TEXT = 22

type Rgb = [number, number, number]

/** Ink used by the light palette (its --lg-text), the mixing target for cluster hues. */
const LIGHT_INK: Rgb = [27, 37, 55]

function hexToRgb(color: string): Rgb | null {
  const text = color.trim()
  if (text.charAt(0) !== '#') return null
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
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255]
}

function mixRgb(from: Rgb, to: Rgb, amount: number): string {
  const mix = (index: number): number => Math.round(from[index] + (to[index] - from[index]) * amount)
  return 'rgb(' + mix(0) + ', ' + mix(1) + ', ' + mix(2) + ')'
}

/**
 * Cluster hues come from the host and are tuned for the dark canvas. On the paper
 * palette they are mixed toward ink so dots, edges and captions keep contrast; the
 * dark palette leaves the host colours untouched.
 */
function themeTone(color: string, theme: 'dark' | 'light', amount: number): string {
  if (theme !== 'light') return color
  const rgb = hexToRgb(color)
  return rgb ? mixRgb(rgb, LIGHT_INK, amount) : color
}

/**
 * Greedy label placement: a label first tries the outward side of its constellation,
 * then the opposite side, then vertical lanes, skipping spots that would overlap an
 * already placed label, a cluster caption or another node's dot. Dense constellations
 * therefore stay legible without zooming in.
 */
export function placeNodeLabels(
  nodes: PositionedNode[],
  options: {
    centers: ClusterCenter[]
    selectedId: string | null
    hoveredId: string | null
    showAll: boolean
    /** Minimum degree that still earns a label when not every node is labelled. */
    degreeMin?: number
    /** Hard cap on placed labels; keeps a 1000-paper map from becoming a text soup. */
    limit?: number
    viewport?: { scale: number; x: number; y: number }
    size?: { width: number; height: number }
    labelFontSize?: number
    clusterFontSize?: number
    /** Labels for these ids are placed even if they cannot avoid overlapping (search hits). */
    forceIds?: Set<string> | null
    /** Extra world-space obstacles (e.g. the actual caption boxes drawn in the HTML overlay). */
    extraReserved?: Rect[]
  },
): Map<string, LabelPlacement> {
  const viewport = options.viewport ?? { scale: 1, x: 0, y: 0 }
  const view = options.size ?? { width: WORLD_WIDTH, height: WORLD_HEIGHT }
  const labelFontSize = options.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE
  const clusterFontSize = options.clusterFontSize ?? DEFAULT_CLUSTER_FONT_SIZE
  const placements = new Map<string, LabelPlacement>()
  const reserved: Rect[] = []

  if (options.extraReserved) reserved.push(...options.extraReserved)
  for (const node of nodes) {
    reserved.push({
      x1: node.x - node.radius - 2,
      y1: node.y - node.radius - 2,
      x2: node.x + node.radius + 2,
      y2: node.y + node.radius + 2,
    })
  }

  const degreeMin = options.degreeMin ?? 6
  const limit = options.limit ?? 400
  const candidates = nodes
    .filter(
      (node) =>
        options.showAll ||
        node.degree >= degreeMin ||
        node.id === options.selectedId ||
        node.id === options.hoveredId,
    )
    .slice()
    .sort((a, b) => {
      if (a.id === options.selectedId) return -1
      if (b.id === options.selectedId) return 1
      if (a.id === options.hoveredId) return -1
      if (b.id === options.hoveredId) return 1
      return b.degree - a.degree || a.id.localeCompare(b.id)
    })

  const centerByCluster = new Map(options.centers.map((center) => [center.cluster.id, center]))

  const forceIds = options.forceIds ?? null

  let placed = 0
  for (const node of candidates) {
    if (placed >= limit) break
    const forced = node.id === options.selectedId || node.id === options.hoveredId || (forceIds !== null && forceIds.has(node.id))
    const center = centerByCluster.get(node.clusterId)
    const screenX = node.x * viewport.scale + viewport.x
    const nearRightEdge = screenX > view.width * 0.72
    const nearLeftEdge = screenX < view.width * 0.28
    const outward = nearRightEdge ? false : nearLeftEdge ? true : center ? node.x >= center.x : node.x < WORLD_WIDTH * 0.68
    const text = truncate(node.title, LABEL_TEXT)
    const width = textWidth(text, labelFontSize) + 14
    const laneScale = labelFontSize / DEFAULT_LABEL_FONT_SIZE
    const lanes = [3.4, -8.2, 15, -19.5, 26.5].map((lane) => lane * laneScale)
    const sides: Array<'start' | 'end'> = outward ? ['start', 'end'] : ['end', 'start']
    let best: { placement: LabelPlacement; rect: Rect; overlapArea: number } | null = null
    for (const side of sides) {
      for (const lane of lanes) {
        const x = side === 'start' ? node.x + node.radius + 5 : node.x - node.radius - 5
        const y = node.y + lane
        const rect: Rect =
          side === 'start'
            ? { x1: x, y1: y - labelFontSize * 0.9, x2: x + width, y2: y + labelFontSize * 0.34 }
            : { x1: x - width, y1: y - labelFontSize * 0.9, x2: x, y2: y + labelFontSize * 0.34 }
        // labels that spill past the visible SVG viewport get clipped, so count the spill as overlap
        const screenX1 = rect.x1 * viewport.scale + viewport.x
        const screenX2 = rect.x2 * viewport.scale + viewport.x
        const screenY1 = rect.y1 * viewport.scale + viewport.y
        const screenY2 = rect.y2 * viewport.scale + viewport.y
        const spill =
          Math.max(0, 8 - screenX1) +
          Math.max(0, screenX2 - (view.width - 8)) +
          Math.max(0, 8 - screenY1) +
          Math.max(0, screenY2 - (view.height - 8))
        let overlapArea = spill * 60
        for (const taken of reserved) {
          if (!overlaps(rect, taken)) continue
          const w = Math.min(rect.x2, taken.x2) - Math.max(rect.x1, taken.x1)
          const h = Math.min(rect.y2, taken.y2) - Math.max(rect.y1, taken.y1)
          overlapArea += Math.max(0, w) * Math.max(0, h)
        }
        if (overlapArea === 0) {
          best = { placement: { x, y, anchor: side }, rect, overlapArea: 0 }
          break
        }
        if (!best || overlapArea < best.overlapArea) best = { placement: { x, y, anchor: side }, rect, overlapArea }
      }
      if (best && best.overlapArea === 0) break
    }
    if (!best) continue
    // A label that cannot fit anywhere would just add text soup; hover / selection still reveal it.
    if (best.overlapArea > 0 && !forced) continue
    reserved.push(best.rect)
    placements.set(node.id, best.placement)
    placed += 1
  }

  return placements
}

/**
 * Cluster captions live in screen space (HTML overlay), so they are laid out here
 * rather than in SVG: each constellation title tries above / below / right / left of
 * its nebula and takes the first spot that neither leaves the viewport nor touches a
 * galaxy title or an already placed caption. Titles that cannot fit are dropped; the
 * legend still names every colour.
 */
export interface GalaxyCaptionPlacement {
  x: number
  y: number
  position: 'above' | 'below'
  rect: Rect
}

/**
 * Greedy screen-space placement for the domain (galaxy) captions. Large libraries pack
 * several galaxies side by side, where captions wider than the gap would otherwise collide;
 * each caption tries above/below the nebula with a few horizontal nudges and is dropped only
 * when nothing fits (the legend still names every domain).
 */
export function placeGalaxyCaptions(
  galaxies: GalaxyCenter[],
  options: {
    viewport?: { scale: number; x: number; y: number }
    size?: { width: number; height: number }
    fontSize?: number
  },
): Map<string, GalaxyCaptionPlacement> {
  const viewport = options.viewport ?? { scale: 1, x: 0, y: 0 }
  const view = options.size ?? { width: WORLD_WIDTH, height: WORLD_HEIGHT }
  const font = Math.max(13, options.fontSize ?? DEFAULT_CLUSTER_FONT_SIZE + 3)
  const lineHeight = font * 1.15
  const reserved: Rect[] = []
  const placements = new Map<string, GalaxyCaptionPlacement>()

  const fits = (rect: Rect): boolean => {
    if (rect.x1 < 4 || rect.x2 > view.width - 4 || rect.y1 < 4 || rect.y2 > view.height - 4) return false
    for (const other of reserved) if (overlaps(rect, other)) return false
    return true
  }

  const ordered = galaxies.slice().sort((a, b) => b.count - a.count)
  for (const galaxy of ordered) {
    const caption = galaxy.label + ' · ' + galaxy.count
    const width = textWidth(caption, font) + 10
    const cx = galaxy.x * viewport.scale + viewport.x
    const cy = galaxy.y * viewport.scale + viewport.y
    const radius = Math.max(16, galaxy.radius) * viewport.scale
    const nudges = [0, width / 2 + 8, -(width / 2 + 8), width + 16, -(width + 16)]
    const candidates: Array<{ x: number; y: number; position: 'above' | 'below'; rect: Rect }> = []
    for (const dx of nudges) {
      const x = cx + dx
      const bottom = cy - radius - 6
      candidates.push({
        x,
        y: bottom,
        position: 'above',
        rect: { x1: x - width / 2, y1: bottom - lineHeight, x2: x + width / 2, y2: bottom },
      })
      const top = cy + radius + 8
      candidates.push({
        x,
        y: top,
        position: 'below',
        rect: { x1: x - width / 2, y1: top, x2: x + width / 2, y2: top + lineHeight },
      })
    }
    const choice = candidates.find((candidate) => fits(candidate.rect))
    if (!choice) continue
    reserved.push(choice.rect)
    placements.set(galaxy.group, { x: choice.x, y: choice.y, position: choice.position, rect: choice.rect })
  }
  return placements
}

export function placeClusterCaptions(
  centers: ClusterCenter[],
  galaxies: GalaxyCenter[],
  options: {
    viewport?: { scale: number; x: number; y: number }
    size?: { width: number; height: number }
    clusterFontSize?: number
    galaxyFontSize?: number
    /** Screen-space boxes (for example galaxy captions) that cluster captions must avoid. */
    reserved?: Rect[]
  },
): Map<string, LabelPlacement> {
  const viewport = options.viewport ?? { scale: 1, x: 0, y: 0 }
  const view = options.size ?? { width: WORLD_WIDTH, height: WORLD_HEIGHT }
  const clusterFont = Math.max(10, (options.clusterFontSize ?? DEFAULT_CLUSTER_FONT_SIZE) - 1)
  const galaxyFont = Math.max(13, (options.galaxyFontSize ?? DEFAULT_CLUSTER_FONT_SIZE) + 3)
  const reserved: Rect[] = []
  const placements = new Map<string, LabelPlacement>()

  const fits = (rect: Rect): boolean => {
    if (rect.x1 < 4 || rect.x2 > view.width - 4 || rect.y1 < 4 || rect.y2 > view.height - 4) return false
    for (const other of reserved) if (overlaps(rect, other)) return false
    return true
  }

  if (options.reserved) {
    reserved.push(...options.reserved)
  } else {
    for (const galaxy of galaxies) {
      const caption = galaxy.label + ' · ' + galaxy.count
      const width = textWidth(caption, galaxyFont) + 10
      const bottom = (galaxy.y - galaxy.radius) * viewport.scale + viewport.y - 6
      reserved.push({
        x1: galaxy.x * viewport.scale + viewport.x - width / 2,
        y1: bottom - galaxyFont * 1.15,
        x2: galaxy.x * viewport.scale + viewport.x + width / 2,
        y2: bottom,
      })
    }
  }

  const ordered = centers.slice().sort((a, b) => b.count - a.count)
  for (const center of ordered) {
    const radius = Math.max(12, center.radius) * viewport.scale
    const cx = center.x * viewport.scale + viewport.x
    const cy = center.y * viewport.scale + viewport.y
    const caption = center.cluster.label + ' · ' + center.count
    const width = textWidth(caption, clusterFont) + 8
    const height = clusterFont + 3
    // Every candidate is a centre point: the caption is drawn with translate(-50%,-50%),
    // so its obstacle box is exactly the box reserved here (plus a small padding).
    const halfWidth = width / 2 + 5
    const halfHeight = height / 2 + 3
    const candidates: Array<{ x: number; y: number; rect: Rect }> = [
      { x: cx, y: cy - radius - 6 - halfHeight, rect: { x1: cx - halfWidth, y1: cy - radius - 6 - halfHeight * 2, x2: cx + halfWidth, y2: cy - radius - 6 } },
      { x: cx, y: cy + radius + 6 + halfHeight, rect: { x1: cx - halfWidth, y1: cy + radius + 6, x2: cx + halfWidth, y2: cy + radius + 6 + halfHeight * 2 } },
      { x: cx + radius + 8 + halfWidth, y: cy, rect: { x1: cx + radius + 8, y1: cy - halfHeight, x2: cx + radius + 8 + halfWidth * 2, y2: cy + halfHeight } },
      { x: cx - radius - 8 - halfWidth, y: cy, rect: { x1: cx - radius - 8 - halfWidth * 2, y1: cy - halfHeight, x2: cx - radius - 8, y2: cy + halfHeight } },
    ]
    const choice = candidates.find((candidate) => fits(candidate.rect))
    if (!choice) continue
    reserved.push(choice.rect)
    placements.set(center.cluster.id, { x: choice.x, y: choice.y, anchor: 'middle', rect: choice.rect })
  }
  return placements
}

export function StarMap(props: StarMapProps) {
  const { layout, clusters, stars, selectedId, matches, focus, loading, error, onSelect, onFit, onRelayout, children } = props
  const theme = props.theme ?? 'dark'
  const labelFontSize = props.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE
  const clusterLabelSize = props.clusterLabelSize ?? DEFAULT_CLUSTER_FONT_SIZE
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const svgRef = React.useRef<SVGSVGElement | null>(null)
  const [viewport, setViewport] = React.useState<Viewport>(INITIAL_VIEW)
  const [size, setSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const [tooltip, setTooltip] = React.useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const dragState = React.useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)
  const colorMap = React.useMemo(() => buildColorMap(clusters), [clusters])

  // track the container size without depending on ResizeObserver availability
  React.useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // native wheel handler: React's onWheel is passive, so it cannot preventDefault
  React.useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      setViewport((current) => {
        const factor = Math.exp(-event.deltaY * 0.0016)
        const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE)
        const ratio = scale / current.scale
        // keep the world point under the cursor fixed
        return {
          scale,
          x: px - (px - current.x) * ratio,
          y: py - (py - current.y) * ratio,
        }
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  // fit-to-view whenever the panel is measured or the layout changes (first import,
  // re-analysis, relayout) so a constellation is never half outside the panel
  const fittedRef = React.useRef<string>('')
  React.useEffect(() => {
    if (size.width === 0 || size.height === 0 || layout.nodes.length === 0) return
    const key =
      size.width +
      'x' +
      size.height +
      ':' +
      layout.seed +
      ':' +
      layout.nodes.length +
      ':' +
      layout.clusterCenters.length +
      ':' +
      labelFontSize +
      ':' +
      clusterLabelSize
    if (fittedRef.current === key) return
    fittedRef.current = key
    fitToView(undefined, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, layout, labelFontSize, clusterLabelSize])

  function fitToView(currentScale?: number, force = false) {
    if (layout.nodes.length === 0 || size.width === 0 || size.height === 0) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const node of layout.nodes) {
      minX = Math.min(minX, node.x - node.radius)
      maxX = Math.max(maxX, node.x + node.radius)
      minY = Math.min(minY, node.y - node.radius)
      maxY = Math.max(maxY, node.y + node.radius)
    }
    const pad = 110
    const scale = clamp(Math.min((size.width - pad * 2) / Math.max(1, maxX - minX), (size.height - pad * 2) / Math.max(1, maxY - minY)), MIN_SCALE, 1.6)
    const x = size.width / 2 - ((minX + maxX) / 2) * scale
    const y = size.height / 2 - ((minY + maxY) / 2) * scale
    setViewport({ scale: force ? scale : (currentScale ?? scale), x, y })
  }

  // re-center whenever the parent asks for a focus target
  React.useEffect(() => {
    if (!focus) return
    const node = layout.byId.get(focus.id)
    if (!node || size.width === 0 || size.height === 0) return
    setViewport((current) => {
      const scale = Math.max(current.scale, 1.15)
      return { scale, x: size.width / 2 - node.x * scale, y: size.height / 2 - node.y * scale }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus ? focus.token : 0, layout, size.width, size.height])

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    const target = event.target as Element | null
    if (target && target.closest && target.closest('[data-node-hit="true"]')) return
    dragState.current = { startX: event.clientX, startY: event.clientY, originX: viewport.x, originY: viewport.y, moved: false }
    setDragging(true)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* jsdom / older browsers */
    }
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragState.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    setViewport((current) => ({ ...current, x: drag.originX + dx, y: drag.originY + dy }))
  }

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragState.current
    dragState.current = null
    setDragging(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    if (drag && !drag.moved) onSelect(null)
  }

  const showTooltip = React.useCallback((node: PositionedNode, event: React.MouseEvent) => {
    const element = containerRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    setHoveredId(node.id)
    setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  }, [])

  const clearHover = React.useCallback(() => {
    setHoveredId(null)
    setTooltip(null)
  }, [])

  const handleNodeClick = React.useCallback(
    (node: PositionedNode, event: React.MouseEvent) => {
      event.stopPropagation()
      onSelect(node.id)
    },
    [onSelect],
  )

  const searchActive = matches !== null
  const dense = layout.nodes.length > 260
  const selectedEdges = React.useMemo(() => {
    if (!selectedId) return new Set<string>()
    const set = new Set<string>()
    for (const edge of layout.edges) {
      if (edge.source === selectedId || edge.target === selectedId) set.add(edge.id)
    }
    return set
  }, [layout.edges, selectedId])

  const hoveredNode = hoveredId ? layout.byId.get(hoveredId) : undefined
  const showLabels = viewport.scale > (dense ? 0.92 : 0.72)

  // Labels re-place only after the wheel settles. While scrolling, the transform alone
  // moves existing labels, so a thousand-node map does not re-render its node layer per
  // wheel tick (the dominant cost at 1000 papers).
  const [labelViewport, setLabelViewport] = React.useState<Viewport>(viewport)
  React.useEffect(() => {
    const timer = setTimeout(() => setLabelViewport(viewport), 140)
    return () => clearTimeout(timer)
  }, [viewport])

  // Captions are placed in screen space; node labels run in world space, so caption boxes
  // are converted back to world-space obstacles to keep the two layers from colliding.
  const galaxyCaptions = React.useMemo(
    () =>
      placeGalaxyCaptions(layout.galaxies, {
        viewport,
        size,
        fontSize: Math.max(13, clusterLabelSize + 3),
      }),
    [layout.galaxies, viewport, size, clusterLabelSize],
  )
  const clusterCaptions = React.useMemo(
    () =>
      placeClusterCaptions(layout.clusterCenters, layout.galaxies, {
        viewport,
        size,
        clusterFontSize: clusterLabelSize,
        reserved: [...galaxyCaptions.values()].map((placement) => placement.rect),
      }),
    [layout.clusterCenters, layout.galaxies, galaxyCaptions, viewport, size, clusterLabelSize],
  )
  const captionObstacles = React.useMemo(() => {
    const obstacles: Rect[] = []
    const push = (rect: Rect) => {
      obstacles.push({
        x1: (rect.x1 - viewport.x) / viewport.scale,
        y1: (rect.y1 - viewport.y) / viewport.scale,
        x2: (rect.x2 - viewport.x) / viewport.scale,
        y2: (rect.y2 - viewport.y) / viewport.scale,
      })
    }
    for (const placement of clusterCaptions.values()) if (placement.rect) push(placement.rect)
    for (const placement of galaxyCaptions.values()) push(placement.rect)
    return obstacles
  }, [clusterCaptions, galaxyCaptions, viewport])
  const labelPlacements = React.useMemo(
    () =>
      placeNodeLabels(matches === null ? layout.nodes : layout.nodes.filter((node) => matches.has(node.id)), {
        centers: layout.clusterCenters,
        selectedId,
        hoveredId,
        showAll: showLabels,
        degreeMin: dense ? (searchActive ? -1 : 8) : 6,
        limit: dense ? 80 : 400,
        viewport: labelViewport,
        size,
        labelFontSize,
        clusterFontSize: clusterLabelSize,
        forceIds: matches,
        extraReserved: captionObstacles,
      }),
    [layout.nodes, layout.clusterCenters, matches, selectedId, hoveredId, showLabels, dense, searchActive, labelViewport, size, labelFontSize, clusterLabelSize, captionObstacles],
  )

  // Memoised layers: zooming only re-renders the cheap wrapper (transform, captions,
  // HUD); the heavy star / nebula / edge / node trees bail out on element identity.
  const starsEl = React.useMemo(
    () => (
      <g className="lg-stars" aria-hidden={true}>
        {stars.map((star, index) => (
          <circle key={'star-' + index} className="lg-star" cx={star.x} cy={star.y} r={star.radius} opacity={star.opacity} style={{ animationDelay: star.delay + 'ms' }} />
        ))}
      </g>
    ),
    [stars],
  )

  const nebulaEl = React.useMemo(
    () => (
      <g className="lg-nebulas" aria-hidden={true}>
        {layout.galaxies.map((galaxy) => (
          <circle
            key={'galaxy-' + galaxy.group}
            className="lg-galaxy-nebula"
            cx={galaxy.x}
            cy={galaxy.y}
            r={Math.max(120, galaxy.radius * 1.12)}
            fill={galaxy.color}
          />
        ))}
        {layout.clusterCenters.map((center) => (
          <circle
            key={'nebula-' + center.cluster.id}
            className="lg-nebula"
            cx={center.x}
            cy={center.y}
            r={Math.max(44, center.radius * 1.16)}
            fill={colorMap.get(center.cluster.id) ?? '#7fd1ff'}
          />
        ))}
      </g>
    ),
    [layout.galaxies, layout.clusterCenters, colorMap],
  )

  const edgesEl = React.useMemo(
    () => (
      <g className="lg-edges" aria-hidden={true}>
        {layout.edges.map((edge) => {
          const related = selectedId !== null && selectedEdges.has(edge.id)
          const touchesHover = hoveredId !== null && (edge.source === hoveredId || edge.target === hoveredId)
          const dim = searchActive && !(matches!.has(edge.source) && matches!.has(edge.target))
          return (
            <path
              key={edge.id}
              className={'lg-edge' + (related || touchesHover ? ' is-active' : '')}
              d={edge.path}
              stroke={themeTone(edge.color, theme, 0.42)}
              strokeWidth={related ? 1.7 : edge.kind === 'category' ? 1.1 : 0.8}
              opacity={(related ? Math.min(0.9, edge.opacity + 0.5) : touchesHover ? edge.opacity + 0.3 : edge.opacity) * (dim ? 0.25 : 1)}
              fill="none"
            />
          )
        })}
      </g>
    ),
    [layout.edges, selectedEdges, selectedId, hoveredId, searchActive, matches, theme],
  )

  const nodesEl = React.useMemo(
    () => (
      <g className="lg-nodes">
        {layout.nodes.map((node) => {
          const color = colorMap.get(node.clusterId) ?? '#7fd1ff'
          const tone = themeTone(color, theme, 0.48)
          const isSelected = node.id === selectedId
          const isHovered = node.id === hoveredId
          const matched = matches === null || matches.has(node.id)
          const isProcessing = node.status === 'processing'
          const opacity = matched ? 1 : searchActive ? 0.16 : 0.5
          const labelVisible =
            isSelected || isHovered || (matched && (dense ? showLabels || searchActive : showLabels || node.degree >= 6))
          const placement = labelPlacements.get(node.id)
          return (
            <g
              key={node.id}
              className={'lg-node' + (isSelected ? ' is-selected' : '') + (isProcessing ? ' is-processing' : '')}
              opacity={opacity}
              data-node-hit="true"
              data-node-id={node.id}
              data-node-status={node.status}
              onClick={(event) => handleNodeClick(node, event)}
              onMouseEnter={(event) => showTooltip(node, event)}
              onMouseMove={(event) => showTooltip(node, event)}
              onMouseLeave={clearHover}
            >
              {isProcessing ? <circle className="lg-node-pulse" cx={node.x} cy={node.y} r={node.radius + 6} fill="none" stroke={tone} /> : null}
              {searchActive && matched && !isSelected && !isHovered ? <circle className="lg-node-match" cx={node.x} cy={node.y} r={node.radius + 7.5} fill={tone} /> : null}
              {isSelected || isHovered ? <circle className="lg-node-halo" cx={node.x} cy={node.y} r={node.radius + 9} fill={tone} opacity={0.16} /> : null}
              <circle className={'lg-node-dot' + (isSelected ? ' is-selected' : '')} cx={node.x} cy={node.y} r={isSelected || isHovered ? node.radius + 2.2 : node.radius} fill={tone} />
              {labelVisible && placement ? (
                <text className="lg-node-label" x={placement.x} y={placement.y} textAnchor={placement.anchor} style={{ fontSize: labelFontSize }}>
                  {truncate(node.title, LABEL_TEXT)}
                </text>
              ) : null}
            </g>
          )
        })}
      </g>
    ),
    [layout.nodes, colorMap, theme, selectedId, hoveredId, searchActive, matches, labelPlacements, labelFontSize, showLabels, dense, handleNodeClick, showTooltip, clearHover],
  )

  return (
    <div
      className={'lg-graph' + (dragging ? ' lg-graph-dragging' : '')}
      ref={containerRef}
      data-graph-scale={viewport.scale.toFixed(2)}
    >
      <svg
        ref={svgRef}
        className="lg-graph-svg"
        width="100%"
        height="100%"
        role="img"
        aria-label="文献知识图谱"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <defs>
          <radialGradient id="lg-nebula-fade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.055" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect className="lg-graph-bg" x="0" y="0" width="100%" height="100%" fill="transparent" />
        <g transform={'translate(' + viewport.x + ' ' + viewport.y + ') scale(' + viewport.scale + ')'}>
          {starsEl}
          {nebulaEl}
          {edgesEl}
          {nodesEl}
        </g>
      </svg>

      <div className="lg-cluster-captions" aria-hidden={true}>
        {layout.galaxies.map((galaxy) => {
          const placement = galaxyCaptions.get(galaxy.group)
          if (!placement) return null
          return (
            <span
              key={'galaxy-caption-' + galaxy.group}
              className="lg-galaxy-caption"
              style={{
                left: placement.x,
                top: placement.y,
                color: themeTone(galaxy.color, theme, 0.46),
                fontSize: Math.max(13, clusterLabelSize + 3),
                transform: placement.position === 'above' ? 'translate(-50%,-100%)' : 'translate(-50%,0)',
              }}
            >
              {galaxy.label} · {galaxy.count}
            </span>
          )
        })}
        {layout.clusterCenters.map((center) => {
          if (layout.clusterCenters.length > 24 && viewport.scale < 0.22) return null
          const placement = clusterCaptions.get(center.cluster.id)
          if (!placement) return null
          const color = colorMap.get(center.cluster.id) ?? '#7fd1ff'
          return (
            <span
              key={'cluster-caption-' + center.cluster.id}
              className="lg-cluster-caption"
              style={{
                left: placement.x,
                top: placement.y,
                color: themeTone(color, theme, 0.55),
                fontSize: Math.max(10, clusterLabelSize - 1),
                transform: 'translate(-50%,-50%)',
              }}
            >
              {center.cluster.label} · {center.count}
            </span>
          )
        })}
      </div>

      <div className="lg-hud">
        <button type="button" className="lg-icon-btn" title="放大" aria-label="放大" onClick={() => setViewport((v) => ({ ...v, scale: clamp(v.scale * 1.25, MIN_SCALE, MAX_SCALE) }))}>
          +
        </button>
        <button type="button" className="lg-icon-btn" title="缩小" aria-label="缩小" onClick={() => setViewport((v) => ({ ...v, scale: clamp(v.scale / 1.25, MIN_SCALE, MAX_SCALE) }))}>
          −
        </button>
        <button type="button" className="lg-icon-btn" title="适配视图" aria-label="适配视图" onClick={onFit}>
          ⤢
        </button>
        <button type="button" className="lg-hud-btn" title="重新布局" onClick={onRelayout}>
          重新布局
        </button>
      </div>

      {layout.galaxies.length > 0 ? (
        <div className="lg-legend" aria-label="研究领域图例">
          {layout.galaxies.map((galaxy) => (
            <span key={galaxy.group} className="lg-legend-item" title={galaxy.group + ' · ' + galaxy.count + ' 篇'}>
              <i style={{ background: themeTone(galaxy.color, theme, 0.4) }} />
              {galaxy.label}
            </span>
          ))}
        </div>
      ) : null}

      {hoveredNode ? (
        <div className="lg-tooltip" style={{ left: (tooltip ? tooltip.x : 0) + 14, top: (tooltip ? tooltip.y : 0) + 12 }}>
          <div className="lg-tooltip-title">{hoveredNode.title}</div>
          <div className="lg-tooltip-meta">
            <span style={{ color: themeTone(colorMap.get(hoveredNode.clusterId) ?? '#7fd1ff', theme, 0.55) }}>{hoveredNode.clusterLabel}</span>
            <span>{hoveredNode.year ?? '年份未知'}</span>
            <span>{hoveredNode.degree} 条关联</span>
          </div>
          {hoveredNode.categories.length > 0 ? <div className="lg-tooltip-tags">{hoveredNode.categories.join(' · ')}</div> : null}
          {hoveredNode.status === 'processing' ? <div className="lg-tooltip-tags">AI 理解中…</div> : null}
        </div>
      ) : null}

      {layout.nodes.length === 0 && !loading && !error ? (
        <div className="lg-graph-empty">
          <div className="lg-graph-empty-title">这片星空还是空的</div>
          <div className="lg-graph-empty-hint">把 PDF 拖进面板，或点击下方「导入文献」开始。</div>
        </div>
      ) : null}

      {loading && layout.nodes.length === 0 ? (
        <div className="lg-graph-loading">
          <div className="lg-spinner" />
          <div>正在计算星图…</div>
        </div>
      ) : null}

      {error ? (
        <div className="lg-graph-error">
          <div>图谱加载失败：{error}</div>
        </div>
      ) : null}

      {children}
    </div>
  )
}

function truncate(value: string, max: number): string {
  if (!value) return ''
  return value.length > max ? value.slice(0, max - 1) + '…' : value
}
