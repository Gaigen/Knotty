# Knotty

**Узлы задач и связей на одном полотне.**

Self-hosted таск-трекер: список, канбан и **бесконечный граф** с задачами, заметками и файлами. Один Docker-контейнер — без облака, без подписок, данные на вашем сервере.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-SQLite-2D3748?logo=prisma)](https://www.prisma.io/)

---

## Содержание

- [Зачем Knotty](#зачем-knotty)
- [Возможности](#возможности)
- [Быстрый старт](#быстрый-старт-docker)
- [Первый вход](#первый-вход)
- [Данные и бэкапы](#данные-и-бэкапы)
- [Продакшен](#продакшен)
- [Локальная разработка](#локальная-разработка)
- [MCP для AI-ассистентов](#mcp-для-ai-ассистентов)
- [Экспорт и импорт](#экспорт-и-импорт)
- [Стек](#стек)
- [Структура репозитория](#структура-репозитория)
- [Лицензия](#лицензия)

---

## Зачем Knotty

Большинство трекеров живут либо в **таблице**, либо в **канбане**. Knotty добавляет третье измерение — **граф на канвасе**, где:

- задачи — ноды с живым превью (статус, исполнитель, дедлайн);
- иерархия, блокировки и «связана с» — **разные типы связей** с разным визуалом;
- заметки и файлы — прямо на полотне, с полноэкранным предпросмотром;
- всё остаётся **обычным таск-трекером**: список и доска не убираются.

Подходит для личных проектов, небольших команд и homelab — когда нужен Jira-like без SaaS.

---

## Возможности

### Проекты и задачи

| Область | Что есть |
|--------|----------|
| Проекты | Ключ, цвет, описание, избранное, workflow по статусам |
| Задачи | Epic / Story / Task / Bug, приоритет, дедлайн, лейблы, иерархия |
| Список | Фильтры, сортировка, быстрый поиск, клавиатурная навигация |
| Канбан | Drag-and-drop между колонками, свёрнутые колонки, режим «все колонки на экране» |
| Карточка | Markdown-описание, чеклисты, комментарии, вложения, связи, история |

### Граф (React Flow)

- Бесконечный канвас: панорама, зум, snap-to-grid, миникарта
- Ноды: задачи, заметки (Markdown), файлы (image / PDF / text / video / audio)
- Связи: иерархия, blocks, relates, визуальные (заметка ↔ файл)
- Автораскладка: дерево, столб, полоса
- Фильтры: типы нод, типы связей, статусы, исполнители, поддерево от выбранной
- Панель «Не на канвасе» — задачи проекта, которые ещё не на графе
- Контекстное меню, мультивыделение, поиск ноды на канвасе (`/`)

### Вложения и превью

- Загрузка в задачу или на граф
- Превью: картинки, PDF (pdf.js), Markdown, текст, видео (HTTP Range), аудио
- Полноэкранный viewer, скачивание

### Пользователи и безопасность

- Email + пароль, сессии в **httpOnly** cookie (JWT HS256)
- Роли: администратор / участник
- Персональные **API-токены** для MCP и скриптов
- Секрет сессий генерируется при первом старте и хранится в volume

### Интеграции

- **REST API** — все операции через `/api/*`
- **MCP-сервер** — tools для Cursor и других MCP-клиентов
- Экспорт JSON и ZIP (с файлами), импорт проекта

---

## Быстрый старт (Docker)

Нужен только **Docker 20.10+** с Compose V2.

```bash
git clone <url-репозитория> knotty
cd knotty
docker compose up -d --build
```

Откройте **http://localhost:3000** (или IP сервера).

Логи:

```bash
docker compose logs -f knotty
```

Остановка (данные сохраняются в volume):

```bash
docker compose down
```

Обновление после `git pull`:

```bash
docker compose up -d --build
```

---

## Первый вход

1. Откроется форма **«Первичная настройка»** — создайте администратора (имя, email, пароль).
2. Войдите и создайте проект.
3. Дополнительные пользователи — **Пользователи** в шапке (только админ).

Схема БД применяется при старте контейнера. `AUTH_SECRET` не нужен: генерируется автоматически в `/data/auth_secret`.

---

## Данные и бэкапы

Всё хранится в Docker volume **`verfi-data`** (каталог `/data` в контейнере). Имя volume сохранено для апгрейда с Verfi без переноса данных.

| Путь в volume | Содержимое |
|---------------|------------|
| `custom.db` | SQLite: проекты, задачи, пользователи, граф |
| `uploads/` | Вложения и превью |
| `auth_secret` | Секрет подписи сессий |

Volume переживает `docker compose down`, пересборку образа и перезагрузку сервера.

**Бэкап одной командой** (Linux/macOS):

```bash
docker run --rm -v task-board_verfi-data:/data -v "$PWD/backup:/backup" alpine \
  sh -c "apk add --quiet sqlite && sqlite3 /data/custom.db \".backup '/backup/knotty-$(date +%F).db'\" && tar czf /backup/uploads-$(date +%F).tgz -C /data uploads"
```

**Cron** (bare-metal, путь к БД свой):

```bash
0 3 * * * sqlite3 /var/lib/knotty/custom.db ".backup '/backup/knotty-$(date +\%F).db'" && find /backup -name 'knotty-*.db' -mtime +14 -delete
```

**Данные в папке на хосте** — в `docker-compose.yml` замените volume на `./data:/data` и выполните `chown -R 1000:1000 ./data`.

---

## Продакшен

Проброс порта в `docker-compose.yml` (по умолчанию `3000:3000`). Перед приложением — reverse proxy с TLS.

**Caddy:**

```caddy
knotty.example.com {
  reverse_proxy localhost:3000
}
```

**Переменные окружения** (опционально):

| Переменная | Описание |
|------------|----------|
| `AUTH_SECRET` | Фиксированный секрет сессий (если не задан — автоген в volume) |
| `PORT` | Порт внутри контейнера (по умолчанию 3000) |
| `TZ` | Часовой пояс контейнера |

---

## Локальная разработка

Требования: **Node 22+**, **Bun** (или npm).

```bash
bun install
bun run db:push
bun run dev
```

Приложение: http://localhost:3000

**Демо-данные:**

```bash
bun scripts/seed.ts
# alex@knotty.dev / demo123
```

**Скрипты:**

| Команда | Действие |
|---------|----------|
| `bun run dev` | Dev-сервер |
| `bun run build` | Production build (standalone) |
| `bun run lint` | ESLint |
| `bun run db:push` | Схема Prisma → SQLite |
| `bun run db:migrate` | Миграции в dev |
| `bun run mcp:server` | MCP-сервер (stdio) |

Пути для bare-metal (без Docker):

```bash
export DATABASE_URL="file:/var/lib/knotty/custom.db"
export UPLOADS_DIR="/var/lib/knotty/uploads"
```

---

## MCP для AI-ассистентов

MCP-сервер в `mcp-server/` даёт AI доступ к REST API через tools (префикс по умолчанию `tb_`).

1. В UI: **Аккаунт → API-токены → Создать**
2. Скопируйте токен в env MCP-сервера

```bash
cd mcp-server
bun install
cp .env.example .env   # TASKBOARD_API_TOKEN=...
bun run dev
```

**Tools (примеры):** `tb_list_projects`, `tb_list_tasks`, `tb_create_task`, `tb_update_task`, `tb_search_tasks`, `tb_add_comment`, `tb_add_to_graph`, `tb_create_link`, `tb_list_links`, `tb_delete_link`

Подробнее: [docs/mcp/README.md](docs/mcp/README.md)

Пример для Cursor: `.cursor/mcp.json.example`

---

## Экспорт и импорт

| Действие | Где |
|----------|-----|
| Экспорт JSON | Меню проекта → Экспорт JSON |
| Экспорт ZIP (с файлами) | Меню проекта → Экспорт ZIP |
| Импорт | Лаунчер → Import |

API: `GET /api/projects/:id/export`, `GET /api/projects/:id/export/bundle`, `POST /api/projects/import`

---

## Стек

| Слой | Технологии |
|------|------------|
| UI | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| Граф | @xyflow/react, @dagrejs/dagre |
| Канбан | @dnd-kit |
| Редактор | MDX Editor, Markdown |
| PDF | pdf.js (legacy build) |
| Backend | Next.js Route Handlers, Prisma, SQLite |
| Auth | bcrypt, JWT в cookie, API Bearer tokens |
| Runtime | Node 22 Alpine, Docker multi-stage |

---

## Структура репозитория

```
knotty/
├── src/                 # Next.js приложение (app, components, lib)
├── prisma/              # Схема и миграции SQLite
├── mcp-server/          # MCP (stdio → REST API)
├── docker/              # entrypoint, migrate
├── docs/mcp/            # Документация MCP
├── public/              # Статика (pdf.worker и др.)
├── docker-compose.yml
├── Dockerfile
└── LICENSE              # GNU GPLv3
```

---

## Лицензия

**GNU General Public License v3.0** — см. [LICENSE](LICENSE).

Knotty — свободное программное обеспечение: можно использовать, изменять и распространять при соблюдении GPLv3. Проприетарные встраивания без соблюдения лицензии не разрешены.

---

## Благодарности

Построен на отличных open-source проектах: Next.js, Prisma, React Flow, shadcn/ui и многих других — перечислены в `package.json`.
