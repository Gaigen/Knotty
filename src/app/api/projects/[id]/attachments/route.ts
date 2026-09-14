import { db } from '@/lib/db'
import { getCurrentUser, jsonError } from '@/lib/server/context'
import { publishProjectChange } from '@/lib/server/realtime'
import { apiError } from '@/lib/server/i18n'
import { storeFile } from '@/lib/server/storage'
import type { AttachmentDto } from '@/lib/types'

type Params = { params: Promise<{ id: string }> }

/** Загрузка файла уровня проекта (для ноды-вложения на канвасе графа, ФТ-3.3) */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    const user = await getCurrentUser()

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) await apiError('projectNotFound', undefined, 404)

    const form = await req.formData().catch(() => null)
    if (!form) await apiError('multipartExpected')
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    if (files.length === 0) await apiError('filesNotProvided')

    const created: AttachmentDto[] = []
    for (const file of files) {
      const stored = await storeFile(file)
      const attachment = await db.attachment.create({
        data: {
          taskId: null,
          projectId,
          fileName: file.name || 'файл',
          size: stored.size,
          mime: file.type || 'application/octet-stream',
          storageKey: stored.storageKey,
          previewKey: stored.previewKey,
          uploadedById: user.id,
        },
      })
      created.push({
        id: attachment.id,
        taskId: null,
        fileName: attachment.fileName,
        size: attachment.size,
        mime: attachment.mime,
        hasPreview: !!attachment.previewKey,
        createdAt: attachment.createdAt.toISOString(),
      })
    }
    publishProjectChange(projectId)
    return Response.json(created, { status: 201 })
  } catch (e) {
    return await jsonError(e)
  }
}
