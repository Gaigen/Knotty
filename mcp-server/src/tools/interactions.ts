import type { ApiClient } from '../client/api.js'
import { toolName, type McpConfig } from '../config/env.js'
import { addCommentSchema, searchTasksSchema } from '../schemas/interactions.js'
import type { McpTool } from '../types/index.js'
import { err, ok, zodToJsonSchema } from '../types/index.js'
import { asArray, asRecord, jsonBlock } from '../utils/format.js'

export function createInteractionTools(cfg: McpConfig, client: ApiClient): McpTool[] {
  return [
    {
      definition: {
        name: toolName(cfg, 'add_comment'),
        description: 'Добавить комментарий к задаче',
        inputSchema: zodToJsonSchema(addCommentSchema),
      },
      handler: async (args) => {
        const parsed = addCommentSchema.safeParse(args)
        if (!parsed.success) return err(parsed.error.message)
        const { taskId, body } = parsed.data
        const comment = await client.addComment(taskId, body)
        const r = asRecord(comment)
        return ok(`Комментарий добавлен (id: ${r?.id ?? '—'})\n\n${jsonBlock(comment)}`)
      },
    },
    {
      definition: {
        name: toolName(cfg, 'search_tasks'),
        description: 'Поиск задач по всем проектам или внутри projectId',
        inputSchema: zodToJsonSchema(searchTasksSchema),
      },
      handler: async (args) => {
        const parsed = searchTasksSchema.safeParse(args)
        if (!parsed.success) return err(parsed.error.message)
        const { q, projectId, limit } = parsed.data
        const res = await client.searchTasks(q, projectId, limit)
        const tasks = asArray(res.tasks)
        const lines = tasks.map((t) => {
          const r = asRecord(t)
          if (!r) return '- (invalid row)'
          return `- **${r.key}** ${r.title} (id: ${r.id}, projectId: ${r.projectId})`
        })
        return ok(`## Поиск «${q}» — ${res.count} совпадений\n\n${lines.join('\n') || 'Ничего не найдено'}`)
      },
    },
  ]
}
