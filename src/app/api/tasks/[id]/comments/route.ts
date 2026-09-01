import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'
import { logActivity } from '@/lib/server/activity'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    const body = await readJson<{ body?: string }>(req)
    const text = (body.body ?? '').trim()
    if (!text) throw new ApiError('Комментарий не может быть пустым')
    if (text.length > 20000) throw new ApiError('Комментарий слишком длинный')

    const task = await db.task.findUnique({ where: { id }, select: { id: true } })
    if (!task) throw new ApiError('Задача не найдена', 404)

    const comment = await db.comment.create({ data: { taskId: id, authorId: user.id, body: text } })
    await logActivity(id, user.id, 'commented', { commentId: comment.id })
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
    return jsonError(e)
  }
}
