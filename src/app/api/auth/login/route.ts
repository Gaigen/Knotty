import { db } from '@/lib/db'
import { jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'
import { sessionCookie, signSessionToken, verifyPassword } from '@/lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Secure-cookie: за https-прокси (Caddy/nginx) ставим Secure */
function isSecure(req: Request): boolean {
  const proto = req.headers.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0].trim() === 'https'
  return new URL(req.url).protocol === 'https:'
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{ email?: string; password?: string }>(req)
    const email = (body.email ?? '').trim().toLowerCase()
    const password = body.password ?? ''

    if (!EMAIL_RE.test(email)) throw new ApiError('Некорректный email')
    if (!password) throw new ApiError('Введите пароль')

    const user = await db.user.findUnique({ where: { email } })
    // единая ошибка для неверного email и неверного пароля — не раскрываем, что существует
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new ApiError('Неверный email или пароль', 401)
    }

    const token = await signSessionToken(user.id, user.sessionEpoch)
    const res = Response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
      },
    })
    res.headers.append('Set-Cookie', sessionCookie(token, isSecure(req)))
    return res
  } catch (e) {
    return jsonError(e)
  }
}
