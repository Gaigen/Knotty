import { generateKeyBetween } from 'fractional-indexing'
import { db } from '@/lib/db'

/**
 * [v1.1] П. 4.3 — порядок в канбане через дробный строковый ключ
 * (fractional indexing / LexoRank-подобный). Перемещение между A и B
 * вычисляет ключ строго между их ключами, без пересчёта соседей.
 */
export async function boardOrderForAppend(projectId: string, statusId: string): Promise<string> {
  const last = await db.task.findFirst({
    where: { projectId, statusId },
    orderBy: { boardOrder: 'desc' },
    select: { boardOrder: true },
  })
  return generateKeyBetween(last?.boardOrder ?? null, null)
}

export async function boardOrderForPrepend(projectId: string, statusId: string): Promise<string> {
  const first = await db.task.findFirst({
    where: { projectId, statusId },
    orderBy: { boardOrder: 'asc' },
    select: { boardOrder: true },
  })
  return generateKeyBetween(null, first?.boardOrder ?? null)
}

/** Ключ строго между соседями (prev/next могут быть null — начало/конец колонки) */
export function boardOrderBetween(prev: string | null, next: string | null): string {
  return generateKeyBetween(prev, next)
}

/**
 * Fallback-ре-балансировка (п. 10.6): равномерно перераздаёт ключи колонке,
 * если между соседями «кончилось место». В обычном flow не вызывается.
 */
export async function rebalanceColumn(projectId: string, statusId: string): Promise<void> {
  const tasks = await db.task.findMany({
    where: { projectId, statusId },
    orderBy: { boardOrder: 'asc' },
    select: { id: true },
  })
  let prev: string | null = null
  for (const t of tasks) {
    const key = generateKeyBetween(prev, null)
    await db.task.update({ where: { id: t.id }, data: { boardOrder: key } })
    prev = key
  }
}
