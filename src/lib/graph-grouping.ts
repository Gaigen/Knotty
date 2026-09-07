export const GROUP_PAD = 16
export const GROUP_PAD_TOP = 44
export const DEFAULT_GROUP_SIZE = { w: 320, h: 200 }

export interface NodeBox {
  id: string
  x: number
  y: number
  w: number
  h: number
  parentId?: string | null
}

export function toRelative(abs: { x: number; y: number }, parent: { x: number; y: number }) {
  return { x: abs.x - parent.x, y: abs.y - parent.y }
}

export function toAbsolute(rel: { x: number; y: number }, parent: { x: number; y: number }) {
  return { x: rel.x + parent.x, y: rel.y + parent.y }
}

export function wrapSelection(nodes: NodeBox[]): {
  group: { x: number; y: number; w: number; h: number }
  children: { id: string; x: number; y: number }[]
} {
  if (nodes.length === 0) {
    return { group: { x: 0, y: 0, ...DEFAULT_GROUP_SIZE }, children: [] }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.w)
    maxY = Math.max(maxY, n.y + n.h)
  }
  const group = {
    x: minX - GROUP_PAD,
    y: minY - GROUP_PAD_TOP,
    w: maxX - minX + GROUP_PAD * 2,
    h: maxY - minY + GROUP_PAD_TOP + GROUP_PAD,
  }
  return {
    group,
    children: nodes.map((n) => ({ id: n.id, ...toRelative({ x: n.x, y: n.y }, group) })),
  }
}

export function ungroupChildren(
  group: { x: number; y: number },
  children: { id: string; x: number; y: number }[]
): { id: string; x: number; y: number }[] {
  return children.map((c) => ({ id: c.id, ...toAbsolute({ x: c.x, y: c.y }, group) }))
}

/** Точка в flow-координатах; из пересекающихся рамок — с меньшей площадью. */
export function hitTestGroup(
  point: { x: number; y: number },
  groups: NodeBox[],
  exclude = new Set<string>()
): string | null {
  let best: { id: string; area: number } | null = null
  for (const g of groups) {
    if (exclude.has(g.id)) continue
    if (point.x < g.x || point.y < g.y || point.x > g.x + g.w || point.y > g.y + g.h) continue
    const area = g.w * g.h
    if (!best || area < best.area) best = { id: g.id, area }
  }
  return best?.id ?? null
}

export function worldBox(
  node: { x: number; y: number; w: number; h: number; parentId?: string | null },
  parent: { x: number; y: number } | null | undefined
): NodeBox {
  const origin = parent ?? { x: 0, y: 0 }
  const abs = node.parentId ? toAbsolute({ x: node.x, y: node.y }, origin) : { x: node.x, y: node.y }
  return { id: '', ...abs, w: node.w, h: node.h, parentId: node.parentId }
}
