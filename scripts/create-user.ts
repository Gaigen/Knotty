/**
 * CLI: создать пользователя (исполнителя) в БД.
 *
 * Использование:
 *   bun scripts/create-user.ts "Иван Петров" ivan@example.com --password secret123
 *   bun scripts/create-user.ts "Мария" maria@example.com --avatar https://example.com/a.png --admin
 *
 * Также: список всех пользователей
 *   bun scripts/create-user.ts --list
 *
 * Также: удалить пользователя по id (его задачи получат assigneeId = null)
 *   bun scripts/create-user.ts --delete <id>
 *
 * Скрипт читает DATABASE_URL из .env в корне проекта.
 */
import { PrismaClient, type User } from '@prisma/client'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

// --- Загрузка .env из корня проекта (минимальный парсер) ---
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf-8')
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, k, vRaw] = m
    const v = vRaw.replace(/^["']|["']$/g, '').trim()
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv()

function printUsers(users: User[]) {
  if (users.length === 0) {
    console.log('Пользователей в БД нет.')
    return
  }
  const colWidthId = 28
  const colWidthName = Math.max(4, ...users.map((u) => u.name.length)) + 2
  const colWidthEmail = Math.max(5, ...users.map((u) => u.email.length)) + 2
  console.log(
    `${'id'.padEnd(colWidthId)}${'имя'.padEnd(colWidthName)}${'email'.padEnd(colWidthEmail)}создан`
  )
  console.log('-'.repeat(colWidthId + colWidthName + colWidthEmail + 20))
  for (const u of users) {
    console.log(
      `${u.id.padEnd(colWidthId)}${u.name.padEnd(colWidthName)}${u.email.padEnd(colWidthEmail)}${u.createdAt.toISOString().slice(0, 19)}`
    )
  }
  console.log(`\nВсего: ${users.length}`)
}

async function main() {
  const args = process.argv.slice(2)

  // --list
  if (args[0] === '--list' || args[0] === '-l') {
    const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } })
    printUsers(users)
    return
  }

  // --delete <id>
  if (args[0] === '--delete' || args[0] === '-d') {
    const id = args[1]
    if (!id) {
      console.error('Укажите id пользователя: bun scripts/create-user.ts --delete <id>')
      process.exit(1)
    }
    const u = await db.user.findUnique({ where: { id } })
    if (!u) {
      console.error(`Пользователь с id=${id} не найден. Список: bun scripts/create-user.ts --list`)
      process.exit(1)
    }
    // Задачи этого пользователя получат assigneeId = null (по схеме — SetNull)
    const tasks = await db.task.count({ where: { assigneeId: id } })
    await db.user.delete({ where: { id } })
    console.log(`Удалён: ${u.name} <${u.email}>. Задач с него снято: ${tasks}.`)
    return
  }

  // create: name email [--password pw] [--avatar URL] [--admin]
  const name = args[0]
  const email = args[1]
  if (!name || !email) {
    console.error(
      'Использование:\n' +
        '  bun scripts/create-user.ts "Имя" email@example.com [--password pw] [--avatar URL] [--admin]\n' +
        '  bun scripts/create-user.ts --list\n' +
        '  bun scripts/create-user.ts --delete <id>'
    )
    process.exit(1)
  }

  // валидация email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`Некорректный email: "${email}"`)
    process.exit(1)
  }

  // проверка уникальности
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    console.error(`Пользователь с email "${email}" уже существует:`)
    console.error(`  id:    ${existing.id}`)
    console.error(`  имя:   ${existing.name}`)
    process.exit(1)
  }

  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : undefined
  }

  const password = flag('--password')
  if (password !== undefined && password.length < 6) {
    console.error('Пароль: минимум 6 символов')
    process.exit(1)
  }
  const avatarUrl = flag('--avatar')
  if (args.includes('--avatar') && !avatarUrl) {
    console.error('Укажите URL аватара после --avatar')
    process.exit(1)
  }
  const isAdmin = args.includes('--admin')

  const user = await db.user.create({
    data: {
      name,
      email,
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      isAdmin,
    },
  })

  console.log('Создан пользователь:')
  console.log(`  id:        ${user.id}`)
  console.log(`  имя:       ${user.name}`)
  console.log(`  email:     ${user.email}`)
  if (password) console.log(`  пароль:    задан`)
  else console.log(`  пароль:    НЕТ (вход невозможен — задайте через админку или --password)`)
  console.log(`  админ:     ${user.isAdmin ? 'да' : 'нет'}`)
  if (user.avatarUrl) console.log(`  аватар:    ${user.avatarUrl}`)
  console.log(`  создан:    ${user.createdAt.toISOString()}`)
  console.log('\nТеперь он сразу появится в селекторе «Исполнитель» в задаче.')
}

main()
  .catch((e) => {
    console.error('Ошибка:', e?.message ?? e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
