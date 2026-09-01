/**
 * Smoke-test MCP tools against live API (stdio server not required).
 * Usage: TASKBOARD_API_TOKEN=... bun scripts/smoke-test.ts
 */
import { createApiClient } from '../src/client/api.js'
import { loadMcpConfig } from '../src/config/env.js'
import { buildAllTools } from '../src/tools/index.js'

const cfg = loadMcpConfig()
const client = createApiClient(cfg)
const tools = buildAllTools(cfg)

async function main() {
  console.log('API URL:', cfg.apiUrl)
  console.log('Server:', cfg.serverName, 'prefix:', cfg.toolPrefix)
  console.log('Tools:', tools.map((t) => t.definition.name).join(', '))

  for (const t of tools) {
    const schema = t.definition.inputSchema
    const propCount = schema.properties ? Object.keys(schema.properties).length : 0
    const required = schema.required?.join(',') ?? ''
    console.log(`Schema ${t.definition.name}: props=${propCount} required=${required}`)
    if (t.definition.name.endsWith('_list_projects')) {
      if (propCount !== 0) throw new Error('list_projects must have empty schema')
    } else if (propCount === 0) {
      throw new Error(`${t.definition.name} has empty inputSchema`)
    }
  }

  console.log('---')

  const projects = await client.getProjects()
  const list = Array.isArray(projects) ? projects : []
  console.log('GET /api/projects:', list.length, 'project(s)')
  if (list[0] && typeof list[0] === 'object' && 'id' in (list[0] as object)) {
    const p = list[0] as { id: string; key?: string; name?: string }
    console.log('First:', p.key, p.name, p.id)

    const listTool = tools.find((t) => t.definition.name.endsWith('_list_projects'))
    if (listTool) {
      const res = await listTool.handler({})
      console.log('--- MCP list_projects ---')
      console.log(res.content[0]?.text?.slice(0, 500))
    }

    const tasks = await client.getTasks(p.id)
    console.log('GET tasks:', Array.isArray(tasks) ? tasks.length : 0)

    const listTasks = tools.find((t) => t.definition.name.endsWith('_list_tasks'))
    if (listTasks) {
      const res = await listTasks.handler({ projectId: p.id })
      console.log('--- MCP list_tasks ---')
      console.log(res.content[0]?.text?.slice(0, 500))
    }
  }

  console.log('--- OK')
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
