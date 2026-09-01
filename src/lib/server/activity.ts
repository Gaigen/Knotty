import { db } from '@/lib/db'

type ActivityEvent =
  | 'created'
  | 'status_changed'
  | 'field_changed'
  | 'commented'
  | 'file_added'
  | 'linked'
  | 'unlinked'
  | 'deleted'

/** Запись события истории (ФТ-5.3) + обновление времени проекта */
export async function logActivity(
  taskId: string,
  actorId: string,
  event: ActivityEvent,
  payload: Record<string, unknown> = {}
) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
  await db.activity.create({
    data: { taskId, actorId, event, payload: JSON.stringify(payload) },
  })
  if (task) {
    await db.project.update({ where: { id: task.projectId }, data: { updatedAt: new Date() } }).catch(() => {})
  }
}
