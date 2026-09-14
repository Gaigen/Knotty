import { db } from '@/lib/db'
import { getCurrentUser, jsonError } from '@/lib/server/context'
import { publishProjectChange } from '@/lib/server/realtime'
import { apiError } from '@/lib/server/i18n'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    await getCurrentUser()
    const edge = await db.graphEdge.findUnique({ where: { id }, select: { id: true, projectId: true } })
    if (!edge) await apiError('edgeNotFound', undefined, 404)
    await db.graphEdge.delete({ where: { id } })
    publishProjectChange(edge.projectId)
    return Response.json({ ok: true })
  } catch (e) {
    return await jsonError(e)
  }
}
