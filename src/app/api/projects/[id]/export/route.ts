import { db } from '@/lib/db'
import { jsonError } from '@/lib/server/context'
import { buildProjectExport, stripBundleInternals } from '@/lib/server/project-export'

type Params = { params: Promise<{ id: string }> }

/** Экспорт проекта в JSON (ФТ-5.4) */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const project = await db.project.findUnique({ where: { id }, select: { id: true } })
    if (!project) return Response.json({ error: 'Проект не найден' }, { status: 404 })

    const exportData = stripBundleInternals(await buildProjectExport(id))
    const key = exportData.project.key

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${key}-export.json"`,
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
