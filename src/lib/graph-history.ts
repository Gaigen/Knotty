export const GRAPH_HISTORY_LIMIT = 50

export type GraphPositionEntry = {
  id: string
  x: number
  y: number
  parentId?: string | null
}

export type GraphNodeSnapshot = {
  refType: 'task' | 'attachment' | 'note' | 'group'
  refId?: string | null
  x: number
  y: number
  w?: number | null
  h?: number | null
  text?: string | null
  parentId?: string | null
}

export type GraphEdgeSnapshot = {
  edgeId: string
  kind: 'canvas' | 'relates' | 'blocks' | 'link'
  fromNodeId: string
  toNodeId: string
  linkType?: 'blocks' | 'relates'
}

export type HistoryEntry = {
  label: string
  undo: () => Promise<void>
  redo: () => Promise<void>
}

export function createHistoryStacks() {
  return { undo: [] as HistoryEntry[], redo: [] as HistoryEntry[] }
}

export function pushHistory(
  stacks: { undo: HistoryEntry[]; redo: HistoryEntry[] },
  entry: HistoryEntry
) {
  stacks.undo.push(entry)
  stacks.redo.length = 0
  if (stacks.undo.length > GRAPH_HISTORY_LIMIT) stacks.undo.shift()
}
