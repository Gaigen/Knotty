import { db } from '@/lib/db'
import { LINK_TYPES } from '@/lib/config'
import type { LinkType } from '@/lib/types'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError, assertLinkAllowed } from '@/lib/server/validation'
import { logActivity } from '@/lib/server/activity'
import { ensureTaskGraphNodes } from '@/lib/server/graph-nodes'

type Params = { params: Promise<{ id: string }> }

/**
 * Создание связи (ФТ-2.7, ФТ-3.4). Одна направленная строка в БД (п. 4.1.2):
 * from блокирует to. «Блокируется» — вычисляемая обратная выборка на чтении.
 * [v1.1] Для blocks — полный запрет циклов через обход графа (п. 4.1.3).
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id: fromTaskId } = await params
    const user = await getCurrentUser()
    const body = await readJson<{ toTaskId?: string; toKey?: string; type?: string }>(req)

    const type = (body.type ?? 'relates') as LinkType
    if (!LINK_TYPES.includes(type)) throw new ApiError('Некорректный тип связи')

    // цель: по id или по ключу задачи «VERF-12»
    let toTaskId = body.toTaskId ?? null
    if (!toTaskId && body.toKey) {
      const keyMatch = body.toKey.trim().toUpperCase().match(/^([A-Z]{2,5})-(\d+)$/)
      if (!keyMatch) throw new ApiError('Ключ задачи должен быть в формате ПРОЕКТ-номер, например VERF-12')
      const project = await db.project.findUnique({ where: { key: keyMatch[1] }, select: { id: true } })
      if (!project) throw new ApiError(`Проект «${keyMatch[1]}» не найден`)
      const task = await db.task.findFirst({
        where: { projectId: project.id, number: Number(keyMatch[2]) },
        select: { id: true },
      })
      if (!task) throw new ApiError(`Задача ${keyMatch[1]}-${keyMatch[2]} не найдена`)
      toTaskId = task.id
    }
    if (!toTaskId) throw new ApiError('Укажите задачу для связи')

    await assertLinkAllowed(fromTaskId, toTaskId, type)

    const link = await db.link.create({ data: { fromTaskId, toTaskId, type } })
    const fromTask = await db.task.findUnique({
      where: { id: fromTaskId },
      select: { projectId: true },
    })
    const graphNodesAdded = fromTask
      ? await ensureTaskGraphNodes(fromTask.projectId, [fromTaskId, toTaskId])
      : 0
    const toTask = await db.task.findUnique({
      where: { id: toTaskId },
      select: { number: true, project: { select: { key: true } } },
    })
    await logActivity(fromTaskId, user.id, 'linked', { type, otherKey: toTask ? `${toTask.project.key}-${toTask.number}` : null, direction: 'out' })
    await logActivity(toTaskId, user.id, 'linked', { type, otherKey: null, direction: 'in' })

    return Response.json(
      { id: link.id, type: link.type, fromTaskId, toTaskId, graphNodesAdded },
      { status: 201 }
    )
  } catch (e) {
    return jsonError(e)
  }
}
