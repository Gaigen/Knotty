import { db } from '@/lib/db'
import { getCurrentUser, jsonError } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'
import { logActivity } from '@/lib/server/activity'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    const link = await db.link.findUnique({
      where: { id },
      include: {
        fromTask: { select: { id: true, number: true, project: { select: { key: true } } } },
        toTask: { select: { id: true, number: true, project: { select: { key: true } } } },
      },
    })
    if (!link) throw new ApiError('Связь не найдена', 404)
    await db.link.delete({ where: { id } })
    await logActivity(link.fromTask.id, user.id, 'unlinked', { type: link.type, otherKey: `${link.toTask.project.key}-${link.toTask.number}` })
    await logActivity(link.toTask.id, user.id, 'unlinked', { type: link.type, otherKey: `${link.fromTask.project.key}-${link.fromTask.number}` })
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
