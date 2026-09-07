import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { publishProjectChange } from '@/lib/server/realtime'
import { ApiError } from '@/lib/server/validation'

type Params = { params: Promise<{ id: string }> }

interface CreateNodeBody {
  refType?: string
  refId?: string
  x?: number
  y?: number
  text?: string
  w?: number
  h?: number
}

/** Создание ноды на канвасе (ФТ-3.3): задача (новая/существующая), заметка, файл */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    await getCurrentUser()
    const body = await readJson<CreateNodeBody>(req)

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) throw new ApiError('Проект не найден', 404)

    const refType = body.refType ?? 'note'
    if (!['task', 'attachment', 'note', 'group'].includes(refType)) throw new ApiError('Некорректный тип ноды')

    if (refType === 'task') {
      if (!body.refId) throw new ApiError('Не указана задача')
      const task = await db.task.findFirst({ where: { id: body.refId, projectId }, select: { id: true } })
      if (!task) throw new ApiError('Задача не найдена в этом проекте')
      const existing = await db.graphNode.findFirst({ where: { projectId, refType: 'task', refId: body.refId } })
      if (existing) throw new ApiError('Эта задача уже есть на канвасе')
    }
    if (refType === 'attachment') {
      if (!body.refId) throw new ApiError('Не указано вложение')
      const attachment = await db.attachment.findFirst({ where: { id: body.refId, projectId }, select: { id: true } })
      if (!attachment) throw new ApiError('Вложение не найдено в этом проекте')
      const existing = await db.graphNode.findFirst({ where: { projectId, refType: 'attachment', refId: body.refId } })
      if (existing) throw new ApiError('Этот файл уже есть на канвасе')
    }

    const node = await db.graphNode.create({
      data: {
        projectId,
        refType,
        refId: body.refId ?? null,
        x: Number(body.x) || 0,
        y: Number(body.y) || 0,
        text: refType === 'note' || refType === 'group' ? (body.text ?? (refType === 'group' ? 'Пачка' : '')) : null,
        w: refType === 'group' ? Number(body.w) || 320 : undefined,
        h: refType === 'group' ? Number(body.h) || 200 : undefined,
      },
    })
    publishProjectChange(projectId)
    return Response.json(
      { id: node.id, refType: node.refType, refId: node.refId, x: node.x, y: node.y, text: node.text, w: node.w, h: node.h },
      { status: 201 }
    )
  } catch (e) {
    return jsonError(e)
  }
}
