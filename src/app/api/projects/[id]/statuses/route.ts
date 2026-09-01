import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'

type Params = { params: Promise<{ id: string }> }

const STATUS_COLORS = [
  '#94a3b8', '#0f766e', '#f59e0b', '#8b5cf6', '#16a34a',
  '#dc2626', '#ea580c', '#0891b2', '#db2777', '#475569',
]

/** Создание статуса (настройка workflow, п. 10.5 ТЗ — этап 2) */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    await getCurrentUser()
    const body = await readJson<{ name?: string; color?: string; category?: number }>(req)

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { statuses: { select: { order: true, name: true } } },
    })
    if (!project) throw new ApiError('Проект не найден', 404)

    const name = (body.name ?? '').trim()
    if (!name) throw new ApiError('Название статуса обязательно')
    if (name.length > 40) throw new ApiError('Название статуса слишком длинное (макс. 40 символов)')
    // имена статусов в проекте не должны дублироваться — путаница в UI/фильтрах
    const sameName = await db.status.findFirst({ where: { projectId, name }, select: { id: true } })
    if (sameName) throw new ApiError(`Статус «${name}» уже есть в этом проекте`)

    const category = Number(body.category ?? 0)
    if (!Number.isInteger(category) || category < 0 || category > 3) {
      throw new ApiError('Категория: 0 бэклог / 1 к работе / 2 в работе / 3 готово')
    }
    const color = STATUS_COLORS.includes(body.color ?? '') ? body.color! : STATUS_COLORS[0]

    const maxOrder = project.statuses.reduce((m, s) => Math.max(m, s.order), -1)
    const status = await db.status.create({
      data: { projectId, name, color, category, order: maxOrder + 1 },
    })
    await db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } })
    return Response.json({ id: status.id }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}

/** Переупорядочивание статусов workflow: body { order: string[] } — id статусов в новом порядке */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    await getCurrentUser()
    const body = await readJson<{ order?: string[] }>(req)
    const order = body.order ?? []
    if (!Array.isArray(order) || order.length === 0) throw new ApiError('Пустой порядок статусов')

    const statuses = await db.status.findMany({ where: { projectId }, select: { id: true } })
    const existing = new Set(statuses.map((s) => s.id))
    if (order.length !== existing.size || !order.every((id) => existing.has(id))) {
      throw new ApiError('Порядок должен содержать все статусы проекта ровно один раз')
    }

    await db.$transaction(
      order.map((statusId, i) =>
        db.status.update({ where: { id: statusId }, data: { order: i } })
      )
    )
    await db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } })
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
