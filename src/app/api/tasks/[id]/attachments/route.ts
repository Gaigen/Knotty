import { db } from '@/lib/db'
import { MAX_TASK_TOTAL_MB } from '@/lib/config'
import { getCurrentUser, jsonError } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'
import { logActivity } from '@/lib/server/activity'
import { storeFile } from '@/lib/server/storage'
import type { AttachmentDto } from '@/lib/types'

type Params = { params: Promise<{ id: string }> }

/** Загрузка вложений (ФТ-5.2): multipart, мультивыбор, лимиты, превью для картинок */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()

    const task = await db.task.findUnique({ where: { id }, select: { id: true, projectId: true } })
    if (!task) throw new ApiError('Задача не найдена', 404)

    const form = await req.formData().catch(() => null)
    if (!form) throw new ApiError('Ожидается multipart/form-data')
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    if (files.length === 0) throw new ApiError('Файлы не переданы')

    // лимит на суммарный объём задачи
    const agg = await db.attachment.aggregate({ where: { taskId: id }, _sum: { size: true } })
    const currentTotal = agg._sum.size ?? 0
    const incomingTotal = files.reduce((s, f) => s + f.size, 0)
    if (currentTotal + incomingTotal > MAX_TASK_TOTAL_MB * 1024 * 1024) {
      throw new ApiError(`Суммарный объём вложений задачи не может превышать ${MAX_TASK_TOTAL_MB} МБ`)
    }

    const created: AttachmentDto[] = []
    for (const file of files) {
      const stored = await storeFile(file)
      const attachment = await db.attachment.create({
        data: {
          taskId: id,
          projectId: task.projectId,
          fileName: file.name || 'файл',
          size: stored.size,
          mime: file.type || 'application/octet-stream',
          storageKey: stored.storageKey,
          previewKey: stored.previewKey,
          uploadedById: user.id,
        },
      })
      await logActivity(id, user.id, 'file_added', { fileName: attachment.fileName, attachmentId: attachment.id })
      created.push({
        id: attachment.id,
        taskId: attachment.taskId,
        fileName: attachment.fileName,
        size: attachment.size,
        mime: attachment.mime,
        hasPreview: !!attachment.previewKey,
        createdAt: attachment.createdAt.toISOString(),
      })
    }
    return Response.json(created, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
