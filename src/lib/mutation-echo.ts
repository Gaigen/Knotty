/** Подавление SSE-эхо от собственных мутаций (одна вкладка не рефетчит то, что сама только что сохранила). */
const stamps = new Map<string, number>()

export function stampLocalEcho(key: string, ttlMs = 5000) {
  stamps.set(key, Date.now() + ttlMs)
}

export function shouldIgnoreLocalEcho(key: string): boolean {
  const exp = stamps.get(key)
  if (!exp) return false
  if (Date.now() > exp) {
    stamps.delete(key)
    return false
  }
  return true
}

export function taskEchoKey(taskId: string) {
  return `task:${taskId}`
}

export function graphEchoKey(projectId: string) {
  return `graph:${projectId}`
}

export function projectEchoKey(projectId: string) {
  return `project:${projectId}`
}
