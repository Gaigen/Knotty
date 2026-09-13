import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_NAME = 80

interface PatchProfileBody {
  name?: string
  email?: string
  avatarUrl?: string | null
}

/** Редактирование собственного профиля (имя, email, аватар). */
export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser()
    const body = await readJson<PatchProfileBody>(req)

    const data: { name?: string; email?: string; avatarUrl?: string | null } = {}

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
      if (dup && dup.id !== user.id) throw new ApiError(`Email «${email}» уже занят`)
      data.email = email
    }

    if (body.avatarUrl === null || typeof body.avatarUrl === 'string') {
      data.avatarUrl =
        typeof body.avatarUrl === 'string' && body.avatarUrl.trim() !== ''
          ? body.avatarUrl.trim()
          : null
    }

    if (Object.keys(data).length === 0) {
      throw new ApiError('Нет полей для обновления')
    }

    const updated = await db.user.update({ where: { id: user.id }, data })
    return Response.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      avatarUrl: updated.avatarUrl,
      isAdmin: updated.isAdmin,
    })
  } catch (e) {
    return jsonError(e)
  }
}
