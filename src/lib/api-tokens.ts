import { createHash, randomBytes } from 'node:crypto'

/** Префикс plain-токена (не бренд продукта — можно сменить через env) */
export const API_TOKEN_PREFIX = (process.env.API_TOKEN_PREFIX ?? 'tb').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'tb'

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Новый токен: `{prefix}_` + 32 байт base64url */
export function generateApiTokenPlain(): string {
  return `${API_TOKEN_PREFIX}_${randomBytes(32).toString('base64url')}`
}
