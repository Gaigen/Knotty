import { db } from '@/lib/db'
import { PRIORITIES, TASK_TYPES } from '@/lib/config'
import type { LinkType, TaskFullDto, TaskType } from '@/lib/types'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError, assertParentAllowed, assertTypeChangeAllowed } from '@/lib/server/validation'
import { logActivity, resolveActivityFieldValues } from '@/lib/server/activity'
import { getTaskRows, safeParseArray } from '@/lib/server/serializers'
import { generateKeyBetween } from 'fractional-indexing'

type Params = { params: Promise<{ id: string }> }

/** Полное содержимое задачи: описание, комментарии, связи, история (ФТ-2.7) */
async function buildFull(taskId: string): Promise<TaskFullDto> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { key: true } },
      status: true,
      assignee: true,
    },
  })
  if (!task) throw new ApiError('Задача не найдена', 404)

    const [comments, attachments, linksOut, linksIn, activities, children, blockedByCount, graphNodesOnCanvas] = await Promise.all([
    db.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      include: { author: true },
    }),
    db.attachment.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' } }),
    db.link.findMany({ where: { fromTaskId: taskId }, include: { toTask: { include: { status: true, project: { select: { key: true } } } } } }),
    db.link.findMany({ where: { toTaskId: taskId }, include: { fromTask: { include: { status: true, project: { select: { key: true } } } } } }),
    db.activity.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' }, take: 100, include: { actor: true } }),
    db.task.findMany({
      where: { parentId: taskId },
      orderBy: { number: 'asc' },
      select: {
        id: true, projectId: true, number: true, type: true, title: true, statusId: true,
        assigneeId: true, priority: true, dueDate: true, labels: true, parentId: true,
        boardOrder: true, createdAt: true, updatedAt: true,
        project: { select: { key: true } },
      },
    }),
    db.link.count({ where: { toTaskId: taskId, type: 'blocks' } }),
    db.graphNode.findMany({
      where: { projectId: task.projectId, refType: 'task' },
      select: { refId: true },
    }),
  ])

  const rows = await getTaskRows(task.projectId)
  const parent = task.parentId
    ? await db.task.findUnique({
        where: { id: task.parentId },
        select: { id: true, type: true, title: true, number: true, project: { select: { key: true } } },
      })
    : null

  const onGraph = new Set(graphNodesOnCanvas.map((n) => n.refId).filter(Boolean) as string[])

  const row = rows.find((r) => r.id === task.id)!
  return {
    ...row,
    onGraph: onGraph.has(task.id),
    description: task.description,
    assignee: task.assignee
      ? { id: task.assignee.id, name: task.assignee.name, email: task.assignee.email, avatarUrl: task.assignee.avatarUrl }
      : null,
    parent: parent ? { id: parent.id, key: `${parent.project.key}-${parent.number}`, title: parent.title, type: parent.type as TaskFullDto['type'] } : null,
    children: children.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      number: c.number,
      key: `${c.project.key}-${c.number}`,
      type: c.type as TaskFullDto['type'],
      title: c.title,
      statusId: c.statusId,
      assigneeId: c.assigneeId,
      priority: c.priority as TaskFullDto['priority'],
      dueDate: c.dueDate?.toISOString() ?? null,
      labels: safeParseArray(c.labels),
      parentId: c.parentId,
      hasChildren: false,
      commentCount: 0,
      attachmentCount: 0,
      boardOrder: c.boardOrder,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    comments: comments.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      authorId: c.authorId,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      author: { id: c.author.id, name: c.author.name, email: c.author.email, avatarUrl: c.author.avatarUrl },
    })),
    attachments: attachments.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      fileName: a.fileName,
      size: a.size,
      mime: a.mime,
      hasPreview: !!a.previewKey,
      createdAt: a.createdAt.toISOString(),
    })),
    links: [
      ...linksOut.map((l) => ({
        linkId: l.id,
        type: l.type as LinkType,
        dir: 'out' as const,
        task: {
          id: l.toTask.id,
          key: `${l.toTask.project.key}-${l.toTask.number}`,
          title: l.toTask.title,
          type: l.toTask.type as TaskType,
          statusId: l.toTask.statusId,
          statusName: l.toTask.status.name,
          statusColor: l.toTask.status.color,
          onGraph: onGraph.has(l.toTask.id),
        },
      })),
      ...linksIn.map((l) => ({
        linkId: l.id,
        type: l.type as LinkType,
        dir: 'in' as const,
        task: {
          id: l.fromTask.id,
          key: `${l.fromTask.project.key}-${l.fromTask.number}`,
          title: l.fromTask.title,
          type: l.fromTask.type as TaskType,
          statusId: l.fromTask.statusId,
          statusName: l.fromTask.status.name,
          statusColor: l.fromTask.status.color,
          onGraph: onGraph.has(l.fromTask.id),
        },
      })),
    ],
    activity: activities.map((a) => ({
      id: a.id,
      event: a.event,
      actorId: a.actorId,
      payload: safeParseRecord(a.payload),
      createdAt: a.createdAt.toISOString(),
      actor: { id: a.actor.id, name: a.actor.name, email: a.actor.email, avatarUrl: a.actor.avatarUrl },
    })),
    blockedByCount,
  }
}

function safeParseRecord(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    return Response.json(await buildFull(id))
  } catch (e) {
    return jsonError(e)
  }
}

interface PatchTaskBody {
  title?: string
  description?: string
  type?: string
  statusId?: string
  assigneeId?: string | null
  priority?: string
  dueDate?: string | null
  labels?: string[]
  parentId?: string | null
  boardOrder?: string
}

const FIELD_LABELS: Record<string, string> = {
  title: 'название',
  description: 'описание',
  type: 'тип',
  assigneeId: 'исполнитель',
  priority: 'приоритет',
  dueDate: 'срок',
  labels: 'метки',
  parentId: 'родитель',
}

const MAX_DESCRIPTION_LENGTH = 100_000

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    const body = await readJson<PatchTaskBody>(req)

    const task = await db.task.findUnique({
      where: { id },
      include: { project: { select: { id: true, statuses: { orderBy: { order: 'asc' } } } } },
    })
    if (!task) throw new ApiError('Задача не найдена', 404)

    const data: Record<string, unknown> = {}
    const changes: { field: string; old: unknown; new: unknown }[] = []
    let statusChangedTo: string | null = null

    // --- простые поля ---
    if (typeof body.title === 'string') {
      const title = body.title.trim()
      if (!title) throw new ApiError('Название задачи не может быть пустым')
      if (title !== task.title) {
        data.title = title
        changes.push({ field: 'title', old: task.title, new: title })
      }
    }
    if (typeof body.description === 'string' && body.description !== task.description) {
      if (body.description.length > MAX_DESCRIPTION_LENGTH) {
        throw new ApiError(`Описание слишком длинное (макс. ${MAX_DESCRIPTION_LENGTH} символов)`)
      }
      data.description = body.description
      changes.push({ field: 'description', old: null, new: null }) // содержимое не пишем в историю — только факт
    }
    if (body.priority !== undefined && body.priority !== task.priority) {
      if (!PRIORITIES.includes(body.priority as (typeof PRIORITIES)[number])) throw new ApiError('Некорректный приоритет')
      data.priority = body.priority
      changes.push({ field: 'priority', old: task.priority, new: body.priority })
    }
    if (body.dueDate !== undefined) {
      const newDate = body.dueDate ? new Date(body.dueDate) : null
      if (body.dueDate && Number.isNaN(newDate!.getTime())) throw new ApiError('Некорректная дата')
      const oldDate = task.dueDate?.getTime() ?? null
      if ((newDate?.getTime() ?? null) !== oldDate) {
        data.dueDate = newDate
        changes.push({ field: 'dueDate', old: task.dueDate?.toISOString() ?? null, new: newDate?.toISOString() ?? null })
      }
    }
    if (body.labels !== undefined) {
      const labels = [...new Set(body.labels.map((l) => String(l).trim()).filter(Boolean))].slice(0, 20)
      const oldLabels = safeParseArray(task.labels)
      if (JSON.stringify(labels) !== JSON.stringify(oldLabels)) {
        data.labels = JSON.stringify(labels)
        changes.push({ field: 'labels', old: oldLabels, new: labels })
      }
    }

    // --- исполнитель ---
    if (body.assigneeId !== undefined && body.assigneeId !== task.assigneeId) {
      if (body.assigneeId) {
        const assignee = await db.user.findUnique({ where: { id: body.assigneeId }, select: { id: true, name: true } })
        if (!assignee) throw new ApiError('Исполнитель не найден')
        data.assigneeId = body.assigneeId
      } else {
        data.assigneeId = null
      }
      changes.push({ field: 'assigneeId', old: task.assigneeId, new: body.assigneeId })
    }

    // --- тип ---
    if (body.type !== undefined && body.type !== task.type) {
      if (!TASK_TYPES.includes(body.type as (typeof TASK_TYPES)[number])) throw new ApiError('Некорректный тип задачи')
      const childTypes = await db.task.findMany({ where: { parentId: id }, select: { type: true } })
      assertTypeChangeAllowed(body.type as 'epic', childTypes.map((c) => c.type)) // [v1.1] п. 4.1.1
      if (task.parentId) {
        // смена типа должна сохранять допустимость пары с текущим родителем
        const parent = await db.task.findUnique({ where: { id: task.parentId }, select: { type: true } })
        if (parent) {
          const { ALLOWED_CHILDREN, TYPE_LABELS_RU } = await import('@/lib/config')
          if (!ALLOWED_CHILDREN[parent.type]?.includes(body.type)) {
            throw new ApiError(
              `Нельзя сменить тип на «${TYPE_LABELS_RU[body.type]}»: текущий родитель — «${TYPE_LABELS_RU[parent.type]}», такая пара не разрешена`
            )
          }
        }
      }
      data.type = body.type
      changes.push({ field: 'type', old: task.type, new: body.type })
    }

    // --- статус (+ позиция в канбане) ---
    if (body.statusId !== undefined && body.statusId !== task.statusId) {
      const status = task.project.statuses.find((s) => s.id === body.statusId)
      if (!status) throw new ApiError('Статус не найден в этом проекте')
      const oldStatus = task.project.statuses.find((s) => s.id === task.statusId)
      data.statusId = status.id
      statusChangedTo = status.name
      void oldStatus
      // [v1.1] при смене статуса карточка попадает в конец новой колонки,
      // если позиция не передана явно (канбан передаёт boardOrder вместе со статусом)
      if (!body.boardOrder) {
        const last = await db.task.findFirst({
          where: { projectId: task.projectId, statusId: status.id },
          orderBy: { boardOrder: 'desc' },
          select: { boardOrder: true },
        })
        data.boardOrder = generateKeyBetween(last?.boardOrder ?? null, null)
      }
    }

    // --- дробный ключ позиции (канбан, п. 4.3) ---
    if (body.boardOrder !== undefined && typeof body.boardOrder === 'string') {
      if (body.boardOrder !== task.boardOrder) data.boardOrder = body.boardOrder
    }

    // --- родитель ---
    if (body.parentId !== undefined && body.parentId !== task.parentId) {
      if (body.parentId) {
        await assertParentAllowed(id, body.parentId) // [v1.1] п. 4.1.1 + глубина + циклы дерева
        data.parentId = body.parentId
      } else {
        data.parentId = null
      }
      changes.push({ field: 'parentId', old: task.parentId, new: body.parentId })
    }

    if (Object.keys(data).length === 0) {
      return Response.json(await buildFull(id))
    }

    await db.task.update({ where: { id }, data })
    await db.project.update({ where: { id: task.projectId }, data: { updatedAt: new Date() } })

    // --- история (ФТ-5.3) ---
    for (const ch of changes) {
      const resolved = await resolveActivityFieldValues(ch.field, ch.old, ch.new)
      await logActivity(id, user.id, 'field_changed', {
        field: ch.field,
        fieldLabel: FIELD_LABELS[ch.field] ?? ch.field,
        old: ch.field === 'description' ? undefined : resolved.old,
        new: ch.field === 'description' ? undefined : resolved.new,
        changed: true,
      })
    }
    if (statusChangedTo) {
      const oldStatus = await db.status.findUnique({ where: { id: task.statusId }, select: { name: true } })
      const newStatus = await db.status.findUnique({ where: { id: body.statusId! }, select: { name: true } })
      await logActivity(id, user.id, 'status_changed', { old: oldStatus?.name, new: newStatus?.name })
    }

    return Response.json(await buildFull(id))
  } catch (e) {
    return jsonError(e)
  }
}

/** Удаление задачи (п. 4.2-4): подзадачи открепляются, связи/вложения/комментарии удаляются */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const task = await db.task.findUnique({ where: { id }, select: { id: true, projectId: true } })
    if (!task) throw new ApiError('Задача не найдена', 404)

    const attachments = await db.attachment.findMany({ where: { taskId: id }, select: { storageKey: true, previewKey: true } })
    // fix: сначала собираем ноды графа задачи, чтобы каскадно удалить её рёбра канваса (иначе сироты)
    const graphNodes = await db.graphNode.findMany({ where: { refType: 'task', refId: id }, select: { id: true } })
    const nodeIds = graphNodes.map((n) => n.id)
    // п. 4.2-4: подзадачи открепляются, остальное удаляется каскадно
    await db.task.updateMany({ where: { parentId: id }, data: { parentId: null } })
    await db.task.delete({ where: { id } })
    const { deleteStored } = await import('@/lib/server/storage')
    for (const a of attachments) {
      await deleteStored(a.storageKey)
      if (a.previewKey) await deleteStored(a.previewKey)
    }
    // ноды графа, ссылающиеся на задачу (ФТ-3.7), + их рёбра канваса
    if (nodeIds.length > 0) {
      await db.graphEdge.deleteMany({ where: { OR: [{ fromNodeId: { in: nodeIds } }, { toNodeId: { in: nodeIds } }] } })
    }
    await db.graphNode.deleteMany({ where: { id: { in: nodeIds.length ? nodeIds : ['__none__'] } } })
    await db.project.update({ where: { id: task.projectId }, data: { updatedAt: new Date() } }).catch(() => {})
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
