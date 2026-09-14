// Общие константы продукта (клиент + сервер)

export const MAX_FILE_MB = 10
export const MAX_TASK_TOTAL_MB = 50

export const PROJECT_COLORS = [
  '#0f766e', // teal
  '#7c3aed', // violet
  '#dc2626', // red
  '#ea580c', // orange
  '#ca8a04', // yellow
  '#16a34a', // green
  '#db2777', // pink
  '#475569', // slate
]

// Дефолтные статусы при создании проекта (п. 4.1)
export const DEFAULT_STATUSES = [
  { name: 'Бэклог', color: '#94a3b8', category: 0 },
  { name: 'К работе', color: '#0f766e', category: 1 },
  { name: 'В работе', color: '#f59e0b', category: 2 },
  { name: 'Ревью', color: '#8b5cf6', category: 2 },
  { name: 'Готово', color: '#16a34a', category: 3 },
]

export const TYPE_LABELS_RU: Record<string, string> = {
  epic: 'Эпик',
  story: 'Стори',
  task: 'Задача',
  bug: 'Баг',
}

export const PRIORITY_LABELS_RU: Record<string, string> = {
  low: 'Низкий',
  mid: 'Средний',
  high: 'Высокий',
  crit: 'Критический',
}

export const PRIORITY_ORDER: Record<string, number> = { low: 0, mid: 1, high: 2, crit: 3 }

export const CATEGORY_LABELS_RU: Record<number, string> = {
  0: 'Бэклог',
  1: 'К работе',
  2: 'В работе',
  3: 'Готово',
}

/** Статус для переноса задач при удалении workflow-статуса (создаётся по запросу) */
export const NO_STATUS_LABEL = 'Нет статуса'

export const TASK_TYPES = ['epic', 'story', 'task', 'bug'] as const
export const PRIORITIES = ['low', 'mid', 'high', 'crit'] as const
export const LINK_TYPES = ['blocks', 'relates'] as const

// Допустимые пары родитель → потомок (баг — лист, остальные типы без жёсткой иерархии)
export const ALLOWED_CHILDREN: Record<string, string[]> = {
  epic: [...TASK_TYPES],
  story: [...TASK_TYPES],
  task: [...TASK_TYPES],
  bug: [],
}

export function childTypesForParent(parentType: string): (typeof TASK_TYPES)[number][] {
  const allowed = new Set(ALLOWED_CHILDREN[parentType] ?? [])
  return TASK_TYPES.filter((t) => allowed.has(t))
}

export function parentTypesForChild(childType: string): string[] {
  return (Object.keys(ALLOWED_CHILDREN) as string[]).filter((pt) => ALLOWED_CHILDREN[pt].includes(childType))
}
