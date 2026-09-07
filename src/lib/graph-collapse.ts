export function hiddenByGroupCollapse(
  nodes: { id: string; parentId?: string | null }[],
  collapsedGroupIds: string[]
): Set<string> {
  const collapsed = new Set(collapsedGroupIds)
  const hidden = new Set<string>()
  for (const n of nodes) {
    if (n.parentId && collapsed.has(n.parentId)) hidden.add(n.id)
  }
  return hidden
}

export function hiddenByTreeCollapse(
  hierarchy: { source: string; target: string }[],
  collapsedNodeIds: string[]
): Set<string> {
  const children = new Map<string, string[]>()
  for (const e of hierarchy) {
    const arr = children.get(e.source) ?? []
    arr.push(e.target)
    children.set(e.source, arr)
  }
  const hidden = new Set<string>()
  const stack = [...collapsedNodeIds]
  while (stack.length) {
    const cur = stack.pop()!
    for (const c of children.get(cur) ?? []) {
      if (hidden.has(c)) continue
      hidden.add(c)
      stack.push(c)
    }
  }
  return hidden
}

export function rerouteCollapsedEdges<T extends { id: string; source: string; target: string }>(
  edges: T[],
  hidden: Set<string>,
  parentOf: Map<string, string>
): T[] {
  return edges.map((e) => {
    let source = e.source
    let target = e.target
    if (hidden.has(source)) source = parentOf.get(source) ?? source
    if (hidden.has(target)) target = parentOf.get(target) ?? target
    if (source === e.source && target === e.target) return e
    return { ...e, source, target }
  })
}

/** После reroute внутренние рёбра свёрнутой рамки становятся source===target — их не рисуем. */
export function dropReroutedSelfLoops<T extends { source: string; target: string }>(edges: T[]): T[] {
  return edges.filter((e) => e.source !== e.target)
}
