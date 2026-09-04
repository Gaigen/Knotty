import { db } from '@/lib/db'
import { getCurrentUser, jsonError } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'
import { logActivity } from '@/lib/server/activity'
import { publishProjectChange } from '@/lib/server/realtime'
import {
  deleteStored,
  readStored,
  readStoredRange,
  storedFileSize,
  mimeFromFileName,
} from '@/lib/server/storage'

type Params = { params: Promise<{ id: string }> }

function attachmentContentMime(
  attachment: { mime: string; fileName: string; storageKey: string },
  key: string
): string {
  if (key !== attachment.storageKey) return 'image/webp'
  const fromDb = attachment.mime?.split(';')[0]?.trim()
  const fromName = mimeFromFileName(attachment.fileName).split(';')[0]?.trim()
  const mime = fromDb && fromDb !== 'application/octet-stream' ? fromDb : fromName
  if (attachment.fileName.toLowerCase().endsWith('.pdf')) return 'application/pdf'
  return mime || 'application/octet-stream'
}

function parseByteRange(rangeHeader: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!m) return null

  let start: number
  let end: number

  if (m[1] && m[2]) {
    start = parseInt(m[1], 10)
    end = parseInt(m[2], 10)
  } else if (m[1]) {
    start = parseInt(m[1], 10)
    end = size - 1
  } else if (m[2]) {
    const suffix = parseInt(m[2], 10)
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    return null
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null
  }

  return { start, end: Math.min(end, size - 1) }
}

async function attachmentFileResponse(
  req: Request,
  key: string,
  mime: string,
  fileName: string,
  download: boolean
): Promise<Response> {
  const size = await storedFileSize(key)
  if (size == null) throw new ApiError('Файл не найден в хранилище', 404)

  const encodedName = encodeURIComponent(fileName)
  const disposition = download ? 'attachment' : 'inline'
  const baseHeaders: Record<string, string> = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodedName}`,
    'Cache-Control': 'private, max-age=3600',
  }

  const rangeHeader = req.headers.get('range')
  if (!rangeHeader) {
    const buffer = await readStored(key)
    if (!buffer) throw new ApiError('Файл не найден в хранилище', 404)
    return new Response(new Uint8Array(buffer), {
      headers: { ...baseHeaders, 'Content-Length': String(size) },
    })
  }

  const range = parseByteRange(rangeHeader, size)
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    })
  }

  const chunk = await readStoredRange(key, range.start, range.end)
  if (!chunk) throw new ApiError('Файл не найден в хранилище', 404)

  return new Response(new Uint8Array(chunk), {
    status: 206,
    headers: {
      ...baseHeaders,
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      'Content-Length': String(chunk.length),
    },
  })
}

/** Отдача файла вложения или его превью (?preview=1) */
export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const wantPreview = url.searchParams.get('preview') === '1'
    const download = url.searchParams.get('download') === '1'

    const attachment = await db.attachment.findUnique({ where: { id } })
    if (!attachment) throw new ApiError('Вложение не найдено', 404)

    const key = wantPreview && attachment.previewKey ? attachment.previewKey : attachment.storageKey
    const mime = attachmentContentMime(attachment, key)

    return await attachmentFileResponse(req, key, mime, attachment.fileName, download)
  } catch (e) {
    return jsonError(e)
  }
}

/** Удаление вложения (вместе с нодами графа, которые на него ссылаются) */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    const attachment = await db.attachment.findUnique({ where: { id } })
    if (!attachment) throw new ApiError('Вложение не найдено', 404)
    if (attachment.taskId) {
      await logActivity(attachment.taskId, user.id, 'file_removed', {
        fileName: attachment.fileName,
        attachmentId: attachment.id,
      })
    } else {
      publishProjectChange(attachment.projectId)
    }
    await db.graphNode.deleteMany({ where: { refType: 'attachment', refId: id } })
    await db.attachment.delete({ where: { id } })
    await deleteStored(attachment.storageKey)
    if (attachment.previewKey) await deleteStored(attachment.previewKey)
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
