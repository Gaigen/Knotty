import { db } from '@/lib/db'
import type { ProjectExportV1 } from '@/lib/server/project-import'

/** Собирает JSON экспорта проекта (формат task-graph-tracker/v1) */
export async function buildProjectExport(projectId: string): Promise<ProjectExportV1 & { tasks: Array<ProjectExportV1['tasks'][number] & { key?: string; createdAt?: string }> }> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      statuses: { orderBy: { order: 'asc' } },
      tasks: {
        orderBy: { number: 'asc' },
        include: {
          comments: { orderBy: { createdAt: 'asc' } },
          attachments: true,
          linksFrom: true,
          linksTo: true,
        },
      },
      graphNodes: true,
      graphEdges: true,
    },
  })
  if (!project) throw new Error('Проект не найден')

  const taskById = new Map(project.tasks.map((t) => [t.id, t]))
  const nodeRows = project.graphNodes
  const nodeIdToIndex = new Map(nodeRows.map((n, i) => [n.id, i]))

  return {
    format: 'task-graph-tracker/v1',
    exportedAt: new Date().toISOString(),
    project: {
      key: project.key,
      name: project.name,
      description: project.description,
      color: project.color,
    },
    statuses: project.statuses.map((s) => ({ name: s.name, color: s.color, category: s.category, order: s.order })),
    tasks: project.tasks.map((t) => ({
      number: t.number,
      key: `${project.key}-${t.number}`,
      type: t.type,
      title: t.title,
      description: t.description,
      status: project.statuses.find((s) => s.id === t.statusId)?.name ?? null,
      assigneeId: t.assigneeId,
      priority: t.priority,
      dueDate: t.dueDate?.toISOString() ?? null,
      labels: JSON.parse(t.labels || '[]'),
      parentNumber: t.parentId ? project.tasks.find((x) => x.id === t.parentId)?.number ?? null : null,
      boardOrder: t.boardOrder,
      createdAt: t.createdAt.toISOString(),
      links: [
        ...t.linksFrom.map((l) => ({
          type: l.type,
          direction: 'out',
          toNumber: project.tasks.find((x) => x.id === l.toTaskId)?.number ?? null,
        })),
        ...t.linksTo.map((l) => ({
          type: l.type,
          direction: 'in',
          fromNumber: project.tasks.find((x) => x.id === l.fromTaskId)?.number ?? null,
        })),
      ],
      comments: t.comments.map((c) => ({ body: c.body, createdAt: c.createdAt.toISOString() })),
      attachments: t.attachments.map((a, i) => ({
        fileName: a.fileName,
        size: a.size,
        mime: a.mime,
        bundlePath: `files/${t.number}/${i}_${sanitizeBundleFileName(a.fileName)}`,
        storageKey: a.storageKey,
        previewKey: a.previewKey,
      })),
    })),
    graphNodes: nodeRows.map((n) => ({
      refType: n.refType,
      taskNumber:
        n.refType === 'task' && n.refId ? taskById.get(n.refId)?.number ?? null : null,
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
      text: n.text,
      parent: n.parentId != null ? nodeIdToIndex.get(n.parentId) ?? null : null,
    })),
    graphEdges: project.graphEdges
      .map((e) => {
        const from = nodeIdToIndex.get(e.fromNodeId)
        const to = nodeIdToIndex.get(e.toNodeId)
        if (from == null || to == null) return null
        return { from, to, kind: e.kind }
      })
      .filter((x): x is { from: number; to: number; kind: string } => x != null),
  }
}

function sanitizeBundleFileName(name: string): string {
  const base = name.replace(/[^\w.\-()+\s]/g, '_').trim() || 'file'
  return base.length > 120 ? base.slice(0, 120) : base
}

export function stripBundleInternals(data: ProjectExportV1): ProjectExportV1 {
  return {
    ...data,
    tasks: (data.tasks ?? []).map((t) => ({
      ...t,
      attachments: (t.attachments ?? []).map((a) => ({
        fileName: a.fileName,
        size: a.size,
        mime: a.mime,
        ...(a.bundlePath ? { bundlePath: a.bundlePath } : {}),
      })),
    })),
  }
}
