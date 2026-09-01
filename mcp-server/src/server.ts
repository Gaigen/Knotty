import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { loadMcpConfig } from './config/env.js'
import { buildAllTools, buildToolHandlerMap } from './tools/index.js'

export function createMcpServer() {
  const cfg = loadMcpConfig()
  const tools = buildAllTools(cfg)
  const handlerMap = buildToolHandlerMap(tools)

  const server = new Server(
    { name: cfg.serverName, version: '0.2.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => t.definition),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name
    const handler = handlerMap.get(name)

    if (!handler) {
      return {
        content: [{ type: 'text', text: `Неизвестный tool: ${name}` }],
        isError: true,
      }
    }

    try {
      return await handler((request.params.arguments ?? {}) as Record<string, unknown>)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        content: [{ type: 'text', text: `Ошибка MCP (${cfg.serverName}): ${msg}` }],
        isError: true,
      }
    }
  })

  return server
}

export async function runMcpServer() {
  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
