import { db } from '@/lib/db'
import { jsonError } from '@/lib/server/context'
import { buildProjectExportZip } from '@/lib/server/project-bundle'

type Params = { params: Promise<{ id: string }> }

/** Экспорт проекта ZIP: export.json + files/… (вложения) */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const project = await db.project.findUnique({ where: { id }, select: { id: true } })
    if (!project) return Response.json({ error: 'Проект не найден' }, { status: 404 })

    const { filename, bytes } = await buildProjectExportZip(id)
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
