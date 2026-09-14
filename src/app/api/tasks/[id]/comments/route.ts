import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { apiError } from '@/lib/server/i18n'
import { logActivity } from '@/lib/server/activity'
import { publishProjectChange } from '@/lib/server/realtime'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    const body = await readJson<{ body?: string }>(req)
    const text = (body.body ?? '').trim()
    if (!text) await apiError('commentEmpty')
    if (text.length > 20000) await apiError('commentTooLong')

    const task = await db.task.findUnique({ where: { id }, select: { id: true, projectId: true } })
    if (!task) await apiError('taskNotFound', undefined, 404)

    const comment = await db.comment.create({ data: { taskId: id, authorId: user.id, body: text } })
    await logActivity(id, user.id, 'commented', { commentId: comment.id })
    publishProjectChange(task.projectId, { taskId: id, scope: 'task' })
    return Response.json(
      {
        id: comment.id,
        taskId: comment.taskId,
        authorId: comment.authorId,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
        author: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
      },
      { status: 201 }
    )
  } catch (e) {
    return await jsonError(e)
  }
}
