/**
 * Auth-ядро: пароли (bcrypt) и сессионные JWT (jose, HS256).
 *
 * Сессия — httpOnly-cookie `knotty_session` с JWT {sub: userId}.
 * Legacy: `verfi_session` (читается при апгрейде с Verfi).
 *
 * Функции чистые (без next/headers) — cookie читается в server/context.ts,
 * а эти утилиты переиспользуются в CLI-скриптах.
 */
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'knotty_session'
export const LEGACY_SESSION_COOKIE = 'verfi_session'
export const SESSION_TTL_SEC = 30 * 24 * 60 * 60 // 30 дней

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET не задан в .env (сгенерируй: openssl rand -base64 32)')
  }
  return new TextEncoder().encode(secret)
}

// ---------- Пароли ----------

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 6) {
    return 'Пароль: минимум 6 символов'
  }
  if (password.length > 72) {
    return 'Пароль: максимум 72 символа'
  }
  return null
}

// ---------- Сессионный JWT ----------

/** Подпись сессии. epoch — «эпоха» сессий пользователя (инвалидация при смене пароля). */
export async function signSessionToken(userId: string, epoch = 0): Promise<string> {
  return new SignJWT({ ep: epoch })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(secretKey())
}

export interface SessionClaims {
  userId: string
  epoch: number
}

/** Вернёт claims или null (просрочен / подпись неверна / отсутствует) */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionClaims | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey())
    if (!payload.sub) return null
    return { userId: payload.sub, epoch: typeof payload.ep === 'number' ? payload.ep : 0 }
  } catch {
    return null
  }
}

/** Сериализация Set-Cookie для httpOnly-сессии */
export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SEC}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** Сброс сессионной cookie */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
