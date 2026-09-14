import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { apiError } from '@/lib/server/i18n'
import { publishProjectChange } from '@/lib/server/realtime'
import { assertGraphEdgeAllowed } from '@/lib/server/validation'

type Params = { params: Promise<{ id: string }> }

/**
 * Свободное ребро канваса: связывает любые ноды графа (заметка/файл ↔ задача,
 * заметка ↔ заметка и т.п.) — визуальная ассоциация без семантики Link.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    await getCurrentUser()
    const body = await readJson<{ fromNodeId?: string; toNodeId?: string; kind?: string }>(req)

    const fromNodeId = body.fromNodeId
    const toNodeId = body.toNodeId
    if (!fromNodeId || !toNodeId) await apiError('nodesRequiredForLink')

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) await apiError('projectNotFound', undefined, 404)

    const kind = await assertGraphEdgeAllowed(projectId, fromNodeId, toNodeId, body.kind ?? 'canvas')

    const edge = await db.graphEdge.create({ data: { projectId, fromNodeId, toNodeId, kind } })
    publishProjectChange(projectId)
    return Response.json({ id: edge.id }, { status: 201 })
  } catch (e) {
    return await jsonError(e)
  }
}
