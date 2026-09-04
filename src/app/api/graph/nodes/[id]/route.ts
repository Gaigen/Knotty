import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { publishProjectChange } from '@/lib/server/realtime'
import { ApiError } from '@/lib/server/validation'
import { deleteStored } from '@/lib/server/storage'

type Params = { params: Promise<{ id: string }> }

/** Обновление ноды: позиция, размер, текст заметки */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    await getCurrentUser()
    const body = await readJson<{ x?: number; y?: number; text?: string; w?: number; h?: number }>(req)

    const node = await db.graphNode.findUnique({ where: { id } })
    if (!node) throw new ApiError('Нода не найдена', 404)

    const data: Record<string, unknown> = {}
    if (typeof body.x === 'number') data.x = body.x
    if (typeof body.y === 'number') data.y = body.y
    if (typeof body.w === 'number') data.w = body.w
    if (typeof body.h === 'number') data.h = body.h
    if (typeof body.text === 'string') data.text = body.text.slice(0, 20000)

    if (Object.keys(data).length === 0) return Response.json({ ok: true })
    const updated = await db.graphNode.update({ where: { id }, data })
    publishProjectChange(node.projectId)
    return Response.json({ ok: true, node: { id: updated.id, x: updated.x, y: updated.y, text: updated.text } })
  } catch (e) {
    return jsonError(e)
  }
}

/**
 * Удаление ноды. Для заметки — просто удаление. Для задачи — нода уходит, задача остаётся.
 * Для проектного вложения (без задачи) — вложение тоже удаляется.
 */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    await getCurrentUser()
    const node = await db.graphNode.findUnique({ where: { id } })
    if (!node) throw new ApiError('Нода не найдена', 404)

    // каскад: свободные рёбра, ссылающиеся на ноду
    await db.graphEdge.deleteMany({ where: { OR: [{ fromNodeId: id }, { toNodeId: id }] } })
    await db.graphNode.delete({ where: { id } })
    if (node.refType === 'attachment' && node.refId) {
      const attachment = await db.attachment.findUnique({ where: { id: node.refId } })
      if (attachment && !attachment.taskId) {
        await db.attachment.delete({ where: { id: attachment.id } })
        await deleteStored(attachment.storageKey)
        if (attachment.previewKey) await deleteStored(attachment.previewKey)
      }
    }
    publishProjectChange(node.projectId)
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
