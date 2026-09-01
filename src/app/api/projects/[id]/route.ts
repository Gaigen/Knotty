import { db } from '@/lib/db'
import type { ProjectDetailDto } from '@/lib/types'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'

type Params = { params: Promise<{ id: string }> }

async function buildDetail(projectId: string, userId: string): Promise<ProjectDetailDto> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { statuses: { orderBy: { order: 'asc' } } },
  })
  if (!project) throw new ApiError('Проект не найден', 404)
  const [fav, taskGroups] = await Promise.all([
    db.favorite.findUnique({ where: { userId_projectId: { userId, projectId } } }),
    db.task.groupBy({ by: ['statusId'], where: { projectId }, _count: { _all: true } }),
  ])
  const catById = new Map(project.statuses.map((s) => [s.id, s.category]))
  const counts = { total: 0, backlog: 0, todo: 0, inProgress: 0, done: 0 }
  for (const g of taskGroups) {
    const cat = catById.get(g.statusId) ?? 0
    counts.total += g._count._all
    if (cat === 0) counts.backlog += g._count._all
    else if (cat === 1) counts.todo += g._count._all
    else if (cat === 2) counts.inProgress += g._count._all
    else if (cat === 3) counts.done += g._count._all
  }
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    color: project.color,
    icon: project.icon,
    autoGraph: project.autoGraph,
    isFavorite: !!fav,
    statuses: project.statuses.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      name: s.name,
      color: s.color,
      category: s.category,
      order: s.order,
    })),
    counts,
    updatedAt: project.updatedAt.toISOString(),
    createdAt: project.createdAt.toISOString(),
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    return Response.json(await buildDetail(id, user.id))
  } catch (e) {
    return jsonError(e)
  }
}

interface PatchBody {
  name?: string
  description?: string
  color?: string
  isFavorite?: boolean
  autoGraph?: boolean
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    const body = await readJson<PatchBody>(req)
    const project = await db.project.findUnique({ where: { id }, select: { id: true } })
    if (!project) throw new ApiError('Проект не найден', 404)

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) throw new ApiError('Название проекта не может быть пустым')
      data.name = name
    }
    if (typeof body.description === 'string') data.description = body.description.trim()
    if (typeof body.color === 'string') data.color = body.color
    if (typeof body.autoGraph === 'boolean') data.autoGraph = body.autoGraph
    if (Object.keys(data).length > 0) {
      await db.project.update({ where: { id }, data })
    }
    if (typeof body.isFavorite === 'boolean') {
      if (body.isFavorite) {
        await db.favorite.upsert({
          where: { userId_projectId: { userId: user.id, projectId: id } },
          create: { userId: user.id, projectId: id },
          update: {},
        })
      } else {
        await db.favorite.deleteMany({ where: { userId: user.id, projectId: id } })
      }
    }
    return Response.json(await buildDetail(id, user.id))
  } catch (e) {
    return jsonError(e)
  }
}

/** Удаление проекта — каскад, с подтверждением ключом (п. 4.2-5) */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await readJson<{ key?: string }>(req)
    const project = await db.project.findUnique({ where: { id }, select: { key: true } })
    if (!project) throw new ApiError('Проект не найден', 404)
    if ((body.key ?? '').trim().toUpperCase() !== project.key) {
      throw new ApiError('Для удаления проекта введите его ключ в точности как указано')
    }
    // вложения — физические файлы
    const attachments = await db.attachment.findMany({ where: { projectId: id }, select: { storageKey: true, previewKey: true } })
    await db.project.delete({ where: { id } })
    const { deleteStored } = await import('@/lib/server/storage')
    for (const a of attachments) {
      await deleteStored(a.storageKey)
      if (a.previewKey) await deleteStored(a.previewKey)
    }
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
