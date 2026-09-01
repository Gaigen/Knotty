import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { nextGraphPositions } from '@/lib/server/graph-positions'
import { ApiError } from '@/lib/server/validation'

type Params = { params: Promise<{ id: string }> }

/** Массовое добавление задач на канвас (все без ноды или выбранные taskIds) */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    await getCurrentUser()
    const body = await readJson<{ taskIds?: string[]; all?: boolean }>(req)

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) throw new ApiError('Проект не найден', 404)

    const existing = await db.graphNode.findMany({
      where: { projectId, refType: 'task' },
      select: { refId: true },
    })
    const onCanvas = new Set(existing.map((n) => n.refId).filter(Boolean) as string[])

    let taskIds: string[]
    if (body.all) {
      const tasks = await db.task.findMany({ where: { projectId }, select: { id: true } })
      taskIds = tasks.map((t) => t.id).filter((id) => !onCanvas.has(id))
    } else if (Array.isArray(body.taskIds) && body.taskIds.length > 0) {
      const tasks = await db.task.findMany({
        where: { projectId, id: { in: body.taskIds } },
        select: { id: true },
      })
      taskIds = tasks.map((t) => t.id).filter((id) => !onCanvas.has(id))
    } else {
      throw new ApiError('Укажите taskIds или all: true')
    }

    if (taskIds.length === 0) {
      return Response.json({ created: 0, ids: [] })
    }

    const positions = await nextGraphPositions(projectId, taskIds.length)
    const created = await db.$transaction(
      taskIds.map((taskId, i) =>
        db.graphNode.create({
          data: {
            projectId,
            refType: 'task',
            refId: taskId,
            x: positions[i].x,
            y: positions[i].y,
          },
          select: { id: true },
        })
      )
    )

    return Response.json({ created: created.length, ids: created.map((n) => n.id) }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
