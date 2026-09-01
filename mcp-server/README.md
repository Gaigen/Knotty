# MCP-сервер

Локальный MCP для REST API таск-трекера. Документация: [docs/mcp/README.md](../docs/mcp/README.md).

```bash
bun install
cp .env.example .env   # TASKBOARD_API_TOKEN из UI
bun run dev
```

Префикс tools (`tb_list_projects`) и имя сервера настраиваются через env — не завязаны на финальное название продукта.
