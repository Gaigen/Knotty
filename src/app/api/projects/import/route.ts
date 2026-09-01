import { getCurrentUser, jsonError, readJson } from '@/lib/server/context'
import { ApiError } from '@/lib/server/validation'
import { importProjectFromExport, type ProjectExportV1 } from '@/lib/server/project-import'
import { parseProjectImportBundle } from '@/lib/server/project-bundle'

/** Импорт проекта: JSON body или multipart ZIP (export.json + files/) */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData().catch(() => null)
      if (!form) throw new ApiError('Ожидается multipart/form-data')
      const file = form.get('file')
      if (!(file instanceof File)) throw new ApiError('Поле file не передано')
      const keyOverride = String(form.get('key') ?? '').trim().toUpperCase() || undefined

      const bytes = new Uint8Array(await file.arrayBuffer())
      const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip'
      if (!isZip) {
        const text = new TextDecoder().decode(bytes)
        const data = JSON.parse(text) as ProjectExportV1
        if (!data.format) throw new ApiError('Пустой или неверный JSON')
        const result = await importProjectFromExport(user.id, data, { key: keyOverride })
        return Response.json(result, { status: 201 })
      }

      const { data, bundleFiles } = parseProjectImportBundle(bytes)
      const result = await importProjectFromExport(user.id, data, { key: keyOverride, bundleFiles })
      return Response.json(result, { status: 201 })
    }

    const body = await readJson<ProjectExportV1 & { key?: string }>(req)
    const { key: keyOverride, ...data } = body
    if (!data.format) throw new ApiError('Пустой или неверный JSON')

    const result = await importProjectFromExport(user.id, data as ProjectExportV1, {
      key: keyOverride?.trim().toUpperCase(),
    })

    return Response.json(result, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
