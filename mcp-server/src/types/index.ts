import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { toJSONSchema, type z } from 'zod'

export type McpToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}>

export type McpTool = {
  definition: Tool
  handler: McpToolHandler
}

/** Zod v4 → JSON Schema для MCP `inputSchema` (properties + required). */
export function zodToJsonSchema(schema: z.ZodType): Tool['inputSchema'] {
  const json = toJSONSchema(schema, { target: 'draft-2020-12' })

  const result: Tool['inputSchema'] = { type: 'object' }

  if (json.properties && typeof json.properties === 'object') {
    result.properties = json.properties as Tool['inputSchema']['properties']
  }

  if (Array.isArray(json.required) && json.required.length > 0) {
    result.required = json.required
  }

  return result
}

export function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

export function err(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true }
}
