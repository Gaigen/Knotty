import { db } from '@/lib/db'
import { PROJECT_COLORS } from '@/lib/config'
import { storeBuffer } from '@/lib/server/storage'
import { ApiError, isValidProjectKey } from '@/lib/server/validation'

export type ProjectExportV1 = {
  format: string
  exportedAt?: string
  project: { key: string; name: string; description?: string; color?: string }
  statuses: Array<{ name: string; color: string; category: number; order: number }>
  tasks: Array<{
    number: number
    type: string
    title: string
    description?: string
    status: string | null
    assigneeId?: string | null
    priority: string
    dueDate?: string | null
    labels?: string[]
    parentNumber?: number | null
    boardOrder?: string
    links?: Array<{ type: string; direction: string; toNumber?: number | null; fromNumber?: number | null }>
    comments?: Array<{ body: string; createdAt?: string }>
    attachments?: Array<{ fileName: string; size: number; mime: string; bundlePath?: string }>
  }>
  graphNodes?: Array<{
    refType: string
    taskNumber?: number | null
    x: number
    y: number
    w?: number | null
    h?: number | null
    text?: string | null
    color?: string | null
    parent?: number | null
  }>
  /** Индексы в graphNodes (новый формат) */
  graphEdges?: Array<{ from: number; to: number; kind?: string }>
  /** Legacy: cuid нод — игнорируется при импорте */
  graphEdgesLegacy?: Array<{ fromNodeId: string; toNodeId: string }>
}

export async function importProjectFromExport(
  userId: string,
  raw: ProjectExportV1,
  opts?: { key?: string; bundleFiles?: Map<string, Buffer> }
): Promise<{ projectId: string; key: string; tasks: number; graphNodes: number; attachments: number }> {
  if (raw.format !== 'task-graph-tracker/v1') {
    throw new ApiError('Неверный формат файла (ожидается task-graph-tracker/v1)')
  }

  const name = (raw.project?.name ?? '').trim()
  if (!name) throw new ApiError('В файле нет названия проекта')

  let key = (opts?.key ?? raw.project.key ?? '').trim().toUpperCase()
  if (!key || !isValidProjectKey(key)) throw new ApiError('Некорректный ключ проекта в файле')

  const exists = await db.project.findUnique({ where: { key }, select: { id: true } })
  if (exists) {
    const base = key.slice(0, 4)
    key = `${base}${Date.now().toString(36).slice(-3).toUpperCase()}`
    if (!isValidProjectKey(key)) key = `IMP${Date.now().toString(36).slice(-2).toUpperCase()}`
  }

  const color =
    raw.project.color && PROJECT_COLORS.includes(raw.project.color) ? raw.project.color : PROJECT_COLORS[0]

  const statusesInput = raw.statuses?.length
    ? raw.statuses
    : [{ name: 'Бэклог', color: '#94a3b8', category: 0, order: 0 }]

  const project = await db.project.create({
    data: {
      key,
      name,
      description: (raw.project.description ?? '').trim(),
      color,
      statuses: {
        create: statusesInput.map((s, i) => ({
          name: s.name,
          color: s.color,
          category: s.category,
          order: s.order ?? i,
        })),
      },
    },
    include: { statuses: true },
  })

  const statusByName = new Map(project.statuses.map((s) => [s.name, s.id]))
  const defaultStatusId = project.statuses[0]?.id
  const numberToId = new Map<number, string>()
  let attachmentCount = 0

  const assigneeIds = [...new Set((raw.tasks ?? []).map((t) => t.assigneeId).filter(Boolean))] as string[]
  const validAssigneeIds = new Set(
    assigneeIds.length
      ? (await db.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true } })).map((u) => u.id)
      : []
  )

  const tasksSorted = [...(raw.tasks ?? [])].sort((a, b) => a.number - b.number)

  for (const t of tasksSorted) {
    const statusId = t.status ? statusByName.get(t.status) ?? defaultStatusId : defaultStatusId
    if (!statusId) throw new ApiError('Не удалось сопоставить статусы')

    const assigneeId = t.assigneeId && validAssigneeIds.has(t.assigneeId) ? t.assigneeId : null

    const created = await db.task.create({
      data: {
        projectId: project.id,
        number: t.number,
        type: t.type,
        title: t.title,
        description: t.description ?? '',
        statusId,
        createdById: userId,
        assigneeId,
        priority: t.priority ?? 'mid',
        dueDate: t.dueDate ? new Date(t.dueDate) : null,
        labels: JSON.stringify(t.labels ?? []),
        boardOrder: t.boardOrder ?? 'a0',
      },
    })
    numberToId.set(t.number, created.id)

    for (const c of t.comments ?? []) {
      await db.comment.create({
        data: { taskId: created.id, authorId: userId, body: c.body },
      })
    }

    for (const a of t.attachments ?? []) {
      const bundlePath = a.bundlePath
      const buf = bundlePath && opts?.bundleFiles?.get(bundlePath)
      if (!buf) continue
      const stored = await storeBuffer(buf, a.fileName, a.mime || 'application/octet-stream')
      await db.attachment.create({
        data: {
          taskId: created.id,
          projectId: project.id,
          fileName: a.fileName,
          size: stored.size,
          mime: a.mime || 'application/octet-stream',
          storageKey: stored.storageKey,
          previewKey: stored.previewKey,
          uploadedById: userId,
        },
      })
      attachmentCount += 1
    }
  }

  for (const t of tasksSorted) {
    const id = numberToId.get(t.number)
    if (!id) continue
    if (t.parentNumber != null) {
      const parentId = numberToId.get(t.parentNumber)
      if (parentId) await db.task.update({ where: { id }, data: { parentId } })
    }
  }

  const linkKeys = new Set<string>()
  for (const t of tasksSorted) {
    const fromId = numberToId.get(t.number)
    if (!fromId) continue
    for (const l of t.links ?? []) {
      if (l.direction === 'out' && l.toNumber != null) {
        const toId = numberToId.get(l.toNumber)
        if (!toId) continue
        const k = `${fromId}:${toId}:${l.type}`
        if (linkKeys.has(k)) continue
        linkKeys.add(k)
        await db.link.create({ data: { fromTaskId: fromId, toTaskId: toId, type: l.type } })
      }
    }
  }

  const graphNodeIds: string[] = []
  const createdByIndex: (string | undefined)[] = []
  let graphNodeCount = 0
  const rawNodes = raw.graphNodes ?? []
  for (let i = 0; i < rawNodes.length; i++) {
    const gn = rawNodes[i]
    let refId: string | null = null
    if (gn.refType === 'task' && gn.taskNumber != null) {
      refId = numberToId.get(gn.taskNumber) ?? null
      if (!refId) continue
    } else if (gn.refType === 'attachment') {
      continue
    }
    const node = await db.graphNode.create({
      data: {
        projectId: project.id,
        refType: gn.refType,
        refId,
        x: gn.x ?? 0,
        y: gn.y ?? 0,
        w: gn.w ?? undefined,
        h: gn.h ?? undefined,
        text: gn.refType === 'note' || gn.refType === 'group' ? gn.text ?? (gn.refType === 'group' ? 'Пачка' : '') : null,
        color: gn.refType === 'group' ? gn.color ?? null : null,
      },
    })
    createdByIndex[i] = node.id
    graphNodeIds.push(node.id)
    graphNodeCount += 1
  }

  for (let i = 0; i < rawNodes.length; i++) {
    const parent = rawNodes[i].parent
    const id = createdByIndex[i]
    if (!id || typeof parent !== 'number') continue
    const parentId = createdByIndex[parent]
    if (!parentId || parentId === id) continue
    await db.graphNode.update({ where: { id }, data: { parentId } }).catch(() => {})
  }

  for (const e of raw.graphEdges ?? []) {
    const fromId = graphNodeIds[e.from]
    const toId = graphNodeIds[e.to]
    if (!fromId || !toId) continue
    const kind = e.kind === 'blocks' || e.kind === 'relates' ? e.kind : 'canvas'
    await db.graphEdge.create({
      data: { projectId: project.id, fromNodeId: fromId, toNodeId: toId, kind },
    }).catch(() => {})
  }

  const maxTaskNumber = tasksSorted.reduce((max, t) => Math.max(max, t.number), 0)
  if (maxTaskNumber > 0) {
    await db.project.update({ where: { id: project.id }, data: { taskSeq: maxTaskNumber } })
  }

  return {
    projectId: project.id,
    key: project.key,
    tasks: numberToId.size,
    graphNodes: graphNodeCount,
    attachments: attachmentCount,
  }
}
