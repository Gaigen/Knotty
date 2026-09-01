import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'
import { hashPassword, sessionCookie, signSessionToken, validatePassword, verifyPassword } from '@/lib/auth'

function isSecure(req: Request): boolean {
  const proto = req.headers.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0].trim() === 'https'
  return new URL(req.url).protocol === 'https:'
}

/** Смена собственного пароля (требует входа).
 *  Эпоха сессий инкрементится — все ДРУГИЕ cookie этого пользователя умирают;
 *  текущей сессии сразу выдаётся новая cookie с актуальной эпохой. */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    const body = await readJson<{ currentPassword?: string; newPassword?: string }>(req)
    const currentPassword = body.currentPassword ?? ''
    const newPassword = body.newPassword ?? ''

    // у аккаунта мог не быть пароля (наследие сид-данных) — тогда старый не проверяем
    if (user.passwordHash && !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new ApiError('Текущий пароль неверен')
    }

    const pwError = validatePassword(newPassword)
    if (pwError) throw new ApiError(pwError)

    const updated = await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), sessionEpoch: { increment: 1 } },
    })

    // перевыпуск cookie для текущей сессии
    const token = await signSessionToken(updated.id, updated.sessionEpoch)
    const res = Response.json({ ok: true })
    res.headers.append('Set-Cookie', sessionCookie(token, isSecure(req)))
    return res
  } catch (e) {
    return jsonError(e)
  }
}
