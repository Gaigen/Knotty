export type McpConfig = {
  serverName: string
  toolPrefix: string
  apiUrl: string
  apiToken: string
}

export function loadMcpConfig(): McpConfig {
  const apiUrl = (process.env.TASKBOARD_API_URL ?? process.env.API_URL ?? 'http://localhost:3000').trim()
  const apiToken = (process.env.TASKBOARD_API_TOKEN ?? '').trim()
  const toolPrefix = (process.env.MCP_TOOL_PREFIX ?? 'tb').trim().replace(/[^a-z0-9_]/gi, '').slice(0, 16) || 'tb'
  const serverName = (process.env.MCP_SERVER_NAME ?? 'task-board').trim().replace(/[^a-z0-9-]/gi, '').slice(0, 32) || 'task-board'

  if (!apiToken) {
    throw new Error(
      'TASKBOARD_API_TOKEN не задан. Создайте токен в приложении: Аккаунт → API-токены. См. docs/mcp/setup.md'
    )
  }

  return { serverName, toolPrefix, apiUrl, apiToken }
}

export function toolName(cfg: McpConfig, short: string): string {
  return `${cfg.toolPrefix}_${short}`
}
