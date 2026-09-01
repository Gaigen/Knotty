import { z } from 'zod'
import type { ApiClient } from '../client/api.js'
import { toolName, type McpConfig } from '../config/env.js'
import { getProjectArgsSchema } from '../schemas/common.js'
import type { McpTool } from '../types/index.js'
import { err, ok, zodToJsonSchema } from '../types/index.js'
import { asArray, asRecord, jsonBlock } from '../utils/format.js'

export function createProjectTools(cfg: McpConfig, client: ApiClient): McpTool[] {
  return [
    {
      definition: {
        name: toolName(cfg, 'list_projects'),
        description: 'Список проектов (ключ, название, избранное, счётчик задач)',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      handler: async () => {
        const projects = asArray(await client.getProjects())
        const lines = projects.map((p) => {
          const r = asRecord(p)
          if (!r) return '- (invalid row)'
          const fav = r.isFavorite ? ' ★' : ''
          const counts = asRecord(r.counts)
          const taskCount = counts?.total ?? r.taskCount ?? '—'
          return `- **${r.key}** — ${r.name}${fav} (id: ${r.id}, задач: ${taskCount})`
        })
        return ok(`## Проекты (${projects.length})\n\n${lines.join('\n') || 'Нет проектов'}`)
      },
    },
    {
      definition: {
        name: toolName(cfg, 'get_project'),
        description: 'Проект с workflow-статусами',
        inputSchema: zodToJsonSchema(getProjectArgsSchema),
      },
      handler: async (args) => {
        const parsed = getProjectArgsSchema.safeParse(args)
        if (!parsed.success) return err(parsed.error.message)
        const project = await client.getProject(parsed.data.projectId)
        return ok(jsonBlock(project))
      },
    },
  ]
}
