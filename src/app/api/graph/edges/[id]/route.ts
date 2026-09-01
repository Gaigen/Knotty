import { db } from '@/lib/db'
import { getCurrentUser, jsonError } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    await getCurrentUser()
    const edge = await db.graphEdge.findUnique({ where: { id }, select: { id: true } })
    if (!edge) throw new ApiError('Ребро не найдено', 404)
    await db.graphEdge.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
