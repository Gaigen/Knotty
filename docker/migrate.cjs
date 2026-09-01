#!/usr/bin/env node
/**
 * Мини-раннер миграций для Docker-образа (заменяет prisma CLI в runtime).
 *
 * Зачем: prisma CLI тянет большой closure зависимостей (@prisma/config → effect,
 * c12…), который легко недокопировать в slim-образ. Здесь же применяется
 * только SQL из prisma/migrations/ через уже сгенерированный PrismaClient
 * (он и так нужен серверу), поэтому скрипт самодостаточен.
 *
 * Правила:
 *  - миграции применяются в лексическом порядке имён папок, по одной,
 *    каждая — в транзакции + запись в _verfi_migrations;
 *  - повторный запуск ничего не делает (идемпотентно);
 *  - если БД уже содержит таблицы, но без истории миграций (перенос старой
 *    установки) — все миграции помечаются применёнными, ничего не ломается.
 *
 * Использование: DATABASE_URL=file:…  node docker/migrate.cjs
 */
const fs = require('node:fs')
const path = require('node:path')

const url = process.env.DATABASE_URL || ''
const match = url.match(/^file:(.+)$/)
if (!match) {
  console.error('[migrate] Ошибка: DATABASE_URL должен быть вида file:/путь/к/custom.db')
  process.exit(1)
}
const dbFile = path.resolve(match[1])

// Пустой файл — валидная пустая SQLite-база; создаем при первом старте
if (!fs.existsSync(dbFile)) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true })
  fs.writeFileSync(dbFile, '')
}

// PrismaClient из standalone (пути — относительно этого скрипта: docker/../)
const clientPath = path.join(__dirname, '..', 'node_modules', '.prisma', 'client', 'index.js')
const { PrismaClient } = require(clientPath)
const db = new PrismaClient()

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations')

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return []
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^[0-9]+[a-z0-9_]*$/i.test(name))
    .filter((name) => fs.existsSync(path.join(MIGRATIONS_DIR, name, 'migration.sql')))
    .sort()
}

/** Разбивка SQL на стейтменты: по ';' на конце строки — для DDL от prisma это безопасно */
function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/--[^\n]*/g, '').trim().length > 0)
}

async function main() {
  await db.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS "_verfi_migrations" (' +
      '"name" TEXT NOT NULL PRIMARY KEY, "applied_at" TEXT NOT NULL DEFAULT (datetime(\'now\')))'
  )

  const applied = new Set(
    (await db.$queryRawUnsafe('SELECT "name" FROM "_verfi_migrations"')).map((r) => r.name)
  )
  const migrations = listMigrations()
  const tables = await db.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  )

  // Перенос старой установки: реальные таблицы есть, истории нет → пометить всё применённым
  // (_verfi_migrations не считается — она создаётся строкой выше)
  const hasRealTables = tables.some((t) => t.name !== '_verfi_migrations')
  if (hasRealTables && applied.size === 0 && migrations.length > 0) {
    for (const name of migrations) {
      await db.$executeRawUnsafe(
        `INSERT INTO "_verfi_migrations" ("name") VALUES ('${name}')`
      )
    }
    console.log(
      `[migrate] Существующая БД (${tables.filter((t) => t.name !== '_verfi_migrations').length} таблиц) принята — ${migrations.length} миграций помечено применёнными`
    )
    return
  }

  let done = 0
  for (const name of migrations) {
    if (applied.has(name)) continue
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8')
    const statements = splitStatements(sql)
    await db.$transaction(async (tx) => {
      for (const st of statements) {
        await tx.$executeRawUnsafe(st)
      }
      await tx.$executeRawUnsafe(`INSERT INTO "_verfi_migrations" ("name") VALUES ('${name}')`)
    })
    done++
    console.log(`[migrate] Применена: ${name} (${statements.length} операций)`)
  }
  console.log(done === 0 ? '[migrate] Схема актуальна, изменений нет' : `[migrate] Готово: применено ${done}`)
}

main()
  .catch((e) => {
    console.error('[migrate] Ошибка применения миграций:', e.message || e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect().catch(() => {}))
