import { db } from '@/lib/db'
import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { publishProjectChange } from '@/lib/server/realtime'
import { apiError } from '@/lib/server/i18n'

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
    if (!project) await apiError('projectNotFound', undefined, 404)

    const refType = body.refType ?? 'note'
    if (!['task', 'attachment', 'note', 'group'].includes(refType)) await apiError('invalidNodeType')

    if (refType === 'task') {
      if (!body.refId) await apiError('taskNotSpecified')
      const task = await db.task.findFirst({ where: { id: body.refId, projectId }, select: { id: true } })
      if (!task) await apiError('taskNotFound', undefined, 404)
      const existing = await db.graphNode.findFirst({ where: { projectId, refType: 'task', refId: body.refId } })
      if (existing) await apiError('taskAlreadyOnCanvas')
    }
    if (refType === 'attachment') {
      if (!body.refId) await apiError('attachmentNotSpecified')
      const attachment = await db.attachment.findFirst({ where: { id: body.refId, projectId }, select: { id: true } })
      if (!attachment) await apiError('attachmentNotFoundInProject')
      const existing = await db.graphNode.findFirst({ where: { projectId, refType: 'attachment', refId: body.refId } })
      if (existing) await apiError('fileAlreadyOnCanvas')
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
    return await jsonError(e)
  }
}
