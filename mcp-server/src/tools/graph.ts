import { z } from 'zod'
import type { ApiClient } from '../client/api.js'
import { toolName, type McpConfig } from '../config/env.js'
import { projectIdSchema, taskIdSchema } from '../schemas/common.js'
import { deleteLinkSchema, listLinksSchema } from '../schemas/interactions.js'
import type { McpTool } from '../types/index.js'
import { err, ok, zodToJsonSchema } from '../types/index.js'
import { asArray, asRecord, jsonBlock } from '../utils/format.js'

const bulkAddSchema = z.object({
  projectId: projectIdSchema,
  all: z.boolean().optional().describe('Добавить все задачи проекта без ноды на канвас'),
  taskIds: z.array(z.string().min(1)).optional().describe('Конкретные ID задач'),
})

const createLinkSchema = z.object({
  fromTaskId: taskIdSchema,
  toTaskId: z.string().optional().describe('ID целевой задачи'),
  toKey: z.string().optional().describe('Ключ целевой задачи, например DDTSS-12'),
  type: z.enum(['blocks', 'relates']).optional().describe('blocks или relates (по умолчанию relates)'),
})

export function createGraphTools(cfg: McpConfig, client: ApiClient): McpTool[] {
  return [
    {
      definition: {
        name: toolName(cfg, 'add_to_graph'),
        description: 'Добавить задачи на канвас графа (все без ноды или по taskIds)',
        inputSchema: zodToJsonSchema(bulkAddSchema),
      },
      handler: async (args) => {
        const parsed = bulkAddSchema.safeParse(args)
        if (!parsed.success) return err(parsed.error.message)
        const { projectId, all, taskIds } = parsed.data
        if (!all && (!taskIds || taskIds.length === 0)) {
          return err('Укажите all: true или taskIds')
        }
        const res = await client.bulkAddToGraph(projectId, all ? { all: true } : { taskIds })
        return ok(`На граф добавлено задач: ${res.created}\n\n${jsonBlock(res)}`)
      },
    },
    {
      definition: {
        name: toolName(cfg, 'create_link'),
        description: 'Связь между задачами (blocks/relates). Задачи при необходимости появятся на графе',
        inputSchema: zodToJsonSchema(createLinkSchema),
      },
      handler: async (args) => {
        const parsed = createLinkSchema.safeParse(args)
        if (!parsed.success) return err(parsed.error.message)
        const { fromTaskId, toTaskId, toKey, type } = parsed.data
        if (!toTaskId && !toKey) return err('Укажите toTaskId или toKey')
        const res = await client.createLink(fromTaskId, { toTaskId, toKey, type })
        const r = asRecord(res)
        const added = r?.graphNodesAdded ?? 0
        return ok(
          `Связь создана (${type ?? 'relates'}). На граф добавлено задач: ${added}\n\n${jsonBlock(res)}`
        )
      },
    },
    {
      definition: {
        name: toolName(cfg, 'list_links'),
        description: 'Связи задачи: blocks/relates входящие и исходящие',
        inputSchema: zodToJsonSchema(listLinksSchema),
      },
      handler: async (args) => {
        const parsed = listLinksSchema.safeParse(args)
        if (!parsed.success) return err(parsed.error.message)
        const task = asRecord(await client.getTask(parsed.data.taskId))
        if (!task) return err('Задача не найдена')
        const links = asArray(task.links)
        if (links.length === 0) return ok('Связей нет')
        const lines = links.map((l) => {
          const r = asRecord(l)
          const linkTask = asRecord(r?.task)
          const dir = r?.dir === 'in' ? '←' : '→'
          return `- ${dir} **${linkTask?.key ?? '?'}** ${linkTask?.title ?? ''} — ${r?.type} (linkId: ${r?.linkId})`
        })
        return ok(`## Связи **${task.key}** (${links.length})\n\n${lines.join('\n')}`)
      },
    },
    {
      definition: {
        name: toolName(cfg, 'delete_link'),
        description: 'Удалить связь blocks/relates по linkId',
        inputSchema: zodToJsonSchema(deleteLinkSchema),
      },
      handler: async (args) => {
        const parsed = deleteLinkSchema.safeParse(args)
        if (!parsed.success) return err(parsed.error.message)
        await client.deleteLink(parsed.data.linkId)
        return ok(`Связь ${parsed.data.linkId} удалена`)
      },
    },
  ]
}
