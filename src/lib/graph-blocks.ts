export type BlockEndpoint = string

export interface BlocksGraphInput {
  links: { fromTaskId: string; toTaskId: string; type: string }[]
  graphEdges: { fromNodeId: string; toNodeId: string; kind: string }[]
  nodes: { id: string; refType: string; refId: string | null }[]
}

export function taskEndpoint(taskId: string): BlockEndpoint {
  return `t:${taskId}`
}

export function groupEndpoint(nodeId: string): BlockEndpoint {
  return `g:${nodeId}`
}

export function nodeEndpoint(node: { id: string; refType: string; refId: string | null }): BlockEndpoint | null {
  if (node.refType === 'task' && node.refId) return taskEndpoint(node.refId)
  if (node.refType === 'group') return groupEndpoint(node.id)
  return null
}

export function collectBlockedTaskIds(input: BlocksGraphInput): Set<string> {
  const blocked = new Set<string>()
  for (const l of input.links) {
    if (l.type === 'blocks') blocked.add(l.toTaskId)
  }
  const byId = new Map(input.nodes.map((n) => [n.id, n]))
  for (const e of input.graphEdges) {
    if (e.kind !== 'blocks') continue
    const target = byId.get(e.toNodeId)
    if (target?.refType === 'task' && target.refId) blocked.add(target.refId)
  }
  return blocked
}

export function blocksAdjacency(input: BlocksGraphInput): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  const add = (from: string, to: string) => {
    const arr = adj.get(from) ?? []
    arr.push(to)
    adj.set(from, arr)
  }
  for (const l of input.links) {
    if (l.type === 'blocks') add(taskEndpoint(l.fromTaskId), taskEndpoint(l.toTaskId))
  }
  const byId = new Map(input.nodes.map((n) => [n.id, n]))
  for (const e of input.graphEdges) {
    if (e.kind !== 'blocks') continue
    const from = byId.get(e.fromNodeId)
    const to = byId.get(e.toNodeId)
    if (!from || !to) continue
    const a = nodeEndpoint(from)
    const b = nodeEndpoint(to)
    if (a && b) add(a, b)
  }
  return adj
}

/** Создаём ребро from → to. Цикл, если из to уже есть путь в from. */
export function findBlocksCycleOnGraph(
  from: BlockEndpoint,
  to: BlockEndpoint,
  edges: { from: BlockEndpoint; to: BlockEndpoint }[]
): string[] | null {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    const arr = adj.get(e.from) ?? []
    arr.push(e.to)
    adj.set(e.from, arr)
  }
  const prev = new Map<string, string>()
  const seen = new Set<string>([to])
  const queue = [to]
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === from) {
      const path: string[] = []
      let c: string | undefined = from
      while (c) {
        path.push(c)
        c = prev.get(c)
      }
      return path.reverse()
    }
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        prev.set(next, cur)
        queue.push(next)
      }
    }
  }
  return null
}

export function findBlocksCycleFromAdj(
  from: BlockEndpoint,
  to: BlockEndpoint,
  adj: Map<string, string[]>
): string[] | null {
  const edges: { from: string; to: string }[] = []
  for (const [f, tos] of adj) {
    for (const t of tos) edges.push({ from: f, to: t })
  }
  return findBlocksCycleOnGraph(from, to, edges)
}

export function formatBlockPath(path: string[], labels: Map<string, string>): string {
  return path.map((id) => labels.get(id) ?? id).join(' → ')
}
