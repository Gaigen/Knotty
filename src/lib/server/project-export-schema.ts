import { z } from 'zod'
import { ApiError } from '@/lib/server/validation'

const taskLinkSchema = z.object({
  type: z.string(),
  direction: z.string(),
  toNumber: z.number().nullable().optional(),
  fromNumber: z.number().nullable().optional(),
})

const taskExportSchema = z.object({
  number: z.number(),
  type: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  labels: z.array(z.string()).optional(),
  parentNumber: z.number().nullable().optional(),
  boardOrder: z.string().optional(),
  links: z.array(taskLinkSchema).optional(),
  comments: z.array(z.object({ body: z.string(), createdAt: z.string().optional() })).optional(),
  attachments: z.array(
    z.object({
      fileName: z.string(),
      size: z.number(),
      mime: z.string(),
      bundlePath: z.string().optional(),
    })
  ).optional(),
})

export const projectExportV1Schema = z.object({
  format: z.literal('task-graph-tracker/v1'),
  exportedAt: z.string().optional(),
  project: z.object({
    key: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    color: z.string().optional(),
  }),
  statuses: z
    .array(
      z.object({
        name: z.string(),
        color: z.string(),
        category: z.number(),
        order: z.number(),
      })
    )
    .optional(),
  tasks: z.array(taskExportSchema).optional(),
  graphNodes: z
    .array(
      z.object({
        refType: z.string(),
        taskNumber: z.number().nullable().optional(),
        x: z.number(),
        y: z.number(),
        w: z.number().nullable().optional(),
        h: z.number().nullable().optional(),
        text: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
        parent: z.number().nullable().optional(),
      })
    )
    .optional(),
  graphEdges: z
    .array(
      z.object({
        from: z.number(),
        to: z.number(),
        kind: z.string().optional(),
      })
    )
    .optional(),
  graphEdgesLegacy: z
    .array(
      z.object({
        fromNodeId: z.string(),
        toNodeId: z.string(),
      })
    )
    .optional(),
})

export type ProjectExportV1 = z.infer<typeof projectExportV1Schema>

export function parseProjectExportV1(raw: unknown): ProjectExportV1 {
  const result = projectExportV1Schema.safeParse(raw)
  if (!result.success) {
    throw new ApiError('Неверный формат файла (ожидается task-graph-tracker/v1)')
  }
  return result.data
}
