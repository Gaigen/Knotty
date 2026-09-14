import { db } from '@/lib/db'
import { getCurrentUser, jsonError } from '@/lib/server/context'
import { apiError } from '@/lib/server/i18n'

type Params = { params: Promise<{ id: string }> }

/** Отозвать API-токен */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await getCurrentUser()
    const { id } = await params
    const row = await db.apiToken.findFirst({ where: { id, userId: user.id } })
    if (!row) await apiError('tokenNotFound', undefined, 404)
    await db.apiToken.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return await jsonError(e)
  }
}
