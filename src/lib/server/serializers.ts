import { db } from '@/lib/db'
import type { TaskRowDto } from '@/lib/types'

/**
 * Лёгкая строка задачи (ФТ-2.1.1) — без description в ответе.
 * q — поисковый запрос: совпадение ищется по названию, ключу, меткам и тексту
 * описания (ФТ-2.6), но описание не покидает сервер; результат — флаг matches,
 * чтобы клиент мог показать предков несовпавших подзадач серым (ФТ-2.5).
 */
export async function getTaskRows(projectId: string, q?: string): Promise<TaskRowDto[]> {
  const tasks = await db.task.findMany({
    where: { projectId },
    select: {
      id: true, projectId: true, number: true, type: true, title: true, description: true,
      statusId: true, assigneeId: true, priority: true, dueDate: true, labels: true, parentId: true,
      boardOrder: true, createdAt: true, updatedAt: true,
      project: { select: { key: true } },
    },
    orderBy: { number: 'asc' },
  })
  const [childCounts, commentCounts, attachCounts] = await Promise.all([
    db.task.groupBy({ by: ['parentId'], where: { projectId, parentId: { not: null } }, _count: { _all: true } }),
    db.comment.groupBy({ by: ['taskId'], where: { task: { projectId } }, _count: { _all: true } }),
    db.attachment.groupBy({ by: ['taskId'], where: { task: { projectId } }, _count: { _all: true } }),
  ])
  const childMap = new Map(childCounts.map((c) => [c.parentId, c._count._all]))
  const commentMap = new Map(commentCounts.map((c) => [c.taskId, c._count._all]))
  const attachMap = new Map(attachCounts.map((c) => [c.taskId, c._count._all]))

  const query = q?.trim().toLowerCase() ?? ''

  return tasks.map((t) => {
    const key = `${t.project.key}-${t.number}`
    let matches = true
    if (query) {
      const labels = safeParseArray(t.labels)
      matches =
        t.title.toLowerCase().includes(query) ||
        key.toLowerCase().startsWith(query) ||
        t.description.toLowerCase().includes(query) ||
        labels.some((l) => l.toLowerCase().includes(query))
    }
    return {
      id: t.id,
      projectId: t.projectId,
      number: t.number,
      key,
      type: t.type as TaskRowDto['type'],
      title: t.title,
      statusId: t.statusId,
      assigneeId: t.assigneeId,
      priority: t.priority as TaskRowDto['priority'],
      dueDate: t.dueDate?.toISOString() ?? null,
      labels: safeParseArray(t.labels),
      parentId: t.parentId,
      hasChildren: (childMap.get(t.id) ?? 0) > 0,
      commentCount: commentMap.get(t.id) ?? 0,
      attachmentCount: attachMap.get(t.id) ?? 0,
      boardOrder: t.boardOrder,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      matches,
    }
  })
}

export function safeParseArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}
