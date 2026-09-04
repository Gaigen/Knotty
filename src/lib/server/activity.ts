import { db } from '@/lib/db'
import { publishProjectChange } from '@/lib/server/realtime'

type ActivityEvent =
  | 'created'
  | 'status_changed'
  | 'field_changed'
  | 'commented'
  | 'comment_edited'
  | 'comment_deleted'
  | 'file_added'
  | 'file_removed'
  | 'linked'
  | 'unlinked'
  | 'deleted'

/** Подписи для истории: id → читаемое значение (исполнитель, родитель) */
export async function resolveActivityFieldValues(
  field: string,
  old: unknown,
  newVal: unknown
): Promise<{ old: unknown; new: unknown }> {
  if (field === 'assigneeId') {
    const ids = [old, newVal].filter((v): v is string => typeof v === 'string' && v.length > 0)
    const users = ids.length
      ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : []
    const byId = new Map(users.map((u) => [u.id, u.name]))
    return {
      old: typeof old === 'string' && old ? (byId.get(old) ?? old) : old,
      new: typeof newVal === 'string' && newVal ? (byId.get(newVal) ?? newVal) : newVal,
    }
  }

  if (field === 'parentId') {
    const ids = [old, newVal].filter((v): v is string => typeof v === 'string' && v.length > 0)
    const tasks = ids.length
      ? await db.task.findMany({
          where: { id: { in: ids } },
          select: { id: true, number: true, project: { select: { key: true } } },
        })
      : []
    const byId = new Map(tasks.map((t) => [t.id, `${t.project.key}-${t.number}`]))
    return {
      old: typeof old === 'string' && old ? (byId.get(old) ?? old) : old,
      new: typeof newVal === 'string' && newVal ? (byId.get(newVal) ?? newVal) : newVal,
    }
  }

  return { old, new: newVal }
}

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
    publishProjectChange(task.projectId, { taskId })
  }
}
