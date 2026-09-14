import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { apiError } from '@/lib/server/i18n'

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
      if (!name) throw await apiError('nameEmpty')
      if (name.length > MAX_NAME) throw await apiError('nameTooLong', { max: MAX_NAME })
      data.name = name
    }

    if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase()
      if (!EMAIL_RE.test(email)) throw await apiError('invalidEmail')
      const dup = await db.user.findUnique({ where: { email }, select: { id: true } })
      if (dup && dup.id !== user.id) throw await apiError('emailTaken', { email })
      data.email = email
    }

    if (body.avatarUrl === null || typeof body.avatarUrl === 'string') {
      data.avatarUrl =
        typeof body.avatarUrl === 'string' && body.avatarUrl.trim() !== ''
          ? body.avatarUrl.trim()
          : null
    }

    if (Object.keys(data).length === 0) {
      throw await apiError('noFieldsToUpdate')
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
    return await jsonError(e)
  }
}
