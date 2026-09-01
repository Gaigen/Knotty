import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'
import type { GraphDto, GraphNodeDto, Priority, TaskType } from '@/lib/types'

type Params = { params: Promise<{ id: string }> }

/**
 * Граф одним запросом (п. 7): ноды + рёбра-связи + иерархия + снапшоты задач.
 * Рёбра — только между задачами, у которых есть ноды на канвасе.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    await getCurrentUser()
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) throw new ApiError('Проект не найден', 404)

    const [nodeRows, tasks, links, attachments, canvasEdgeRows] = await Promise.all([
      db.graphNode.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } }),
      db.task.findMany({
        where: { projectId },
        include: { status: true, project: { select: { key: true } } },
      }),
      db.link.findMany({ where: { fromTask: { projectId } } }),
      db.attachment.findMany({ where: { projectId } }),
      db.graphEdge.findMany({ where: { projectId } }),
    ])

    const taskById = new Map(tasks.map((t) => [t.id, t]))
    const blockedSet = new Set(links.filter((l) => l.type === 'blocks').map((l) => l.toTaskId))
    const attachById = new Map(attachments.map((a) => [a.id, a]))
    const commentCounts = await db.comment.groupBy({ by: ['taskId'], where: { task: { projectId } }, _count: { _all: true } })
    const commentMap = new Map(commentCounts.map((c) => [c.taskId, c._count._all]))
    const attachCounts = await db.attachment.groupBy({ by: ['taskId'], where: { task: { projectId } }, _count: { _all: true } })
    const attachMap = new Map(attachCounts.map((a) => [a.taskId, a._count._all]))

    const nodes: GraphNodeDto[] = []
    for (const n of nodeRows) {
      let task: GraphNodeDto['task'] | undefined
      let attachment: GraphNodeDto['attachment'] | undefined
      if (n.refType === 'task' && n.refId) {
        const t = taskById.get(n.refId)
        if (!t) continue // ФТ-3.7: ноды без задачи не отдаются
        task = {
          id: t.id,
          key: `${t.project.key}-${t.number}`,
          title: t.title,
          type: t.type as TaskType,
          statusId: t.statusId,
          statusName: t.status.name,
          statusColor: t.status.color,
          statusCategory: t.status.category,
          assigneeId: t.assigneeId,
          priority: t.priority as Priority,
          labels: JSON.parse(t.labels || '[]'),
          dueDate: t.dueDate?.toISOString() ?? null,
          blocked: blockedSet.has(t.id),
          commentCount: commentMap.get(t.id) ?? 0,
          attachmentCount: attachMap.get(t.id) ?? 0,
        }
      } else if (n.refType === 'attachment' && n.refId) {
        const a = attachById.get(n.refId)
        if (!a) continue
        attachment = { id: a.id, fileName: a.fileName, mime: a.mime, hasPreview: !!a.previewKey }
      }
      nodes.push({
        id: n.id,
        refType: n.refType as GraphNodeDto['refType'],
        refId: n.refId,
        x: n.x,
        y: n.y,
        text: n.text,
        w: n.w,
        h: n.h,
        task,
        attachment,
      })
    }

    const nodeByRef = new Map(nodes.filter((n) => n.refType === 'task' && n.refId).map((n) => [n.refId!, n]))
    const edges: GraphDto['edges'] = []
    for (const l of links) {
      const source = nodeByRef.get(l.fromTaskId)
      const target = nodeByRef.get(l.toTaskId)
      if (source && target) {
        edges.push({ id: `link-${l.id}`, source: source.id, target: target.id, type: l.type as 'blocks' | 'relates' })
      }
    }

    // свободные рёбра канваса (заметка/файл ↔ задача) — только между живыми нодами
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    for (const ce of canvasEdgeRows) {
      if (nodeById.has(ce.fromNodeId) && nodeById.has(ce.toNodeId)) {
        edges.push({ id: `edge-${ce.id}`, source: ce.fromNodeId, target: ce.toNodeId, type: 'canvas' })
      }
    }

    // иерархия родитель→потомок (для отображения/раскладки)
    const hierarchy: GraphDto['hierarchy'] = []
    for (const t of tasks) {
      if (t.parentId) {
        const source = nodeByRef.get(t.parentId)
        const target = nodeByRef.get(t.id)
        if (source && target) hierarchy.push({ id: `tree-${t.id}`, source: source.id, target: target.id })
      }
    }

    const graph: GraphDto = { nodes, edges, hierarchy }
    return Response.json(graph)
  } catch (e) {
    return jsonError(e)
  }
}

/** Массовое сохранение позиций (после перетаскивания/автораскладки) */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    await getCurrentUser()
    const body = await readJson<{ positions?: { id: string; x: number; y: number }[] }>(req)
    const positions = body.positions ?? []
    if (!Array.isArray(positions) || positions.length > 2000) throw new ApiError('Некорректные позиции')

    await db.$transaction(
      positions.map((p) =>
        db.graphNode.updateMany({
          where: { id: p.id, projectId },
          data: { x: Number(p.x) || 0, y: Number(p.y) || 0 },
        })
      )
    )
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
