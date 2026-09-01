import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET не задан — нужен для хранения токенов')
  }
  return createHash('sha256').update(secret).digest()
}

/** Шифрование plain-токена для повторного показа в UI (AES-256-GCM) */
export function encryptApiTokenPlain(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64url')
}

export function decryptApiTokenPlain(tokenEnc: string): string {
  const buf = Buffer.from(tokenEnc, 'base64url')
  if (buf.length < 29) throw new Error('Некорректное шифрование токена')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
