import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { apiError } from '@/lib/server/i18n'
import { logActivity } from '@/lib/server/activity'
import { publishProjectChange } from '@/lib/server/realtime'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    const body = await readJson<{ body?: string }>(req)
    const text = (body.body ?? '').trim()
    if (!text) await apiError('commentEmpty')

    const comment = await db.comment.findUnique({
      where: { id },
      include: { task: { select: { projectId: true } } },
    })
    if (!comment) await apiError('commentNotFound', undefined, 404)
    if (comment.authorId !== user.id) await apiError('canOnlyEditOwnComments', undefined, 403)

    const updated = await db.comment.update({ where: { id }, data: { body: text } })
    await logActivity(comment.taskId, user.id, 'comment_edited', { commentId: id })
    publishProjectChange(comment.task.projectId, { taskId: comment.taskId, scope: 'task' })
    return Response.json({
      id: updated.id,
      taskId: updated.taskId,
      authorId: updated.authorId,
      body: updated.body,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (e) {
    return await jsonError(e)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    const comment = await db.comment.findUnique({
      where: { id },
      include: { task: { select: { projectId: true } } },
    })
    if (!comment) await apiError('commentNotFound', undefined, 404)
    if (comment.authorId !== user.id) await apiError('canOnlyDeleteOwnComments', undefined, 403)
    await logActivity(comment.taskId, user.id, 'comment_deleted', { commentId: id })
    await db.comment.delete({ where: { id } })
    publishProjectChange(comment.task.projectId, { taskId: comment.taskId, scope: 'task' })
    return Response.json({ ok: true })
  } catch (e) {
    return await jsonError(e)
  }
}
