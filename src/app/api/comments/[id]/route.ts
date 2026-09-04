import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'
import { logActivity } from '@/lib/server/activity'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    const body = await readJson<{ body?: string }>(req)
    const text = (body.body ?? '').trim()
    if (!text) throw new ApiError('Комментарий не может быть пустым')

    const comment = await db.comment.findUnique({ where: { id } })
    if (!comment) throw new ApiError('Комментарий не найден', 404)
    if (comment.authorId !== user.id) throw new ApiError('Можно редактировать только свои комментарии', 403)

    const updated = await db.comment.update({ where: { id }, data: { body: text } })
    await logActivity(comment.taskId, user.id, 'comment_edited', { commentId: id })
    return Response.json({
      id: updated.id,
      taskId: updated.taskId,
      authorId: updated.authorId,
      body: updated.body,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (e) {
    return jsonError(e)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    const comment = await db.comment.findUnique({ where: { id } })
    if (!comment) throw new ApiError('Комментарий не найден', 404)
    if (comment.authorId !== user.id) throw new ApiError('Можно удалять только свои комментарии', 403)
    await logActivity(comment.taskId, user.id, 'comment_deleted', { commentId: id })
    await db.comment.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
