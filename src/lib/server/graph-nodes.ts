import { db } from '@/lib/db'
import { nextGraphPositions } from '@/lib/server/graph-positions'

/** Добавить ноды задач на канвас, если их ещё нет */
export async function ensureTaskGraphNodes(projectId: string, taskIds: string[]): Promise<number> {
  const unique = [...new Set(taskIds.filter(Boolean))]
  if (unique.length === 0) return 0

  const tasks = await db.task.findMany({
    where: { projectId, id: { in: unique } },
    select: { id: true },
  })
  const validIds = tasks.map((t) => t.id)
  if (validIds.length === 0) return 0

  const existing = await db.graphNode.findMany({
    where: { projectId, refType: 'task', refId: { in: validIds } },
    select: { refId: true },
  })
  const onCanvas = new Set(existing.map((n) => n.refId).filter(Boolean) as string[])
  const missing = validIds.filter((id) => !onCanvas.has(id))
  if (missing.length === 0) return 0

  const positions = await nextGraphPositions(projectId, missing.length)
  await db.$transaction(
    missing.map((taskId, i) =>
      db.graphNode.create({
        data: {
          projectId,
          refType: 'task',
          refId: taskId,
          x: positions[i].x,
          y: positions[i].y,
        },
      })
    )
  )
  return missing.length
}
