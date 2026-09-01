import { db } from '@/lib/db'
import { SESSION_COOKIE, LEGACY_SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { cookies } from 'next/headers'

/** Публичный роут: кто сейчас залогинен. {user: null} если никто. */
export async function GET() {
  try {
    const cookieStore = await cookies()
    const token =
      cookieStore.get(SESSION_COOKIE)?.value ?? cookieStore.get(LEGACY_SESSION_COOKIE)?.value
    const claims = await verifySessionToken(token)
    if (!claims) return Response.json({ user: null })

    const user = await db.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, name: true, email: true, avatarUrl: true, isAdmin: true, sessionEpoch: true },
    })
    // сессия выдана до смены пароля — считаем пользователя разлогиненным
    if (!user || user.sessionEpoch !== claims.epoch) {
      return Response.json({ user: null })
    }
    return Response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
      },
    })
  } catch {
    return Response.json({ user: null })
  }
}
