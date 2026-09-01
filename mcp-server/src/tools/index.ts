import { createApiClient } from '../client/api.js'
import { loadMcpConfig } from '../config/env.js'
import { createProjectTools } from './projects.js'
import { createGraphTools } from './graph.js'
import { createInteractionTools } from './interactions.js'
import { createTaskTools } from './tasks.js'
import type { McpTool } from '../types/index.js'

export function buildAllTools(cfg = loadMcpConfig()): McpTool[] {
  const client = createApiClient(cfg)
  return [...createProjectTools(cfg, client), ...createTaskTools(cfg, client), ...createGraphTools(cfg, client), ...createInteractionTools(cfg, client)]
}

export function buildToolHandlerMap(tools: McpTool[]) {
  return new Map(tools.map((t) => [t.definition.name, t.handler]))
}
