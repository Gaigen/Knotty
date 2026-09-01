import { db } from '@/lib/db'
import { DEFAULT_STATUSES, PROJECT_COLORS } from '@/lib/config'
import type { ProjectSummaryDto } from '@/lib/types'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError, isValidProjectKey, suggestProjectKey } from '@/lib/server/validation'

/** Сводка проектов с счётчиками по категориям статусов (для лаунчера) */
async function buildSummaries(userId: string): Promise<ProjectSummaryDto[]> {
  const projects = await db.project.findMany({
    where: { archivedAt: null },
    orderBy: { updatedAt: 'desc' },
  })
  if (projects.length === 0) return []

  const [statuses, favorites, taskGroups] = await Promise.all([
    db.status.findMany({ select: { id: true, projectId: true, category: true } }),
    db.favorite.findMany({ where: { userId }, select: { projectId: true } }),
    db.task.groupBy({
      by: ['projectId', 'statusId'],
      where: { projectId: { in: projects.map((p) => p.id) } },
      _count: { _all: true },
    }),
  ])
  const statusCategory = new Map(statuses.map((s) => [s.id, s.category]))
  const favSet = new Set(favorites.map((f) => f.projectId))

  return projects.map((p) => {
    const counts = { total: 0, backlog: 0, todo: 0, inProgress: 0, done: 0 }
    for (const g of taskGroups) {
      if (g.projectId !== p.id) continue
      const cat = statusCategory.get(g.statusId) ?? 0
      counts.total += g._count._all
      if (cat === 0) counts.backlog += g._count._all
      else if (cat === 1) counts.todo += g._count._all
      else if (cat === 2) counts.inProgress += g._count._all
      else if (cat === 3) counts.done += g._count._all
    }
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      color: p.color,
      icon: p.icon,
      isFavorite: favSet.has(p.id),
      counts,
      updatedAt: p.updatedAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    }
  })
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    const summaries = await buildSummaries(user.id)
    return Response.json(summaries)
  } catch (e) {
    return jsonError(e)
  }
}

interface CreateProjectBody {
  name?: string
  key?: string
  description?: string
  color?: string
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    void user
    const body = await readJson<CreateProjectBody>(req)
    const name = (body.name ?? '').trim()
    if (!name) throw new ApiError('Название проекта обязательно')
    if (name.length > 120) throw new ApiError('Название слишком длинное (макс. 120 символов)')

    const key = (body.key ?? suggestProjectKey(name)).trim().toUpperCase()
    if (!isValidProjectKey(key)) throw new ApiError('Ключ проекта: 2–5 латинских букв')
    const exists = await db.project.findUnique({ where: { key }, select: { id: true } })
    if (exists) throw new ApiError(`Ключ «${key}» уже занят`)

    const color = PROJECT_COLORS.includes(body.color ?? '') ? body.color! : PROJECT_COLORS[0]

    const project = await db.project.create({
      data: {
        key,
        name,
        description: (body.description ?? '').trim(),
        color,
        statuses: {
          create: DEFAULT_STATUSES.map((s, i) => ({ ...s, order: i })),
        },
      },
      include: { statuses: true },
    })

    return Response.json({ id: project.id }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
