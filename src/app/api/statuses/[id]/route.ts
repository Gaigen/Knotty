import { db } from '@/lib/db'
import { NO_STATUS_LABEL } from '@/lib/config'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { logActivity } from '@/lib/server/activity'
import { publishProjectChange } from '@/lib/server/realtime'
import { ApiError } from '@/lib/server/validation'
import { generateKeyBetween } from 'fractional-indexing'

type Params = { params: Promise<{ id: string }> }

const STATUS_COLORS = [
  '#94a3b8', '#0f766e', '#f59e0b', '#8b5cf6', '#16a34a',
  '#dc2626', '#ea580c', '#0891b2', '#db2777', '#475569',
]

/** Правка статуса: название, цвет, категория */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    await getCurrentUser()
    const body = await readJson<{ name?: string; color?: string; category?: number }>(req)

    const status = await db.status.findUnique({ where: { id }, select: { id: true, projectId: true, name: true } })
    if (!status) throw new ApiError('Статус не найден', 404)

    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) throw new ApiError('Название статуса не может быть пустым')
      if (name.length > 40) throw new ApiError('Название статуса слишком длинное (макс. 40 символов)')
      if (name !== status.name) {
        const sameName = await db.status.findFirst({ where: { projectId: status.projectId, name }, select: { id: true } })
        if (sameName && sameName.id !== id) throw new ApiError(`Статус «${name}» уже есть в этом проекте`)
      }
      data.name = name
    }
    if (body.color !== undefined) {
      if (!STATUS_COLORS.includes(body.color)) throw new ApiError('Недопустимый цвет статуса')
      data.color = body.color
    }
    if (body.category !== undefined) {
      const category = Number(body.category)
      if (!Number.isInteger(category) || category < 0 || category > 3) {
        throw new ApiError('Категория: 0 бэклог / 1 к работе / 2 в работе / 3 готово')
      }
      data.category = category
    }

    if (Object.keys(data).length === 0) return Response.json({ ok: true })
    await db.status.update({ where: { id }, data })
    await db.project.update({ where: { id: status.projectId }, data: { updatedAt: new Date() } })
    publishProjectChange(status.projectId)
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}

interface DeleteStatusBody {
  migrateTo?: string
  createNoStatus?: boolean
}

async function resolveMigrateTarget(
  projectId: string,
  excludeId: string,
  body: DeleteStatusBody
): Promise<{ id: string; name: string }> {
  if (body.createNoStatus) {
    const existing = await db.status.findFirst({
      where: { projectId, name: NO_STATUS_LABEL },
      select: { id: true, name: true },
    })
    if (existing && existing.id !== excludeId) return existing

    const maxOrder = await db.status.aggregate({
      where: { projectId },
      _max: { order: true },
    })
    const created = await db.status.create({
      data: {
        projectId,
        name: NO_STATUS_LABEL,
        color: STATUS_COLORS[0],
        category: 0,
        order: (maxOrder._max.order ?? -1) + 1,
      },
      select: { id: true, name: true },
    })
    return created
  }

  const migrateTo = (body.migrateTo ?? '').trim()
  if (!migrateTo) throw new ApiError('Выберите статус для переноса задач или создайте «Нет статуса»')
  if (migrateTo === excludeId) throw new ApiError('Нельзя перенести задачи в удаляемый статус')

  const target = await db.status.findFirst({
    where: { id: migrateTo, projectId },
    select: { id: true, name: true },
  })
  if (!target) throw new ApiError('Статус для переноса не найден в этом проекте')
  return target
}

async function migrateTasksFromStatus(
  fromStatusId: string,
  fromName: string,
  target: { id: string; name: string },
  projectId: string,
  actorId: string
) {
  const tasks = await db.task.findMany({
    where: { statusId: fromStatusId },
    select: { id: true, boardOrder: true },
    orderBy: { boardOrder: 'asc' },
  })
  if (tasks.length === 0) return

  const last = await db.task.findFirst({
    where: { projectId, statusId: target.id },
    orderBy: { boardOrder: 'desc' },
    select: { boardOrder: true },
  })
  let prevKey = last?.boardOrder ?? null

  for (const task of tasks) {
    const boardOrder = generateKeyBetween(prevKey, null)
    prevKey = boardOrder
    await db.task.update({
      where: { id: task.id },
      data: { statusId: target.id, boardOrder },
    })
    await logActivity(task.id, actorId, 'status_changed', { old: fromName, new: target.name })
  }
}

/**
 * Удаление статуса (п. 4.1 ТЗ).
 * Пустой статус — удаляется напрямую.
 * С задачами — body { migrateTo } или { createNoStatus: true } для «Нет статуса».
 */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    const body = await readJson<DeleteStatusBody>(req).catch(() => ({} as DeleteStatusBody))

    const status = await db.status.findUnique({ where: { id }, select: { id: true, projectId: true, name: true } })
    if (!status) throw new ApiError('Статус не найден', 404)

    const [taskCount, statusCount] = await Promise.all([
      db.task.count({ where: { statusId: id } }),
      db.status.count({ where: { projectId: status.projectId } }),
    ])
    if (statusCount <= 1) {
      throw new ApiError('В проекте должен остаться хотя бы один статус')
    }

    if (taskCount > 0) {
      const target = await resolveMigrateTarget(status.projectId, id, body)
      await migrateTasksFromStatus(id, status.name, target, status.projectId, user.id)
    }

    await db.status.delete({ where: { id } })
    const rest = await db.status.findMany({
      where: { projectId: status.projectId },
      orderBy: { order: 'asc' },
      select: { id: true },
    })
    await db.$transaction(rest.map((s, i) => db.status.update({ where: { id: s.id }, data: { order: i } })))
    await db.project.update({ where: { id: status.projectId }, data: { updatedAt: new Date() } })
    publishProjectChange(status.projectId)
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
