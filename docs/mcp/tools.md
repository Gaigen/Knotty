# Каталог MCP tools

Префикс по умолчанию: **`tb_`** (`MCP_TOOL_PREFIX`).

## Projects

| Tool | Статус | Описание |
|------|--------|----------|
| `tb_list_projects` | ✅ | Список проектов |
| `tb_get_project` | ✅ | Проект + статусы |

## Tasks

| Tool | Статус | Описание |
|------|--------|----------|
| `tb_list_tasks` | ✅ | Задачи проекта (`q` — поиск) |
| `tb_get_task` | ✅ | Полная задача |
| `tb_create_task` | ✅ | Создание |
| `tb_update_task` | ✅ | PATCH |

## Graph

| Tool | Статус | Описание |
|------|--------|----------|
| `tb_add_to_graph` | ✅ | Массовое добавление задач на канвас (`all` или `taskIds`) |
| `tb_create_link` | ✅ | Связь `blocks` / `relates` между задачами (авто-ноды на графе) |
| `tb_list_links` | ✅ | Связи задачи (входящие / исходящие) |
| `tb_delete_link` | ✅ | Удалить связь по `linkId` |

## Interactions

| Tool | Статус | Описание |
|------|--------|----------|
| `tb_add_comment` | ✅ | Комментарий к задаче |
| `tb_search_tasks` | ✅ | Поиск по всем проектам или `projectId` |

## Позже

| Tool | Описание |
|------|----------|
| `tb_upload_attachment` | Загрузка файла к задаче |

## Пример

```json
{
  "name": "tb_create_task",
  "arguments": {
    "projectId": "…",
    "title": "Из MCP",
    "type": "task"
  }
}
```
