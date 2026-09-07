import { db } from '@/lib/db'
import { ALLOWED_CHILDREN, TYPE_LABELS_RU } from '@/lib/config'
import type { LinkType, TaskType } from '@/lib/types'
import {
  blocksAdjacency,
  findBlocksCycleFromAdj,
  formatBlockPath,
  groupEndpoint,
  nodeEndpoint,
  taskEndpoint,
  type BlocksGraphInput,
} from '@/lib/graph-blocks'

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

// ---------- Ключ проекта ----------

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

export function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((c) => TRANSLIT[c] ?? c)
    .join('')
}

/** Автогенерация ключа проекта из названия (ФТ-1.6): транслит, 2–5 латинских, uppercase */
export function suggestProjectKey(name: string): string {
  const letters = transliterate(name).replace(/[^a-z]/g, '').slice(0, 5)
  if (letters.length >= 2) return letters.toUpperCase()
  return (letters + 'xx').slice(0, 2).toUpperCase()
}

export function isValidProjectKey(key: string): boolean {
  return /^[A-Z]{2,5}$/.test(key)
}

// ---------- Дерево задач ----------

/** Цепочка предков задачи (не включая её саму), от ближайшего к корню */
export async function ancestorChain(
  taskId: string
): Promise<{ id: string; type: string; title: string; key: string }[]> {
  const chain: { id: string; type: string; title: string; key: string }[] = []
  let currentId: string | null = taskId
  const guard = new Set<string>()
  while (currentId) {
    if (guard.has(currentId)) break // защита от повреждённых данных
    guard.add(currentId)
    const t = await db.task.findUnique({
      where: { id: currentId },
      select: { id: true, parentId: true },
    })
    if (!t || !t.parentId) break
    const parent = await db.task.findUnique({
      where: { id: t.parentId },
      select: { id: true, type: true, title: true, number: true, project: { select: { key: true } } },
    })
    if (!parent || parent.id === taskId) break
    chain.push({ id: parent.id, type: parent.type, title: parent.title, key: `${parent.project.key}-${parent.number}` })
    currentId = parent.id
  }
  return chain
}

/**
 * Проверка допустимости установки parentId для задачи (п. 4.1.1, п. 4.2-2):
 * — родитель из того же проекта;
 * — допустимая пара типов родитель/потомок;
 * — задача не может быть предком самой себя (в т.ч. транзитивно).
 * Ограничение глубины снято по решению пользователя — дерево любой глубины.
 */
export async function assertParentAllowed(childTaskId: string, parentId: string): Promise<void> {
  const child = await db.task.findUnique({
    where: { id: childTaskId },
    select: { id: true, type: true, projectId: true },
  })
  if (!child) throw new ApiError('Задача не найдена', 404)
  const parent = await db.task.findUnique({
    where: { id: parentId },
    select: { id: true, type: true, projectId: true, title: true, number: true, project: { select: { key: true } } },
  })
  if (!parent) throw new ApiError('Родительская задача не найдена', 404)
  if (parent.projectId !== child.projectId) throw new ApiError('Родительская задача должна быть из того же проекта')
  if (parent.id === child.id) throw new ApiError('Задача не может быть родителем самой себя')

  // допустимость пары типов (п. 4.1.1)
  if (!ALLOWED_CHILDREN[parent.type]?.includes(child.type)) {
    const allowed = (ALLOWED_CHILDREN[parent.type] ?? []).map((t) => TYPE_LABELS_RU[t]).join(', ')
    throw new ApiError(
      `${TYPE_LABELS_RU[parent.type]} не может быть родителем для «${TYPE_LABELS_RU[child.type]}»` +
        (allowed ? ` (допустимые потомки: ${allowed})` : ' (этот тип не может быть родителем)')
    )
  }

  // защита от циклов в дереве: цепочка предков не должна содержать саму задачу
  const chain = await ancestorChain(parent.id)
  if (chain.some((a) => a.id === child.id)) {
    throw new ApiError('Нельзя сделать задачу потомком её собственной подзадачи')
  }
}

/** Проверка смены типа задачи, у которой уже есть потомки (п. 4.1.1) */
export function assertTypeChangeAllowed(newType: TaskType, childTypes: string[]): void {
  for (const ct of childTypes) {
    if (!ALLOWED_CHILDREN[newType]?.includes(ct)) {
      throw new ApiError(
        `Нельзя сменить тип на «${TYPE_LABELS_RU[newType]}»: у задачи есть потомки «${TYPE_LABELS_RU[ct]}», ` +
          'а такая пара родитель/потомок не разрешена'
      )
    }
  }
}

// ---------- Связи и циклы ----------

/**
 * [v1.1] П. 4.1.3 — полный запрет циклов в blocks.
 * Создаём связь from → to (from блокирует to). Цикл возникает, если из to уже
 * существует путь по blocks-рёбрам обратно в from. BFS от to «вперёд».
 * Обход ограничен проектом — связи между проектами запрещены, а так мы
 * не тянем чужие рёбра из БД (fix: раньше грузились все проекты).
 * Возвращает цепочку id замыкающего путь или null.
 */
export async function findBlocksCycle(fromId: string, toId: string, projectId?: string): Promise<string[] | null> {
  let pid = projectId
  if (!pid) {
    const from = await db.task.findUnique({ where: { id: fromId }, select: { projectId: true } })
    pid = from?.projectId
  }
  const links = await db.link.findMany({
    where: { type: 'blocks', ...(pid ? { fromTask: { projectId: pid } } : {}) },
    select: { fromTaskId: true, toTaskId: true },
  })
  // adjacency: from → [to]
  const adj = new Map<string, string[]>()
  for (const l of links) {
    const arr = adj.get(l.fromTaskId) ?? []
    arr.push(l.toTaskId)
    adj.set(l.fromTaskId, arr)
  }
  const prev = new Map<string, string>()
  const seen = new Set<string>([toId])
  const queue: string[] = [toId]
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === fromId) {
      // восстановить путь: from ← ... ← to
      const path: string[] = []
      let c: string | undefined = fromId
      while (c) {
        path.push(c)
        c = prev.get(c)
      }
      return path.reverse()
    }
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        prev.set(next, cur)
        queue.push(next)
      }
    }
  }
  return null
}

/** Ключи задач по массиву id (для текста ошибки) */
export async function taskKeys(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids)]
  const tasks = await db.task.findMany({
    where: { id: { in: unique } },
    select: { id: true, number: true, project: { select: { key: true } } },
  })
  for (const t of tasks) map.set(t.id, `${t.project.key}-${t.number}`)
  return map
}

/**
 * Валидация создания связи (п. 4.1.2, 4.1.3):
 * — задачи существуют и из одного проекта;
 * — нет дублей (для relates — по неупорядоченной паре);
 * — blocks не создаёт цикл любой длины.
 */
export async function assertLinkAllowed(fromTaskId: string, toTaskId: string, type: LinkType): Promise<void> {
  if (fromTaskId === toTaskId) throw new ApiError('Нельзя связать задачу с самой собой')
  const from = await db.task.findUnique({ where: { id: fromTaskId }, select: { projectId: true } })
  const to = await db.task.findUnique({ where: { id: toTaskId }, select: { projectId: true } })
  if (!from || !to) throw new ApiError('Задача не найдена', 404)
  if (from.projectId !== to.projectId) throw new ApiError('Связывать можно только задачи одного проекта')

  const existing = await db.link.findMany({
    where: { OR: [{ fromTaskId }, { toTaskId }] },
    select: { fromTaskId: true, toTaskId: true, type: true },
  })

  if (type === 'relates') {
    const dup = existing.find(
      (l) =>
        l.type === 'relates' &&
        ((l.fromTaskId === fromTaskId && l.toTaskId === toTaskId) ||
          (l.fromTaskId === toTaskId && l.toTaskId === fromTaskId))
    )
    if (dup) throw new ApiError('Такая связь уже существует')
  } else {
    const dup = existing.find((l) => l.type === 'blocks' && l.fromTaskId === fromTaskId && l.toTaskId === toTaskId)
    if (dup) throw new ApiError('Такая связь уже существует')
    const graph = await loadBlocksGraph(from.projectId)
    const cycle = findBlocksCycleFromAdj(
      taskEndpoint(fromTaskId),
      taskEndpoint(toTaskId),
      blocksAdjacency(graph)
    )
    if (cycle) {
      const pathStr = await formatCyclePath(cycle)
      throw new ApiError(`Эта связь создаст цикл: ${pathStr}`)
    }
  }
}

export async function loadBlocksGraph(projectId: string): Promise<BlocksGraphInput> {
  const [links, graphEdges, nodes] = await Promise.all([
    db.link.findMany({
      where: { fromTask: { projectId } },
      select: { fromTaskId: true, toTaskId: true, type: true },
    }),
    db.graphEdge.findMany({
      where: { projectId },
      select: { fromNodeId: true, toNodeId: true, kind: true },
    }),
    db.graphNode.findMany({
      where: { projectId },
      select: { id: true, refType: true, refId: true },
    }),
  ])
  return { links, graphEdges, nodes }
}

async function formatCyclePath(path: string[]): Promise<string> {
  const labels = new Map<string, string>()
  const taskIds = path.filter((p) => p.startsWith('t:')).map((p) => p.slice(2))
  const groupIds = path.filter((p) => p.startsWith('g:')).map((p) => p.slice(2))
  if (taskIds.length) {
    const keys = await taskKeys(taskIds)
    for (const [id, key] of keys) labels.set(taskEndpoint(id), key)
  }
  if (groupIds.length) {
    const groups = await db.graphNode.findMany({
      where: { id: { in: groupIds } },
      select: { id: true, text: true },
    })
    for (const g of groups) labels.set(groupEndpoint(g.id), g.text?.trim() || 'Пачка')
  }
  return formatBlockPath(path, labels)
}

const GRAPH_EDGE_KINDS = new Set(['canvas', 'relates', 'blocks'])

export async function assertGraphEdgeAllowed(
  projectId: string,
  fromNodeId: string,
  toNodeId: string,
  kind: string
): Promise<'canvas' | 'relates' | 'blocks'> {
  if (!GRAPH_EDGE_KINDS.has(kind)) throw new ApiError('Некорректный тип связи')
  const k = kind as 'canvas' | 'relates' | 'blocks'
  if (fromNodeId === toNodeId) throw new ApiError('Нельзя связать ноду с самой собой')

  const nodes = await db.graphNode.findMany({
    where: { projectId, id: { in: [fromNodeId, toNodeId] } },
  })
  if (nodes.length !== 2) throw new ApiError('Обе ноды должны принадлежать проекту')
  const from = nodes.find((n) => n.id === fromNodeId)!
  const to = nodes.find((n) => n.id === toNodeId)!

  const fromTask = from.refType === 'task'
  const toTask = to.refType === 'task'
  if (fromTask && toTask) {
    throw new ApiError('Связь между задачами создаётся как blocks/relates задачи')
  }

  const noteOrFile = (n: typeof from) => n.refType === 'note' || n.refType === 'attachment'
  if ((noteOrFile(from) || noteOrFile(to)) && k !== 'canvas') {
    throw new ApiError('Заметки и файлы связываются только визуально')
  }

  const dup = await db.graphEdge.findFirst({
    where: {
      projectId,
      OR: [
        { fromNodeId, toNodeId },
        { fromNodeId: toNodeId, toNodeId: fromNodeId },
      ],
    },
    select: { id: true },
  })
  if (dup) throw new ApiError('Эти ноды уже связаны')

  if (k === 'blocks') {
    const a = nodeEndpoint(from)
    const b = nodeEndpoint(to)
    if (!a || !b) throw new ApiError('blocks можно провести только к задаче или рамке')
    const graph = await loadBlocksGraph(projectId)
    const cycle = findBlocksCycleFromAdj(a, b, blocksAdjacency(graph))
    if (cycle) {
      const pathStr = await formatCyclePath(cycle)
      throw new ApiError(`Эта связь создаст цикл: ${pathStr}`)
    }
  }
  return k
}
