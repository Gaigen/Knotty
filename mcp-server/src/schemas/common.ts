import { z } from 'zod'

export const projectIdSchema = z.string().min(1).describe('ID проекта Knotty')
export const taskIdSchema = z.string().min(1).describe('ID задачи Knotty')

export const listTasksArgsSchema = z.object({
  projectId: projectIdSchema,
  q: z.string().optional().describe('Поисковый запрос'),
})

export const getProjectArgsSchema = z.object({
  projectId: projectIdSchema,
})

export const getTaskArgsSchema = z.object({
  taskId: taskIdSchema,
})
