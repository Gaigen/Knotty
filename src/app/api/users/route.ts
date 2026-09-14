import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson, requireAdmin } from '@/lib/server/context'
import { apiError } from '@/lib/server/i18n'
import { hashPassword, validatePassword } from '@/lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_NAME = 80

/** Список пользователей — доступен всем авторизованным (селектор «Исполнитель»). */
export async function GET() {
  try {
    await getCurrentUser()
    const users = await db.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        isAdmin: true,
        passwordHash: true,
        createdAt: true,
        _count: { select: { assignedTasks: true } },
      },
    })
    return Response.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        isAdmin: u.isAdmin,
        hasPassword: !!u.passwordHash,
        createdAt: u.createdAt.toISOString(),
        assignedTasksCount: u._count.assignedTasks,
      }))
    )
  } catch (e) {
    return await jsonError(e)
  }
}

interface CreateUserBody {
  name?: string
  email?: string
  avatarUrl?: string
  password?: string
  isAdmin?: boolean
}

/** Создание пользователя — только администратор. */
export async function POST(req: Request) {
  try {
    await requireAdmin()
    const body = await readJson<CreateUserBody>(req)
    const name = (body.name ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    const avatarUrlRaw = (body.avatarUrl ?? '').trim()
    const avatarUrl = avatarUrlRaw === '' ? null : avatarUrlRaw

    if (!name) throw await apiError('nameRequired')
    if (name.length > MAX_NAME) throw await apiError('nameTooLong', { max: MAX_NAME })
    if (!EMAIL_RE.test(email)) throw await apiError('invalidEmail')

    const pwError = validatePassword(body.password)
    if (pwError) throw await apiError(pwError)

    const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) throw await apiError('userEmailExists', { email })

    const user = await db.user.create({
      data: {
        name,
        email,
        ...(avatarUrl ? { avatarUrl } : {}),
        passwordHash: await hashPassword(body.password as string),
        isAdmin: !!body.isAdmin,
      },
    })
    return Response.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
        hasPassword: true,
        createdAt: user.createdAt.toISOString(),
        assignedTasksCount: 0,
      },
      { status: 201 }
    )
  } catch (e) {
    return await jsonError(e)
  }
}
