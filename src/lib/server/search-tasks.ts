import { db } from '@/lib/db'
import type { TaskRowDto } from '@/lib/types'
import { safeParseArray } from '@/lib/server/serializers'

export interface TaskSearchHitDto {
  id: string
  projectId: string
  key: string
  title: string
  type: TaskRowDto['type']
  statusId: string
  priority: TaskRowDto['priority']
}

/**
 * Поиск задач по названию, ключу, меткам и описанию (логика как getTaskRows + q).
 * projectId — опционально, ограничить одним проектом.
 */
export async function searchTasks(
  q: string,
  opts?: { projectId?: string; limit?: number }
): Promise<TaskSearchHitDto[]> {
  const query = q.trim().toLowerCase()
  if (!query) return []

  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100)
  const keyMatch = query.match(/^([a-z]{2,5})-(\d+)$/)

  const tasks = await db.task.findMany({
    where: {
      ...(opts?.projectId ? { projectId: opts.projectId } : {}),
      project: { archivedAt: null },
    },
    select: {
      id: true,
      projectId: true,
      number: true,
      type: true,
      title: true,
      description: true,
      statusId: true,
      priority: true,
      labels: true,
      updatedAt: true,
      project: { select: { key: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 2000,
  })

  const hits: TaskSearchHitDto[] = []
  for (const t of tasks) {
    const key = `${t.project.key}-${t.number}`
    const labels = safeParseArray(t.labels)
    const matches =
      t.title.toLowerCase().includes(query) ||
      key.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      labels.some((l) => l.toLowerCase().includes(query)) ||
      (keyMatch &&
        t.project.key.toLowerCase() === keyMatch[1] &&
        t.number === Number(keyMatch[2]))

    if (!matches) continue
    hits.push({
      id: t.id,
      projectId: t.projectId,
      key,
      title: t.title,
      type: t.type as TaskRowDto['type'],
      statusId: t.statusId,
      priority: t.priority as TaskRowDto['priority'],
    })
    if (hits.length >= limit) break
  }

  return hits
}
