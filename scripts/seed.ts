/**
 * Seed демо-данных: один пользователь, 3 проекта, задачи всех типов,
 * иерархия, связи (blocks/relates без циклов), комментарии, история, граф.
 * Запуск: bun scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import { generateKeyBetween } from 'fractional-indexing'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const daysAgo = (d: number) => new Date(now - d * DAY)

async function clear() {
  await db.activity.deleteMany()
  await db.comment.deleteMany()
  await db.link.deleteMany()
  await db.graphNode.deleteMany()
  await db.attachment.deleteMany()
  await db.task.deleteMany()
  await db.status.deleteMany()
  await db.favorite.deleteMany()
  await db.project.deleteMany()
  await db.user.deleteMany()
}

interface TaskSpec {
  n: number
  type: 'epic' | 'story' | 'task' | 'bug'
  title: string
  status: number // индекс статуса
  desc?: string
  assignee?: boolean
  priority?: 'low' | 'mid' | 'high' | 'crit'
  due?: number | null // дней от сегодня (отрицательное = просрочен)
  labels?: string[]
  parent?: number
}

const VERF_TASKS: TaskSpec[] = [
  { n: 1, type: 'epic', title: 'Новая дизайн-система', status: 2, desc: 'Единый визуальный язык для всех продуктов «Верфи».\n\n## Цели\n- Сократить время сборки экранов\n- Убрать расхождения между платформами', priority: 'high', labels: ['design'] },
  { n: 2, type: 'epic', title: 'Переезд на новый фронтенд', status: 1, desc: 'Миграция кабинета с legacy-стека.', priority: 'high', labels: ['frontend'] },
  { n: 3, type: 'story', title: 'Токены и палитра', status: 4, parent: 1, priority: 'mid', labels: ['design'], due: null },
  { n: 4, type: 'story', title: 'Типографика', status: 2, parent: 1, priority: 'mid', labels: ['design'], due: 3 },
  { n: 5, type: 'story', title: 'Компоненты форм', status: 3, parent: 1, priority: 'high', labels: ['design', 'frontend'], due: -2 },
  { n: 6, type: 'story', title: 'Иконки', status: 1, parent: 1, priority: 'low', labels: ['design'] },
  { n: 7, type: 'task', title: 'Собрать палитру из макетов', status: 4, parent: 3, priority: 'mid' },
  { n: 8, type: 'task', title: 'Тёмная тема: переменные', status: 4, parent: 3, priority: 'mid', labels: ['design'] },
  { n: 9, type: 'task', title: 'Подключить шрифты с self-hosting', status: 2, parent: 4, assignee: true, priority: 'mid', labels: ['frontend'] },
  { n: 10, type: 'task', title: 'Модульная сетка страниц', status: 2, parent: 4, assignee: true, priority: 'high', labels: ['design', 'frontend'], due: 5 },
  { n: 11, type: 'task', title: 'Инпуты и текстовые поля', status: 3, parent: 5, assignee: true, priority: 'high', labels: ['frontend'], due: -1 },
  { n: 12, type: 'task', title: 'Селекты и комбобоксы', status: 3, parent: 5, assignee: true, priority: 'high', labels: ['frontend'], due: -4 },
  { n: 13, type: 'bug', title: 'Плейсхолдер обрезается на мобильных', status: 0, parent: 11, priority: 'low', labels: ['frontend', 'ux'] },
  { n: 14, type: 'story', title: 'Роутинг и общий layout', status: 1, parent: 2, priority: 'mid', labels: ['frontend'] },
  { n: 15, type: 'story', title: 'Перенести страницы профиля', status: 0, parent: 2, priority: 'mid', labels: ['frontend'] },
  { n: 16, type: 'task', title: 'Настроить сборку и CI', status: 4, parent: 14, priority: 'mid', labels: ['devops'] },
  { n: 17, type: 'bug', title: 'Утечка памяти в списке операций', status: 2, assignee: true, priority: 'crit', labels: ['backend', 'critical'], due: 1 },
  { n: 18, type: 'task', title: 'Обзор безопасности', status: 1, priority: 'mid', labels: ['security'] },
  { n: 19, type: 'task', title: 'Обновить документацию API', status: 0, priority: 'low', labels: ['docs'] },
  { n: 20, type: 'bug', title: 'Ошибка 500 при экспорте отчёта', status: 4, assignee: true, priority: 'high', labels: ['backend'] },
]

const ORBIT_TASKS: TaskSpec[] = [
  { n: 1, type: 'epic', title: 'MVP профиля пользователя', status: 2, priority: 'high' },
  { n: 2, type: 'story', title: 'Экран входа', status: 4, parent: 1, priority: 'high', labels: ['mobile'] },
  { n: 3, type: 'story', title: 'Редактирование профиля', status: 2, parent: 1, assignee: true, priority: 'mid', labels: ['mobile'], due: 6 },
  { n: 4, type: 'task', title: 'Загрузка аватара', status: 2, parent: 3, assignee: true, priority: 'mid', labels: ['mobile'], due: 2 },
  { n: 5, type: 'task', title: 'Валидация полей', status: 1, parent: 3, priority: 'low' },
  { n: 6, type: 'bug', title: 'Клавиатура перекрывает форму', status: 3, parent: 3, assignee: true, priority: 'high', labels: ['mobile', 'ux'] },
  { n: 7, type: 'story', title: 'Push-уведомления', status: 0, priority: 'mid', labels: ['mobile'] },
  { n: 8, type: 'task', title: 'Схема данных профиля', status: 4, parent: 1, priority: 'mid', labels: ['backend'] },
  { n: 9, type: 'bug', title: 'Краш на Android 12', status: 0, priority: 'crit', labels: ['mobile', 'critical'] },
  { n: 10, type: 'task', title: 'Аналитика событий', status: 0, priority: 'low', labels: ['analytics'] },
]

const DEVX_TASKS: TaskSpec[] = [
  { n: 1, type: 'epic', title: 'Внутренняя платформа инструментов', status: 0, priority: 'mid' },
  { n: 2, type: 'task', title: 'CLI-скелет', status: 0, parent: 1, priority: 'low' },
  { n: 3, type: 'story', title: 'Панель окружений', status: 0, parent: 1, priority: 'mid' },
  { n: 4, type: 'task', title: 'Сбор метрик сборок', status: 1, priority: 'low' },
  { n: 5, type: 'task', title: 'Шаблоны репозиториев', status: 0, priority: 'low' },
]

async function seedProject(opts: {
  key: string
  name: string
  description: string
  color: string
  tasks: TaskSpec[]
  favorite?: boolean
  createdDaysAgo: number
}) {
  const statuses = [
    { name: 'Бэклог', color: '#94a3b8', category: 0 },
    { name: 'К работе', color: '#0f766e', category: 1 },
    { name: 'В работе', color: '#f59e0b', category: 2 },
    { name: 'Ревью', color: '#8b5cf6', category: 2 },
    { name: 'Готово', color: '#16a34a', category: 3 },
  ]
  const project = await db.project.create({
    data: {
      key: opts.key,
      name: opts.name,
      description: opts.description,
      color: opts.color,
      taskSeq: opts.tasks.length,
      createdAt: daysAgo(opts.createdDaysAgo),
      updatedAt: daysAgo(0),
      statuses: { create: statuses.map((s, i) => ({ ...s, order: i })) },
    },
    include: { statuses: true },
  })
  const statusByIdx = project.statuses.sort((a, b) => a.order - b.order)

  // позиции в канбане
  const boardOrders: string[][] = statuses.map(() => [])
  const nextKey = (idx: number) => {
    const prev = boardOrders[idx][boardOrders[idx].length - 1] ?? null
    const k = generateKeyBetween(prev, null)
    boardOrders[idx].push(k)
    return k
  }

  const user = await db.user.findFirstOrThrow()
  const idByNumber = new Map<number, string>()

  for (const t of opts.tasks) {
    const created = await db.task.create({
      data: {
        projectId: project.id,
        number: t.n,
        type: t.type,
        title: t.title,
        description:
          t.desc ??
          (t.type === 'bug'
            ? '### Шаги воспроизведения\n1. Открыть экран\n2. Выполнить действие\n\n**Ожидание:** корректное поведение.\n\n**Факт:** ошибка.'
            : ''),
        statusId: statusByIdx[t.status].id,
        assigneeId: t.assignee ? user.id : null,
        priority: t.priority ?? 'mid',
        dueDate: t.due === null || t.due === undefined ? null : new Date(now + t.due * DAY),
        labels: JSON.stringify(t.labels ?? []),
        parentId: t.parent ? (idByNumber.get(t.parent) ?? null) : null,
        boardOrder: nextKey(t.status),
        createdById: user.id,
        createdAt: daysAgo(Math.max(1, opts.createdDaysAgo - t.n * 0.5)),
        updatedAt: daysAgo(Math.random() * 2),
      },
    })
    idByNumber.set(t.n, created.id)
    await db.activity.create({
      data: {
        taskId: created.id,
        actorId: user.id,
        event: 'created',
        payload: JSON.stringify({ type: t.type, title: t.title }),
        createdAt: created.createdAt,
      },
    })
  }

  if (opts.favorite) {
    await db.favorite.create({ data: { userId: user.id, projectId: project.id } })
  }
  return { project, idByNumber, statusByIdx }
}

async function main() {
  await clear()

  // Демо-пользователь с паролем для входа: alex@knotty.dev / demo123
  // (замените пароль в проде: bun scripts/create-user.ts или через админку)
  const user = await db.user.create({
    data: {
      name: 'Александр Волков',
      email: 'alex@knotty.dev',
      passwordHash: await bcrypt.hash('demo123', 10),
      isAdmin: true,
    },
  })
  void user

  const knotty = await seedProject({
    key: 'KNOT',
    name: 'Knotty — демо проект',
    description: 'Обновление визуального языка и миграция фронта кабинета клиента',
    color: '#0f766e',
    tasks: VERF_TASKS,
    favorite: true,
    createdDaysAgo: 30,
  })

  const orbit = await seedProject({
    key: 'ORBIT',
    name: 'Orbit — мобильное приложение',
    description: 'Кроссплатформенное приложение для клиентов',
    color: '#7c3aed',
    tasks: ORBIT_TASKS,
    createdDaysAgo: 21,
  })

  await seedProject({
    key: 'DEVX',
    name: 'Платформа DevX',
    description: 'Внутренние инструменты разработки',
    color: '#475569',
    tasks: DEVX_TASKS,
    createdDaysAgo: 12,
  })

  // ---- связи (без циклов!) ----
  const V = knotty.idByNumber
  const links: { from: number; to: number; type: 'blocks' | 'relates' }[] = [
    { from: 10, to: 11, type: 'blocks' }, // сетка блокирует инпуты
    { from: 6, to: 12, type: 'blocks' }, // иконки блокируют селекты
    { from: 16, to: 15, type: 'blocks' }, // сборка блокирует перенос страниц
    { from: 17, to: 18, type: 'blocks' }, // утечка блокирует обзор безопасности
    { from: 4, to: 5, type: 'relates' },
    { from: 3, to: 7, type: 'relates' },
    { from: 13, to: 11, type: 'relates' },
  ]
  for (const l of links) {
    await db.link.create({ data: { fromTaskId: V.get(l.from)!, toTaskId: V.get(l.to)!, type: l.type } })
    await db.activity.create({
      data: {
        taskId: V.get(l.from)!,
        actorId: user.id,
        event: 'linked',
        payload: JSON.stringify({ type: l.type, otherKey: `KNOT-${l.to}`, direction: 'out' }),
        createdAt: daysAgo(3),
      },
    })
  }
  const O = orbit.idByNumber
  await db.link.create({ data: { fromTaskId: O.get(4)!, toTaskId: O.get(6)!, type: 'blocks' } })

  // ---- комментарии ----
  const comments: { task: number; body: string; days: number; project: 'knotty' | 'orbit' }[] = [
    {
      task: 11,
      days: 2,
      project: 'knotty',
      body: 'Собрал базовые варианты полей. Столкнулся с расхождением отступов в макетах — уточнил у дизайнера.\n\n- [x] Контур\n- [x] Фокус\n- [ ] Ошибка/валидация\n- [ ] Disabled',
    },
    {
      task: 11,
      days: 1,
      project: 'knotty',
      body: 'Отлично, но состояние ошибки пока отличается от спецификации. В макете красная обводка `1px`, у нас — `2px`.',
    },
    {
      task: 17,
      days: 1,
      project: 'knotty',
      body: 'Нашёл источник: подписки на store не отписываются при закрытии списка. Исправляю.',
    },
    {
      task: 9,
      days: 0.3,
      project: 'knotty',
      body: 'Self-hosting готов, но нужно решить вопрос с лицензией на переменный шрифт.',
    },
    {
      task: 3,
      days: 0.5,
      project: 'orbit',
      body: 'Загрузка аватара: ограничил 2 МБ, превью генерируем на сервере.',
    },
  ]
  for (const c of comments) {
    const taskId = c.project === 'knotty' ? V.get(c.task)! : O.get(c.task)!
    const createdAt = daysAgo(c.days)
    const created = await db.comment.create({
      data: { taskId, authorId: user.id, body: c.body, createdAt, updatedAt: createdAt },
    })
    await db.activity.create({
      data: {
        taskId,
        actorId: user.id,
        event: 'commented',
        payload: JSON.stringify({ commentId: created.id }),
        createdAt,
      },
    })
  }

  // ---- история: пара статусных переходов ----
  const historySpec: { task: number; old: string; new: string; days: number; project: 'knotty' | 'orbit' }[] = [
    { task: 11, old: 'В работе', new: 'Ревью', days: 1, project: 'verf' },
    { task: 17, old: 'К работе', new: 'В работе', days: 0.8, project: 'verf' },
    { task: 20, old: 'Ревью', new: 'Готово', days: 0.4, project: 'verf' },
  ]
  for (const h of historySpec) {
    const taskId = h.project === 'knotty' ? V.get(h.task)! : O.get(h.task)!
    await db.activity.create({
      data: {
        taskId,
        actorId: user.id,
        event: 'status_changed',
        payload: JSON.stringify({ old: h.old, new: h.new }),
        createdAt: daysAgo(h.days),
      },
    })
  }

  // ---- вложение: SVG-мокап ----
  const uploadDir = path.join(process.cwd(), 'data', 'uploads')
  await fs.mkdir(uploadDir, { recursive: true })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="360" viewBox="0 0 560 360">
  <rect width="560" height="360" fill="#f8fafc"/>
  <rect x="40" y="40" width="480" height="60" rx="10" fill="#0f766e" opacity="0.9"/>
  <text x="60" y="76" font-family="sans-serif" font-size="20" fill="#ffffff">Личный кабинет — мокап формы</text>
  <rect x="40" y="130" width="230" height="44" rx="8" fill="#ffffff" stroke="#cbd5e1"/>
  <rect x="290" y="130" width="230" height="44" rx="8" fill="#ffffff" stroke="#cbd5e1"/>
  <rect x="40" y="200" width="480" height="44" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"/>
  <rect x="40" y="270" width="140" height="36" rx="8" fill="#0f766e"/>
  <text x="60" y="294" font-family="sans-serif" font-size="14" fill="#ffffff">Сохранить</text>
</svg>`
  const svgKey = `seed-${randomUUID()}.svg`
  await fs.writeFile(path.join(uploadDir, svgKey), svg, 'utf-8')

  const attachment = await db.attachment.create({
    data: {
      taskId: V.get(11)!,
      projectId: knotty.project.id,
      fileName: 'мокап-инпутов.svg',
      size: Buffer.byteLength(svg),
      mime: 'image/svg+xml',
      storageKey: svgKey,
      uploadedById: user.id,
      createdAt: daysAgo(2),
    },
  })
  await db.activity.create({
    data: {
      taskId: V.get(11)!,
      actorId: user.id,
      event: 'file_added',
      payload: JSON.stringify({ fileName: 'мокап-инпутов.svg', attachmentId: attachment.id }),
      createdAt: daysAgo(2),
    },
  })

  // ---- граф демо-проекта Knotty ----
  const nodePos: { ref: 'task' | 'note' | 'attachment'; num?: number; x: number; y: number; text?: string }[] = [
    { ref: 'task', num: 1, x: 80, y: 300 },
    { ref: 'task', num: 3, x: 420, y: 120 },
    { ref: 'task', num: 4, x: 420, y: 340 },
    { ref: 'task', num: 5, x: 760, y: 120 },
    { ref: 'task', num: 6, x: 420, y: 560 },
    { ref: 'task', num: 7, x: 760, y: 20 },
    { ref: 'task', num: 8, x: 760, y: 220 },
    { ref: 'task', num: 9, x: 760, y: 440 },
    { ref: 'task', num: 10, x: 760, y: 560 },
    { ref: 'task', num: 11, x: 1100, y: 120 },
    { ref: 'task', num: 12, x: 1100, y: 340 },
    { ref: 'task', num: 13, x: 1100, y: 560 },
    { ref: 'note', x: 80, y: 60, text: '## Мостик к дизайн-системе\nНоды слева — эпики, справа — задачи стори.\n\nДвойной клик по заметке — редактирование.' },
    { ref: 'note', x: 1100, y: 20, text: 'Сетка и иконки блокируют компоненты форм — см. рёбра со стрелками.' },
    { ref: 'attachment', x: 80, y: 520 },
  ]
  for (const p of nodePos) {
    await db.graphNode.create({
      data: {
        projectId: knotty.project.id,
        refType: p.ref,
        refId: p.ref === 'task' ? (V.get(p.num!) ?? null) : p.ref === 'attachment' ? attachment.id : null,
        x: p.x,
        y: p.y,
        text: p.ref === 'note' ? p.text ?? '' : null,
        w: p.ref === 'note' ? 260 : null,
        h: p.ref === 'note' ? 120 : null,
      },
    })
  }

  const counts = {
    projects: await db.project.count(),
    tasks: await db.task.count(),
    links: await db.link.count(),
    comments: await db.comment.count(),
    graphNodes: await db.graphNode.count(),
  }
  console.log('Seed завершён:', counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
