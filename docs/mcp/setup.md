# Установка MCP

## 1. API-токен в приложении

1. Войдите в таск-трекер.
2. **Аккаунт** (аватар) → **API-токены**.
3. Создайте токен, например «MCP Cursor».
4. **Скопируйте** строку (формат `tb_…`). В UI можно **показать снова** (иконка глаза).

Отозвать токен — удалить в том же диалоге.

## 2. MCP-сервер

```bash
cd mcp-server
bun install
cp .env.example .env
```

`.env`:

```env
TASKBOARD_API_URL=http://localhost:3000
TASKBOARD_API_TOKEN=tb_...
# опционально:
# MCP_TOOL_PREFIX=tb
# MCP_SERVER_NAME=task-board
```

Проверка API:

```bash
curl -s -H "Authorization: Bearer $TASKBOARD_API_TOKEN" "$TASKBOARD_API_URL/api/projects"
```

Запуск:

```bash
bun run dev
```

## 3. Cursor

```bash
cp .cursor/mcp.json.example .cursor/mcp.json
```

Подставьте `TASKBOARD_API_TOKEN`. Ключ в JSON (`task-board`) — только label в Cursor; tools будут `tb_*` если `MCP_TOOL_PREFIX=tb`.

Путь к entrypoint — **от корня репозитория** (`./mcp-server/src/index.ts`). Cursor не всегда применяет `cwd` в `mcp.json`; вариант `cwd: mcp-server` + `src/index.ts` даёт `Module not found`.

Альтернатива из терминала: `bun run mcp:server` (скрипт в корневом `package.json`).

Перезапустите Cursor → Settings → MCP.

## Docker

Knotty (таск-трекер) на `localhost:3000` — MCP на хосте, `TASKBOARD_API_URL=http://localhost:3000`.

## Отладка

- Логи: Cursor → Output → MCP.
- Диагностика MCP — **stderr** (не stdout).
- `GET /api/health` — без авторизации.
