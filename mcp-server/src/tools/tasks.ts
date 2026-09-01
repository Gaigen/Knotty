import type { ApiClient } from '../client/api.js'
import { toolName, type McpConfig } from '../config/env.js'
import {
  getTaskArgsSchema,
  listTasksArgsSchema,
} from '../schemas/common.js'
import { createTaskSchema, updateTaskSchema } from '../schemas/tasks.js'
import type { McpTool } from '../types/index.js'
import { err, ok, zodToJsonSchema } from '../types/index.js'
import { asArray, asRecord, jsonBlock } from '../utils/format.js'

export function createTaskTools(cfg: McpConfig, client: ApiClient): McpTool[] {
  return [
    {
      definition: {
        name: toolName(cfg, 'list_tasks'),
        description: 'Список задач проекта (опциональный поиск q)',
        inputSchema: zodToJsonSchema(listTasksArgsSchema),
      },
      handler: async (args) => {
        const parsed = listTasksArgsSchema.safeParse(args)
        if (!parsed.success) return err(parsed.error.message)
        const tasks = asArray(await client.getTasks(parsed.data.projectId, parsed.data.q))
        const lines = tasks.map((t) => {
          const r = asRecord(t)
          if (!r) return '- (invalid row)'
          return `- **${r.key}** ${r.title} — statusId: ${r.statusId} (id: ${r.id})`
        })
        return ok(`## Задачи (${tasks.length})\n\n${lines.join('\n') || 'Нет задач'}`)
      },
    },
    {
      definition: {
        name: toolName(cfg, 'get_task'),
        description: 'Полная задача: описание, подзадачи, комментарии, связи',
        inputSchema: zodToJsonSchema(getTaskArgsSchema),
      },
      handler: async (args) => {
        const parsed = getTaskArgsSchema.safeParse(args)
        if (!parsed.success) return err(parsed.error.message)
        const task = await client.getTask(parsed.data.taskId)
        return ok(jsonBlock(task))
      },
    },
    {
      definition: {
        name: toolName(cfg, 'create_task'),
        description: 'Создать задачу или подзадачу в проекте',
        inputSchema: zodToJsonSchema(createTaskSchema),
      },
      handler: async (args) => {
        const parsed = createTaskSchema.safeParse(args)
        if (!parsed.success) return err(parsed.error.message)
        const { projectId, ...body } = parsed.data
        const created = await client.createTask(projectId, body)
        const r = asRecord(created)
        const key = r?.key ?? '—'
        return ok(`Создана задача **${key}**\n\n${jsonBlock(created)}`)
      },
    },
    {
      definition: {
        name: toolName(cfg, 'update_task'),
        description: 'Обновить задачу (статус, исполнитель, срок, описание и др.)',
        inputSchema: zodToJsonSchema(updateTaskSchema),
      },
      handler: async (args) => {
        const parsed = updateTaskSchema.safeParse(args)
        if (!parsed.success) return err(parsed.error.message)
        const { taskId, ...body } = parsed.data
        const updated = await client.updateTask(taskId, body)
        const r = asRecord(updated)
        return ok(`Обновлена задача **${r?.key ?? taskId}**\n\n${jsonBlock(updated)}`)
      },
    },
  ]
}
