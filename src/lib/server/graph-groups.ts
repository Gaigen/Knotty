import { db } from '@/lib/db'
import { DEFAULT_GROUP_SIZE, toAbsolute, wrapSelection } from '@/lib/graph-grouping'
import { ApiError } from '@/lib/server/validation'

const TITLE_MAX = 200

export async function createEmptyGroup(
  projectId: string,
  x: number,
  y: number,
  text = 'Пачка'
) {
  return db.graphNode.create({
    data: {
      projectId,
      refType: 'group',
      x,
      y,
      w: DEFAULT_GROUP_SIZE.w,
      h: DEFAULT_GROUP_SIZE.h,
      text: text.slice(0, TITLE_MAX),
    },
  })
}

function worldXY(
  n: { id: string; x: number; y: number; parentId: string | null },
  byId: Map<string, { id: string; x: number; y: number; parentId: string | null }>
): { x: number; y: number } {
  if (!n.parentId) return { x: n.x, y: n.y }
  const p = byId.get(n.parentId)
  if (!p) return { x: n.x, y: n.y }
  return toAbsolute({ x: n.x, y: n.y }, { x: p.x, y: p.y })
}

export async function wrapNodesInGroup(projectId: string, nodeIds: string[], title = 'Пачка') {
  const unique = [...new Set(nodeIds)]
  if (unique.length === 0) throw new ApiError('Нет нод для группировки')

  const all = await db.graphNode.findMany({ where: { projectId } })
  const byId = new Map(all.map((n) => [n.id, n]))
  const picked = unique.map((id) => byId.get(id)).filter((n): n is NonNullable<typeof n> => !!n)
  if (picked.length === 0) throw new ApiError('Нет нод для группировки')
  if (picked.some((n) => n.refType === 'group')) throw new ApiError('Рамки нельзя вкладывать друг в друга')

  const boxes = picked.map((n) => {
    const w = n.w && n.w > 0 ? n.w : 220
    const h = n.h && n.h > 0 ? n.h : 100
    const pos = worldXY(n, byId)
    return { id: n.id, x: pos.x, y: pos.y, w, h }
  })
  const { group, children } = wrapSelection(boxes)
  const childById = new Map(children.map((c) => [c.id, c]))

  const created = await db.$transaction(async (tx) => {
    const g = await tx.graphNode.create({
      data: {
        projectId,
        refType: 'group',
        x: group.x,
        y: group.y,
        w: group.w,
        h: group.h,
        text: title.slice(0, TITLE_MAX),
      },
    })
    for (const n of picked) {
      const rel = childById.get(n.id)!
      await tx.graphNode.update({
        where: { id: n.id },
        data: { parentId: g.id, x: rel.x, y: rel.y },
      })
    }
    return g
  })
  return created
}

export async function ungroupNode(groupId: string, projectId: string) {
  const group = await db.graphNode.findFirst({ where: { id: groupId, projectId } })
  if (!group) throw new ApiError('Рамка не найдена', 404)
  if (group.refType !== 'group') throw new ApiError('Это не рамка')

  const children = await db.graphNode.findMany({ where: { parentId: group.id } })
  await db.$transaction([
    ...children.map((c) =>
      db.graphNode.update({
        where: { id: c.id },
        data: { parentId: null, x: c.x + group.x, y: c.y + group.y },
      })
    ),
    db.graphEdge.deleteMany({
      where: { OR: [{ fromNodeId: group.id }, { toNodeId: group.id }] },
    }),
    db.graphNode.delete({ where: { id: group.id } }),
  ])
}

export async function assertParentGroup(projectId: string, nodeId: string, parentId: string | null) {
  if (parentId == null) return
  if (parentId === nodeId) throw new ApiError('Нельзя вложить ноду в себя')
  const parent = await db.graphNode.findFirst({ where: { id: parentId, projectId } })
  if (!parent) throw new ApiError('Рамка не найдена', 404)
  if (parent.refType !== 'group') throw new ApiError('Родителем может быть только рамка')
  const node = await db.graphNode.findFirst({ where: { id: nodeId, projectId }, select: { refType: true } })
  if (node?.refType === 'group') throw new ApiError('Рамки нельзя вкладывать друг в друга')
}
