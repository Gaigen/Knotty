import { z } from 'zod'
import { projectIdSchema, taskIdSchema } from './common.js'

export const createTaskSchema = z.object({
  projectId: projectIdSchema,
  title: z.string().min(1).describe('Название задачи'),
  type: z
    .enum(['epic', 'story', 'task', 'bug'])
    .optional()
    .describe('Тип: epic, story, task, bug (по умолчанию task)'),
  statusId: z.string().optional().describe('ID статуса workflow'),
  parentId: z.string().nullable().optional().describe('ID родительской задачи (подзадача)'),
  assigneeId: z.string().nullable().optional().describe('ID исполнителя'),
  priority: z
    .enum(['low', 'mid', 'high', 'crit'])
    .optional()
    .describe('Приоритет: low, mid, high, crit'),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .describe('Срок (ISO date, например 2026-09-01)'),
  description: z.string().optional().describe('Описание (markdown)'),
})

export const updateTaskSchema = z.object({
  taskId: taskIdSchema,
  title: z.string().optional().describe('Новое название'),
  statusId: z.string().optional().describe('ID статуса workflow'),
  assigneeId: z.string().nullable().optional().describe('ID исполнителя'),
  priority: z
    .enum(['low', 'mid', 'high', 'crit'])
    .optional()
    .describe('Приоритет: low, mid, high, crit'),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .describe('Срок (ISO date) или null'),
  description: z.string().optional().describe('Описание (markdown)'),
  parentId: z.string().nullable().optional().describe('ID родителя или null'),
})
