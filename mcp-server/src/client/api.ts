import type { McpConfig } from '../config/env.js'

export type ApiClient = ReturnType<typeof createApiClient>

export function createApiClient(cfg: McpConfig) {
  const baseUrl = cfg.apiUrl.replace(/\/$/, '')

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${cfg.apiToken}`,
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options?.headers ?? {}),
      },
    })

    const data = await res.json().catch(() => ({})) as { error?: string }

    if (!res.ok) {
      const msg = data.error ?? `HTTP ${res.status}`
      if (res.status === 401) throw new Error(`Неверный API-токен: ${msg}`)
      throw new Error(msg)
    }

    return data as T
  }

  return {
    getProjects: () => request<unknown[]>('/api/projects'),
    getProject: (id: string) => request<unknown>(`/api/projects/${id}`),
    getTasks: (projectId: string, q?: string) => {
      const qs = q ? `?q=${encodeURIComponent(q)}` : ''
      return request<unknown[]>(`/api/projects/${projectId}/tasks${qs}`)
    },
    getTask: (id: string) => request<unknown>(`/api/tasks/${id}`),
    createTask: (projectId: string, body: Record<string, unknown>) =>
      request<unknown>(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateTask: (id: string, body: Record<string, unknown>) =>
      request<unknown>(`/api/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    bulkAddToGraph: (projectId: string, body: { all?: boolean; taskIds?: string[] }) =>
      request<{ created: number; ids: string[] }>(`/api/projects/${projectId}/graph/bulk-add`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    createLink: (fromTaskId: string, body: { toTaskId?: string; toKey?: string; type?: string }) =>
      request<{ id: string; graphNodesAdded?: number }>(`/api/tasks/${fromTaskId}/links`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    addComment: (taskId: string, body: string) =>
      request<unknown>(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    searchTasks: (q: string, projectId?: string, limit?: number) => {
      const params = new URLSearchParams({ q })
      if (projectId) params.set('projectId', projectId)
      if (limit != null) params.set('limit', String(limit))
      return request<{ count: number; tasks: unknown[] }>(`/api/search?${params}`)
    },
    deleteLink: (linkId: string) =>
      request<{ ok: boolean }>(`/api/links/${linkId}`, { method: 'DELETE' }),
  }
}
