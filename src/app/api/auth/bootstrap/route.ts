import { db } from '@/lib/db'
import { jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'
import { hashPassword, sessionCookie, signSessionToken, validatePassword } from '@/lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Публичный: нужна ли первичная настройка (ни у кого нет пароля) */
export async function GET() {
  try {
    const withPassword = await db.user.count({ where: { passwordHash: { not: null } } })
    return Response.json({ needed: withPassword === 0 })
  } catch (e) {
    return jsonError(e)
  }
}

function isSecure(req: Request): boolean {
  const proto = req.headers.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0].trim() === 'https'
  return new URL(req.url).protocol === 'https:'
}

/**
 * Публичный: создание первого администратора.
 * Доступен ровно один раз — пока ни у одного пользователя нет пароля.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ name?: string; email?: string; password?: string }>(req)
    const name = (body.name ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    const password = body.password ?? ''

    if (!name) throw new ApiError('Имя обязательно')
    if (name.length > 80) throw new ApiError('Имя слишком длинное (макс. 80 символов)')
    if (!EMAIL_RE.test(email)) throw new ApiError('Некорректный email')
    const pwError = validatePassword(password)
    if (pwError) throw new ApiError(pwError)

    // повторная инициализация запрещена
    const withPassword = await db.user.count({ where: { passwordHash: { not: null } } })
    if (withPassword > 0) {
      throw new ApiError('Первичная настройка уже выполнена — войдите под своим аккаунтом', 403)
    }

    const dup = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (dup) {
      // email уже есть (например, сид-пользователь) — задаём пароль ему и делаем админом
      const user = await db.user.update({
        where: { id: dup.id },
        data: { name, passwordHash: await hashPassword(password), isAdmin: true, sessionEpoch: { increment: 1 } },
      })
      const token = await signSessionToken(user.id, user.sessionEpoch)
      const res = Response.json(
        { user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, isAdmin: true } },
        { status: 201 }
      )
      res.headers.append('Set-Cookie', sessionCookie(token, isSecure(req)))
      return res
    }

    const user = await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password), isAdmin: true },
    })
    const token = await signSessionToken(user.id, user.sessionEpoch)
    const res = Response.json(
      { user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, isAdmin: true } },
      { status: 201 }
    )
    res.headers.append('Set-Cookie', sessionCookie(token, isSecure(req)))
    return res
  } catch (e) {
    return jsonError(e)
  }
}
