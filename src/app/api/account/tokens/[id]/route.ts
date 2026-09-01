import { db } from '@/lib/db'
import { getCurrentUser, jsonError } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'

type Params = { params: Promise<{ id: string }> }

/** Отозвать API-токен */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const row = await db.apiToken.findFirst({ where: { id, userId: user.id } })
    if (!row) throw new ApiError('Токен не найден', 404)
    await db.apiToken.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
