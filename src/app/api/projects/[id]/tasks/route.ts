import { db } from '@/lib/db'
import { ALLOWED_CHILDREN, PRIORITIES, TASK_TYPES, TYPE_LABELS_RU } from '@/lib/config'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError, ancestorChain } from '@/lib/server/validation'
import { logActivity } from '@/lib/server/activity'
import { publishProjectChange } from '@/lib/server/realtime'
import { nextGraphPositions } from '@/lib/server/graph-positions'
import { getTaskRows } from '@/lib/server/serializers'
import { generateKeyBetween } from 'fractional-indexing'

type Params = { params: Promise<{ id: string }> }

/** [v1.1] ФТ-2.1.1 — лёгкий список задач без description; ?q= помечает совпадения */
export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const q = new URL(req.url).searchParams.get('q') ?? undefined
    const project = await db.project.findUnique({ where: { id }, select: { id: true } })
    if (!project) throw new ApiError('Проект не найден', 404)
    return Response.json(await getTaskRows(id, q || undefined))
  } catch (e) {
    return jsonError(e)
  }
}

interface CreateTaskBody {
  type?: string
  title?: string
  description?: string
  statusId?: string
  assigneeId?: string | null
  priority?: string
  dueDate?: string | null
  labels?: string[]
  parentId?: string | null
  /** добавить ноду на граф сразу (переопределяет autoGraph проекта); undefined — по умолчанию проекта */
  addToGraph?: boolean
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    const user = await getCurrentUser()
    const body = await readJson<CreateTaskBody>(req)

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { statuses: { orderBy: { order: 'asc' } } },
    })
    if (!project) throw new ApiError('Проект не найден', 404)

    const title = (body.title ?? '').trim()
    if (!title) throw new ApiError('Название задачи обязательно')
    if (title.length > 500) throw new ApiError('Название слишком длинное (макс. 500 символов)')
    if ((body.description ?? '').length > 100_000) {
      throw new ApiError('Описание слишком длинное (макс. 100 000 символов)')
    }

    const type = body.type ?? 'task'
    if (!TASK_TYPES.includes(type as (typeof TASK_TYPES)[number])) throw new ApiError('Некорректный тип задачи')

    const statusId = body.statusId ?? project.statuses[0]?.id
    const status = project.statuses.find((s) => s.id === statusId)
    if (!status) throw new ApiError('Статус не найден в этом проекте')

    const priority = body.priority ?? 'mid'
    if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) throw new ApiError('Некорректный приоритет')

    if (body.assigneeId) {
      const assignee = await db.user.findUnique({ where: { id: body.assigneeId }, select: { id: true } })
      if (!assignee) throw new ApiError('Исполнитель не найден')
    }

    let dueDate: Date | null = null
    if (body.dueDate) {
      dueDate = new Date(body.dueDate)
      if (Number.isNaN(dueDate.getTime())) throw new ApiError('Некорректная дата')
    }

    const labels = Array.isArray(body.labels)
      ? [...new Set(body.labels.map((l) => String(l).trim()).filter(Boolean))].slice(0, 20)
      : []

    // [v1.1] п. 4.1.1 — валидация пары родитель/потомок до создания
    // (лимит глубины снят по решению пользователя — дерево любой глубины)
    if (body.parentId) {
      await assertParentAllowedForCreate(body.parentId, type, projectId)
    }

    // номер и позиция в канбане — в транзакции, чтобы не было гонки со счётчиком
    const created = await db.$transaction(async (tx) => {
      const fresh = await tx.project.update({
        where: { id: projectId },
        data: { taskSeq: { increment: 1 }, updatedAt: new Date() },
        select: { taskSeq: true },
      })
      const last = await tx.task.findFirst({
        where: { projectId, statusId: status.id },
        orderBy: { boardOrder: 'desc' },
        select: { boardOrder: true },
      })
      const boardOrder = generateKeyBetween(last?.boardOrder ?? null, null)
      return tx.task.create({
        data: {
          projectId,
          number: fresh.taskSeq,
          type,
          title,
          description: body.description ?? '',
          statusId: status.id,
          assigneeId: body.assigneeId ?? null,
          priority,
          dueDate,
          labels: JSON.stringify(labels),
          parentId: body.parentId ?? null,
          boardOrder,
          createdById: user.id,
        },
      })
    })

    // автодобавление на канвас графа: галочка в модалке создания (переопределяет
    // авто-режим проекта), быстрые пути без галочки следуют авто-режиму
    if (body.addToGraph ?? project.autoGraph) {
      const [pos] = await nextGraphPositions(projectId, 1)
      await db.graphNode.create({
        data: { projectId, refType: 'task', refId: created.id, x: pos.x, y: pos.y },
      })
    }

    await logActivity(created.id, user.id, 'created', { type, title })
    publishProjectChange(projectId, { taskId: created.id })

    const rows = await getTaskRows(projectId)
    const row = rows.find((r) => r.id === created.id)
    return Response.json(row, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}

/** Проверка родителя при создании задачи (п. 4.1.1, п. 4.2-2) */
async function assertParentAllowedForCreate(parentId: string, childType: string, projectId: string) {
  const parent = await db.task.findUnique({
    where: { id: parentId },
    select: { id: true, type: true, projectId: true },
  })
  if (!parent) throw new ApiError('Родительская задача не найдена', 404)
  if (parent.projectId !== projectId) throw new ApiError('Родительская задача должна быть из того же проекта')
  if (!ALLOWED_CHILDREN[parent.type]?.includes(childType)) {
    const allowed = (ALLOWED_CHILDREN[parent.type] ?? []).map((t) => TYPE_LABELS_RU[t]).join(', ')
    throw new ApiError(
      `${TYPE_LABELS_RU[parent.type]} не может быть родителем для «${TYPE_LABELS_RU[childType]}»` +
        (allowed ? ` (допустимые потомки: ${allowed})` : ' (этот тип не может быть родителем)')
    )
  }
}

