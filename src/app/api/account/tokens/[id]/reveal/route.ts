import { db } from '@/lib/db'
import { decryptApiTokenPlain } from '@/lib/api-token-crypto'
import { getCurrentUser, jsonError } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'

type Params = { params: Promise<{ id: string }> }

/** Показать plain-токен снова (только владельцу) */
export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const row = await db.apiToken.findFirst({
      where: { id, userId: user.id },
      select: { id: true, name: true, tokenEnc: true },
    })
    if (!row) throw new ApiError('Токен не найден', 404)
    if (!row.tokenEnc) {
      throw new ApiError(
        'Этот токен создан до обновления и не сохранён для показа. Создайте новый токен.',
        404
      )
    }
    const token = decryptApiTokenPlain(row.tokenEnc)
    return Response.json({ id: row.id, name: row.name, token })
  } catch (e) {
    return jsonError(e)
  }
}
