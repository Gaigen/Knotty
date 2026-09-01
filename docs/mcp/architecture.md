# Архитектура MCP

## Поток

```
AI-клиент  ←stdio→  mcp-server  ←Bearer token→  /api/*
```

## Именование (без жёсткого бренда)

| Что | Env | Пример |
|-----|-----|--------|
| Имя MCP-сервера | `MCP_SERVER_NAME` | `task-board` |
| Префикс tools | `MCP_TOOL_PREFIX` | `tb_list_projects` |
| Префикс токена | `API_TOKEN_PREFIX` (в приложении) | `tb_abc…` |

Смена названия продукта в UI **не требует** переименования tools, если префиксы заданы в env.

## Auth

- Приложение: `Authorization: Bearer <token>` в `getCurrentUser()`.
- Cookie-сессия для браузера — как раньше.
- Токен в БД: только SHA-256 hash.

## Структура `mcp-server/src/`

См. прежнюю схему: `config/`, `client/api.ts`, `tools/`, `schemas/`.

Tools создаются фабриками `createProjectTools(cfg, client)` — префикс из `cfg.toolPrefix`.

## Расширение

Новый домен → `tools/comments.ts` + методы в `client/api.ts` + строка в `tools/index.ts`.
