import { runMcpServer } from './server.js'

runMcpServer().catch((err) => {
  console.error('[mcp] fatal:', err)
  process.exit(1)
})
