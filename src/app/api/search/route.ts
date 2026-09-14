import { getCurrentUser, jsonError } from '@/lib/server/context'
import { apiError } from '@/lib/server/i18n'
import { searchTasks } from '@/lib/server/search-tasks'

/** Глобальный или внутри проекта поиск задач (?q=, опционально projectId, limit) */
export async function GET(req: Request) {
  try {
    await getCurrentUser()
    const url = new URL(req.url)
    const q = url.searchParams.get('q') ?? ''
    if (!q.trim()) throw await apiError('searchQueryRequired')
    const projectId = url.searchParams.get('projectId') ?? undefined
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Number(limitRaw) : undefined

    const hits = await searchTasks(q, { projectId, limit })
    return Response.json({ q: q.trim(), count: hits.length, tasks: hits })
  } catch (e) {
    return await jsonError(e)
  }
}
