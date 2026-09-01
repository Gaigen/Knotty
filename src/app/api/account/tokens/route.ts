import { db } from '@/lib/db'
import { encryptApiTokenPlain } from '@/lib/api-token-crypto'
import { generateApiTokenPlain, hashApiToken } from '@/lib/api-tokens'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'

/** Список API-токенов текущего пользователя (без секретов) */
export async function GET() {
  try {
    const user = await getCurrentUser()
    const tokens = await db.apiToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    })
    return Response.json(
      tokens.map((t) => ({
        id: t.id,
        name: t.name,
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      }))
    )
  } catch (e) {
    return jsonError(e)
  }
}

/** Создать API-токен. Plain-токен возвращается один раз в ответе. */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    const body = await readJson<{ name?: string }>(req)
    const name = (body.name ?? '').trim()
    if (!name) throw new ApiError('Укажите название токена (например «MCP Cursor»)')
    if (name.length > 80) throw new ApiError('Название токена: максимум 80 символов')

    const plain = generateApiTokenPlain()
    const row = await db.apiToken.create({
      data: {
        userId: user.id,
        name,
        tokenHash: hashApiToken(plain),
        tokenEnc: encryptApiTokenPlain(plain),
      },
      select: { id: true, name: true, createdAt: true },
    })

    return Response.json({
      id: row.id,
      name: row.name,
      token: plain,
      createdAt: row.createdAt.toISOString(),
    })
  } catch (e) {
    return jsonError(e)
  }
}
