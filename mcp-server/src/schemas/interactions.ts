import { z } from 'zod'
import { projectIdSchema, taskIdSchema } from './common.js'

export const addCommentSchema = z.object({
  taskId: taskIdSchema,
  body: z.string().min(1).max(20000).describe('Текст комментария (markdown)'),
})

export const searchTasksSchema = z.object({
  q: z.string().min(1).describe('Поисковый запрос: название, ключ, метки, описание'),
  projectId: projectIdSchema.optional().describe('Ограничить одним проектом'),
  limit: z.number().int().min(1).max(100).optional().describe('Макс. результатов (по умолчанию 30)'),
})

export const listLinksSchema = z.object({
  taskId: taskIdSchema,
})

export const deleteLinkSchema = z.object({
  linkId: z.string().min(1).describe('ID связи (linkId из list_links / get_task)'),
})
