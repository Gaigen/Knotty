import type { ProjectRealtimeMessage } from '@/lib/realtime-types'

type Listener = (msg: ProjectRealtimeMessage) => void

const GLOBAL_KEY = '__knottyProjectRealtime' as const

function channels(): Map<string, Set<Listener>> {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Map<string, Set<Listener>> }
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map()
  return g[GLOBAL_KEY]
}

export function subscribeProject(projectId: string, listener: Listener): () => void {
  const map = channels()
  if (!map.has(projectId)) map.set(projectId, new Set())
  const set = map.get(projectId)!
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) map.delete(projectId)
  }
}

/** Уведомить всех SSE-подписчиков проекта об изменении данных */
export function publishProjectChange(
  projectId: string,
  detail: { taskId?: string; taskIds?: string[] } = {}
) {
  const msg: ProjectRealtimeMessage = { v: 1, at: Date.now(), projectId, ...detail }
  for (const listener of channels().get(projectId) ?? []) {
    try {
      listener(msg)
    } catch {
      // подписчик уже отключился
    }
  }
}
