import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'

const DEFAULT_W = 220
const DEFAULT_H = 100
const GAP_X = 72
const GAP_Y = 48

type Pos = { x: number; y: number }

function parseDim(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

/** Реальные w/h ноды из React Flow (style, measured, поля ноды) */
export function nodeSize(n: Node): { w: number; h: number } {
  const measured = (n as Node & { measured?: { width?: number; height?: number } }).measured
  const w =
    parseDim(n.style?.width) ??
    parseDim(n.width) ??
    parseDim(measured?.width) ??
    DEFAULT_W
  const h =
    parseDim(n.style?.height) ??
    parseDim(n.height) ??
    parseDim(measured?.height) ??
    DEFAULT_H
  return { w, h: Math.max(h, 84) }
}

function indexNodes(nodes: Node[]): Map<string, Node> {
  return new Map(nodes.map((n) => [n.id, n]))
}

function placeNonTasks(nodes: Node[], positions: Map<string, Pos>, anchorY: number) {
  let x = 48
  for (const n of nodes) {
    if (n.type === 'taskRF' || positions.has(n.id)) continue
    const { w } = nodeSize(n)
    positions.set(n.id, { x, y: anchorY })
    x += w + GAP_X
  }
}

function hierarchyMaps(edges: Edge[]) {
  const parentOf = new Map<string, string>()
  const childrenMap = new Map<string, string[]>()
  for (const e of edges) {
    if (!e.id.startsWith('tree-')) continue
    parentOf.set(e.target, e.source)
    const arr = childrenMap.get(e.source) ?? []
    arr.push(e.target)
    childrenMap.set(e.source, arr)
  }
  return { parentOf, childrenMap }
}

function linkMaps(edges: Edge[]) {
  const blocksOut = new Map<string, string[]>()
  const blocksIn = new Map<string, string[]>()
  const relates: Array<[string, string]> = []

  for (const e of edges) {
    const kind = (e.data as { kind?: string } | undefined)?.kind
    if (kind === 'blocks') {
      const out = blocksOut.get(e.source) ?? []
      out.push(e.target)
      blocksOut.set(e.source, out)
      const inArr = blocksIn.get(e.target) ?? []
      inArr.push(e.source)
      blocksIn.set(e.target, inArr)
    } else if (kind === 'relates') {
      relates.push([e.source, e.target])
    }
  }
  return { blocksOut, blocksIn, relates }
}

function connectedComponents(ids: string[], edges: Edge[]): string[][] {
  const adj = new Map<string, Set<string>>()
  for (const id of ids) adj.set(id, new Set())
  for (const e of edges) {
    const kind = (e.data as { kind?: string } | undefined)?.kind
    if (kind !== 'blocks' && kind !== 'relates') continue
    if (!adj.has(e.source) || !adj.has(e.target)) continue
    adj.get(e.source)!.add(e.target)
    adj.get(e.target)!.add(e.source)
  }
  const seen = new Set<string>()
  const out: string[][] = []
  for (const start of ids) {
    if (seen.has(start)) continue
    const stack = [start]
    const comp: string[] = []
    seen.add(start)
    while (stack.length) {
      const cur = stack.pop()!
      comp.push(cur)
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb)
          stack.push(nb)
        }
      }
    }
    if (comp.length > 1) out.push(comp)
  }
  return out
}

function assignBlockLayers(component: string[], blocksOut: Map<string, string[]>) {
  const inComp = new Set(component)
  const layers = new Map<string, number>()
  for (const id of component) layers.set(id, 0)

  let changed = true
  let guard = 0
  while (changed && guard < component.length + 2) {
    changed = false
    guard += 1
    for (const id of component) {
      const base = layers.get(id) ?? 0
      for (const t of blocksOut.get(id) ?? []) {
        if (!inComp.has(t)) continue
        const next = base + 1
        if (next > (layers.get(t) ?? 0)) {
          layers.set(t, next)
          changed = true
        }
      }
    }
  }
  return layers
}

function maxWidthInLayer(nodeById: Map<string, Node>, ids: string[]): number {
  let m = DEFAULT_W
  for (const id of ids) {
    const n = nodeById.get(id)
    if (n) m = Math.max(m, nodeSize(n).w)
  }
  return m
}

/**
 * Дерево parent→child: dagre TB, сиблинги в ряд, уровни по глубине.
 * Без иерархии — горизонтальная полоса корней.
 */
export function layoutTree(nodes: Node[], edges: Edge[]): Map<string, Pos> {
  const taskNodes = nodes.filter((n) => n.type === 'taskRF')
  const positions = new Map<string, Pos>()
  const treeEdges = edges.filter((e) => e.id.startsWith('tree-'))

  if (treeEdges.length === 0) {
    let x = 80
    const y = 60
    for (const n of taskNodes) {
      const { w } = nodeSize(n)
      positions.set(n.id, { x, y })
      x += w + GAP_X
    }
    const maxH = taskNodes.reduce((m, n) => Math.max(m, nodeSize(n).h), DEFAULT_H)
    placeNonTasks(nodes, positions, y + maxH + 80)
    return positions
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'TB',
    nodesep: 56,
    ranksep: 120,
    marginx: 48,
    marginy: 48,
    align: 'UL',
  })

  for (const n of taskNodes) {
    const { w, h } = nodeSize(n)
    g.setNode(n.id, { width: w, height: h })
  }
  for (const e of treeEdges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target)
  }

  dagre.layout(g)

  let maxY = 0
  for (const n of taskNodes) {
    if (!g.hasNode(n.id)) continue
    const meta = g.node(n.id)
    const { w, h } = nodeSize(n)
    positions.set(n.id, { x: meta.x - w / 2, y: meta.y - h / 2 })
    maxY = Math.max(maxY, meta.y + h / 2)
  }

  for (const n of taskNodes) {
    if (positions.has(n.id)) continue
    const { h } = nodeSize(n)
    positions.set(n.id, { x: 80, y: maxY + 80 })
    maxY += h + GAP_Y
  }

  placeNonTasks(nodes, positions, maxY + 100)
  return positions
}

/**
 * Столб: preorder parent→child, подзадачи прямо под родителем (indent).
 */
export function layoutHierarchyColumn(nodes: Node[], edges: Edge[]): Map<string, Pos> {
  const taskNodes = nodes.filter((n) => n.type === 'taskRF')
  const nodeById = indexNodes(taskNodes)
  const { parentOf, childrenMap } = hierarchyMaps(edges)
  const positions = new Map<string, Pos>()
  let y = 48
  const BASE_X = 80
  const INDENT = 56

  function walk(id: string, depth: number) {
    const n = nodeById.get(id)
    const rowH = n ? nodeSize(n).h + GAP_Y : DEFAULT_H + GAP_Y
    positions.set(id, { x: BASE_X + depth * INDENT, y })
    y += rowH
    for (const c of childrenMap.get(id) ?? []) walk(c, depth + 1)
  }

  const roots = taskNodes.filter((n) => !parentOf.has(n.id)).map((n) => n.id)
  for (const r of roots) walk(r, 0)

  for (const n of taskNodes) {
    if (!positions.has(n.id)) {
      const { h } = nodeSize(n)
      positions.set(n.id, { x: BASE_X, y })
      y += h + GAP_Y
    }
  }

  placeNonTasks(nodes, positions, y + 64)
  return positions
}

/**
 * Полоса blocks/relates: слева→справа по слоям blocks; relates — на одном слое.
 * Изолированные задачи — отдельная горизонтальная полоса сверху.
 */
export function layoutDependencyStrip(nodes: Node[], edges: Edge[]): Map<string, Pos> {
  const taskNodes = nodes.filter((n) => n.type === 'taskRF')
  const nodeById = indexNodes(taskNodes)
  const taskIds = taskNodes.map((n) => n.id)
  const linkEdges = edges.filter((e) => {
    const kind = (e.data as { kind?: string } | undefined)?.kind
    return kind === 'blocks' || kind === 'relates'
  })
  const { blocksOut, relates } = linkMaps(edges)
  const positions = new Map<string, Pos>()

  const linked = new Set<string>()
  for (const e of linkEdges) {
    linked.add(e.source)
    linked.add(e.target)
  }
  const isolated = taskIds.filter((id) => !linked.has(id))
  const components = connectedComponents(taskIds, edges)

  let isoX = 80
  const isoY = 48
  let isoMaxH = 0
  for (const id of isolated) {
    const n = nodeById.get(id)!
    const { w, h } = nodeSize(n)
    positions.set(id, { x: isoX, y: isoY })
    isoX += w + GAP_X
    isoMaxH = Math.max(isoMaxH, h)
  }

  let bandY = isolated.length > 0 ? isoY + isoMaxH + 80 : 48

  for (const component of components) {
    const layers = assignBlockLayers(component, blocksOut)
    for (const [a, b] of relates) {
      if (!component.includes(a) || !component.includes(b)) continue
      const m = Math.min(layers.get(a) ?? 0, layers.get(b) ?? 0)
      layers.set(a, m)
      layers.set(b, m)
    }

    const byLayer = new Map<number, string[]>()
    for (const id of component) {
      const l = layers.get(id) ?? 0
      const arr = byLayer.get(l) ?? []
      arr.push(id)
      byLayer.set(l, arr)
    }

    const maxLayer = Math.max(0, ...byLayer.keys())
    let layerX = 80
    let bandHeight = 0

    for (let layer = 0; layer <= maxLayer; layer++) {
      const ids = byLayer.get(layer) ?? []
      const colW = maxWidthInLayer(nodeById, ids)
      let layerY = bandY
      let colHeight = 0

      ids.forEach((id) => {
        const n = nodeById.get(id)!
        const { h } = nodeSize(n)
        positions.set(id, { x: layerX, y: layerY })
        layerY += h + 36
        colHeight = layerY - bandY
      })

      bandHeight = Math.max(bandHeight, colHeight)
      layerX += colW + GAP_X
    }

    bandY += bandHeight + 100
  }

  placeNonTasks(nodes, positions, bandY + 40)
  return positions
}
