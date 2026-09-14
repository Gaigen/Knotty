import { cookies, headers } from 'next/headers'
import { db } from '@/lib/db'
import { hashApiToken } from '@/lib/api-tokens'
import { getApiTranslations } from './i18n'
import { ApiError } from './validation'
import { verifySessionToken, SESSION_COOKIE, LEGACY_SESSION_COOKIE } from '@/lib/auth'

const userSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  passwordHash: true,
  isAdmin: true,
  sessionEpoch: true,
  createdAt: true,
} as const

type UserRow = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  passwordHash: string | null
  isAdmin: boolean
  sessionEpoch: number
  createdAt: Date
}

async function userFromApiToken(token: string): Promise<UserRow | null> {
  const tokenHash = hashApiToken(token)
  const row = await db.apiToken.findUnique({
    where: { tokenHash },
    include: { user: { select: userSelect } },
  })
  if (!row) return null

  // lastUsedAt — fire-and-forget, не блокируем запрос
  db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

  return row.user
}

/** Текущий пользователь: Bearer API-токен или httpOnly-cookie сессии */
export async function getCurrentUser() {
  const h = await headers()
  const auth = h.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim()
    if (!token) {
      const t = await getApiTranslations()
      throw new ApiError(t('emptyApiToken'), 401)
    }
    const user = await userFromApiToken(token)
    if (!user) {
      const t = await getApiTranslations()
      throw new ApiError(t('invalidApiToken'), 401)
    }
    return user
  }

  const cookieStore = await cookies()
  const cookieToken =
    cookieStore.get(SESSION_COOKIE)?.value ?? cookieStore.get(LEGACY_SESSION_COOKIE)?.value
  const claims = await verifySessionToken(cookieToken)
  if (!claims) {
    const t = await getApiTranslations()
    throw new ApiError(t('loginRequired'), 401)
  }

  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: userSelect,
  })
  if (!user || user.sessionEpoch !== claims.epoch) {
    const t = await getApiTranslations()
    throw new ApiError(t('loginRequired'), 401)
  }
  return user
}

/** Только для администраторов (управление пользователями: /api/users, /admin/*) */
export async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user.isAdmin) {
    const t = await getApiTranslations()
    throw new ApiError(t('adminRequired'), 403)
  }
  return user
}

/** Обновление времени проекта для сортировки «недавние» и блока «Продолжить работу» */
export async function touchProject(projectId: string) {
  try {
    await db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } })
  } catch {
    // проект мог быть удалён в параллельной операции — не критично
  }
}

export async function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error('[api]', error)
  const t = await getApiTranslations()
  return Response.json({ error: t('internalServerError') }, { status: 500 })
}

/** Парсинг тела запроса с обработкой ошибок */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    const t = await getApiTranslations()
    throw new ApiError(t('invalidRequestBody'))
  }
}

export function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
