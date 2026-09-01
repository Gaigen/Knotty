import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'

type Params = { params: Promise<{ id: string }> }

/**
 * Свободное ребро канваса: связывает любые ноды графа (заметка/файл ↔ задача,
 * заметка ↔ заметка и т.п.) — визуальная ассоциация без семантики Link.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    await getCurrentUser()
    const body = await readJson<{ fromNodeId?: string; toNodeId?: string }>(req)

    const fromNodeId = body.fromNodeId
    const toNodeId = body.toNodeId
    if (!fromNodeId || !toNodeId) throw new ApiError('Не указаны ноды для связи')
    if (fromNodeId === toNodeId) throw new ApiError('Нельзя связать ноду с самой собой')

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) throw new ApiError('Проект не найден', 404)

    const nodes = await db.graphNode.findMany({
      where: { projectId, id: { in: [fromNodeId, toNodeId] } },
      select: { id: true },
    })
    if (nodes.length !== 2) throw new ApiError('Обе ноды должны принадлежать проекту')

    // дубль в любом направлении
    const dup = await db.graphEdge.findFirst({
      where: {
        projectId,
        OR: [
          { fromNodeId, toNodeId },
          { fromNodeId: toNodeId, toNodeId: fromNodeId },
        ],
      },
      select: { id: true },
    })
    if (dup) throw new ApiError('Эти ноды уже связаны')

    const edge = await db.graphEdge.create({ data: { projectId, fromNodeId, toNodeId } })
    return Response.json({ id: edge.id }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
