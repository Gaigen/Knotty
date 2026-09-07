import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { publishProjectChange } from '@/lib/server/realtime'
import { ApiError } from '@/lib/server/validation'
import { wrapNodesInGroup } from '@/lib/server/graph-groups'

type Params = { params: Promise<{ id: string }> }

/** Обернуть выделенные ноды рамкой */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    await getCurrentUser()
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) throw new ApiError('Проект не найден', 404)

    const body = await readJson<{ nodeIds?: string[]; title?: string }>(req)
    const nodeIds = Array.isArray(body.nodeIds) ? body.nodeIds : []
    const group = await wrapNodesInGroup(projectId, nodeIds, body.title ?? 'Пачка')
    publishProjectChange(projectId)
    return Response.json({ id: group.id }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
