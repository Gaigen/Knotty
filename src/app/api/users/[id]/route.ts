import { db } from '@/lib/db'
import { jsonError, readJson, requireAdmin } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'
import { hashPassword, validatePassword } from '@/lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_NAME = 80

type Params = { params: Promise<{ id: string }> }

interface PatchUserBody {
  name?: string
  email?: string
  avatarUrl?: string | null
  password?: string
  isAdmin?: boolean
}

/** Редактирование пользователя — только администратор. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin()
    const { id } = await params
    const body = await readJson<PatchUserBody>(req)

    const existing = await db.user.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new ApiError('Пользователь не найден', 404)

    const data: {
      name?: string
      email?: string
      avatarUrl?: string | null
      passwordHash?: string
      isAdmin?: boolean
      sessionEpoch?: { increment: number }
    } = {}

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) throw new ApiError('Имя не может быть пустым')
      if (name.length > MAX_NAME) throw new ApiError(`Имя слишком длинное (макс. ${MAX_NAME} символов)`)
      data.name = name
    }

    if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase()
      if (!EMAIL_RE.test(email)) throw new ApiError('Некорректный email')
      const dup = await db.user.findUnique({ where: { email }, select: { id: true } })
      if (dup && dup.id !== id) throw new ApiError(`Email «${email}» уже занят другим пользователем`)
      data.email = email
    }

    // null => явно очистить аватар; строка => установить (пустая строка трактуется как null)
    if (body.avatarUrl === null || typeof body.avatarUrl === 'string') {
      data.avatarUrl =
        typeof body.avatarUrl === 'string' && body.avatarUrl.trim() !== ''
          ? body.avatarUrl.trim()
          : null
    }

    // смена пароля — опциональна (пустое значение не трогает текущий пароль).
    // При смене инкрементируем эпоху сессий: все cookie пользователя становятся невалидными.
    if (typeof body.password === 'string' && body.password !== '') {
      const pwError = validatePassword(body.password)
      if (pwError) throw new ApiError(pwError)
      data.passwordHash = await hashPassword(body.password)
      data.sessionEpoch = { increment: 1 }
    }

    if (typeof body.isAdmin === 'boolean') {
      // нельзя снять админ-права с себя самого (иначе останешься заперт снаружи)
      if (body.isAdmin === false && admin.id === id) {
        throw new ApiError('Нельзя снять права администратора с самого себя')
      }
      data.isAdmin = body.isAdmin
    }

    if (Object.keys(data).length === 0) {
      throw new ApiError('Нет полей для обновления')
    }

    const updated = await db.user.update({ where: { id }, data })
    return Response.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      avatarUrl: updated.avatarUrl,
      isAdmin: updated.isAdmin,
      hasPassword: !!updated.passwordHash,
      createdAt: updated.createdAt.toISOString(),
    })
  } catch (e) {
    return jsonError(e)
  }
}

/** Удаление пользователя — только администратор. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin()
    const { id } = await params

    if (admin.id === id) throw new ApiError('Нельзя удалить собственный аккаунт')

    const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true } })
    if (!user) throw new ApiError('Пользователь не найден', 404)

    const tasksCount = await db.task.count({ where: { assigneeId: id } })
    try {
      await db.user.delete({ where: { id } })
    } catch (e) {
      // у пользователя есть комментарии/активность — FK-ограничение БД не даст удалить,
      // чтобы не потерять авторство истории
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2003') {
        throw new ApiError(
          'Нельзя удалить пользователя: за ним закреплены комментарии или записи истории. ' +
            'Сначала перенесите/удалите их, либо оставьте аккаунт без доступа (очистите пароль).',
          409
        )
      }
      throw e
    }
    return Response.json({ ok: true, releasedTasks: tasksCount })
  } catch (e) {
    return jsonError(e)
  }
}
