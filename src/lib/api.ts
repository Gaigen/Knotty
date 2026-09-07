'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  AttachmentDto, CommentDto, GraphDto, ProjectDetailDto, ProjectSummaryDto, SessionUserDto, TaskFullDto, TaskRowDto, UserDto,
} from '@/lib/types'

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: options?.body instanceof FormData
      ? options?.headers
      : { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  if (!res.ok) {
    // сессия истекла / нет входа — на логин (кроме самих auth-роутов, чтобы не было цикла)
    if (res.status === 401 && typeof window !== 'undefined' && !url.startsWith('/api/auth')) {
      window.location.href = '/login'
    }
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? `Ошибка запроса (${res.status})`)
  }
  return res.json() as Promise<T>
}

// ---------- Аутентификация ----------

/** Кто залогинен. {user: null} — если никто. Никогда не редиректит. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<{ user: SessionUserDto | null }>('/api/auth/session'),
    staleTime: 60_000,
  })
}

export async function loginRequest(email: string, password: string): Promise<SessionUserDto> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = (await res.json().catch(() => ({}))) as { user?: SessionUserDto; error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Не удалось войти')
  return data.user as SessionUserDto
}

export async function bootstrapRequest(
  name: string,
  email: string,
  password: string
): Promise<SessionUserDto> {
  const res = await fetch('/api/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  })
  const data = (await res.json().catch(() => ({}))) as { user?: SessionUserDto; error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Не удалось выполнить первичную настройку')
  return data.user as SessionUserDto
}

export async function logoutRequest(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
}

export function useChangeMyPassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiFetch<{ ok: boolean }>('/api/account/password', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })
}

export interface ApiTokenSummaryDto {
  id: string
  name: string
  lastUsedAt: string | null
  createdAt: string
}

export function useApiTokens() {
  return useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => apiFetch<ApiTokenSummaryDto[]>('/api/account/tokens'),
  })
}

export function useCreateApiToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string }) =>
      apiFetch<{ id: string; name: string; token: string; createdAt: string }>('/api/account/tokens', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  })
}

export function useDeleteApiToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean }>(`/api/account/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  })
}

export function useRevealApiToken() {
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string; name: string; token: string }>(`/api/account/tokens/${id}/reveal`),
  })
}

/**
 * Инвалидация всех скоупов, зависящих от задач проекта (п. 1.2 ТЗ):
 * одно ядро данных — список, канбан, граф и панель обновятся без ручной синхронизации.
 */
export function invalidateTaskScopes(qc: QueryClient, projectId?: string, taskId?: string, relatedTaskIds?: string[]) {
  if (projectId) {
    qc.invalidateQueries({ queryKey: ['tasks', projectId] })
    qc.invalidateQueries({ queryKey: ['project', projectId] })
    qc.invalidateQueries({ queryKey: ['graph', projectId] })
  }
  const ids = new Set<string>()
  if (taskId) ids.add(taskId)
  for (const id of relatedTaskIds ?? []) ids.add(id)
  for (const id of ids) qc.invalidateQueries({ queryKey: ['task', id] })
  qc.invalidateQueries({ queryKey: ['projects'] })
}

// ---------- Запросы ----------

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectSummaryDto[]>('/api/projects'),
  })
}

export function useImportProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip'
      if (isZip) {
        const form = new FormData()
        form.append('file', file)
        return apiFetch<{ projectId: string; key: string; tasks: number; graphNodes: number; attachments?: number }>(
          '/api/projects/import',
          { method: 'POST', body: form }
        )
      }
      const text = await file.text()
      const data = JSON.parse(text) as Record<string, unknown>
      return apiFetch<{ projectId: string; key: string; tasks: number; graphNodes: number; attachments?: number }>(
        '/api/projects/import',
        { method: 'POST', body: JSON.stringify(data) }
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => apiFetch<ProjectDetailDto>(`/api/projects/${id}`),
    enabled: !!id,
  })
}

export function useTasks(projectId: string | null, q?: string) {
  return useQuery({
    queryKey: ['tasks', projectId, q ?? ''],
    queryFn: () => apiFetch<TaskRowDto[]>(`/api/projects/${projectId}/tasks${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    enabled: !!projectId,
    placeholderData: (prev) => prev,
  })
}

export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => apiFetch<TaskFullDto>(`/api/tasks/${taskId}`),
    enabled: !!taskId,
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<UserDto[]>('/api/users'),
    staleTime: 5 * 60_000,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      name: string
      email: string
      password: string
      avatarUrl?: string
      isAdmin?: boolean
    }) => apiFetch<UserDto>('/api/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: Partial<{
        name: string
        email: string
        avatarUrl: string | null
        password: string
        isAdmin: boolean
      }>
    }) => apiFetch<UserDto>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiFetch<{ ok: boolean; releasedTasks: number }>(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}


export function useGraph(projectId: string | null) {
  return useQuery({
    queryKey: ['graph', projectId],
    queryFn: () => apiFetch<GraphDto>(`/api/projects/${projectId}/graph`),
    enabled: !!projectId,
  })
}

// ---------- Проекты ----------

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; key?: string; description?: string; color?: string }) =>
      apiFetch<{ id: string }>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string; color?: string; isFavorite?: boolean; autoGraph?: boolean }) =>
      apiFetch<ProjectDetailDto>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', p.id] })
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, key }: { id: string; key: string }) =>
      apiFetch<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE', body: JSON.stringify({ key }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

// ---------- Задачи ----------

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, ...body }: {
      projectId: string
      type?: string
      title?: string
      description?: string
      statusId?: string
      assigneeId?: string | null
      priority?: string
      dueDate?: string | null
      labels?: string[]
      parentId?: string | null
      addToGraph?: boolean
    }) => apiFetch<TaskRowDto>(`/api/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (task) => invalidateTaskScopes(qc, task.projectId, task.id, task.parentId ? [task.parentId] : undefined),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, projectId, ...body }: {
      id: string
      projectId?: string
      title?: string
      description?: string
      type?: string
      statusId?: string
      assigneeId?: string | null
      priority?: string
      dueDate?: string | null
      labels?: string[]
      parentId?: string | null
      boardOrder?: string
    }) => apiFetch<TaskFullDto>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (task) => {
      qc.setQueryData(['task', task.id], task)
      invalidateTaskScopes(qc, task.projectId, task.id, task.parentId ? [task.parentId] : undefined)
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string; parentId?: string }) =>
      apiFetch<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: (_r, vars) =>
      invalidateTaskScopes(qc, vars.projectId, vars.id, vars.parentId ? [vars.parentId] : undefined),
  })
}

// ---------- Комментарии ----------

export function useAddComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; projectId?: string; body: string }) =>
      apiFetch<CommentDto>(`/api/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: (c, vars) => invalidateTaskScopes(qc, vars.projectId, vars.taskId),
  })
}

export function useUpdateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body, taskId }: { id: string; body: string; taskId: string; projectId?: string }) =>
      apiFetch<CommentDto>(`/api/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
    onSuccess: (_c, vars) => invalidateTaskScopes(qc, vars.projectId, vars.taskId),
  })
}

export function useDeleteComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, taskId }: { id: string; taskId: string; projectId?: string }) =>
      apiFetch<{ ok: boolean }>(`/api/comments/${id}`, { method: 'DELETE' }),
    onSuccess: (_c, vars) => invalidateTaskScopes(qc, vars.projectId, vars.taskId),
  })
}

// ---------- Вложения ----------

export function useUploadAttachments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, files }: { taskId: string; projectId?: string; files: File[] }) => {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      return apiFetch<AttachmentDto[]>(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: form })
    },
    onSuccess: (_a, vars) => invalidateTaskScopes(qc, vars.projectId, vars.taskId),
  })
}

export function useDeleteAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; taskId?: string; projectId?: string }) =>
      apiFetch<{ ok: boolean }>(`/api/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: (_a, vars) => invalidateTaskScopes(qc, vars.projectId, vars.taskId),
  })
}

// ---------- Связи ----------

export function useCreateLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fromTaskId, toTaskId, toKey, type }: {
      fromTaskId: string
      toTaskId?: string
      toKey?: string
      type: string
      projectId?: string
    }) =>
      apiFetch<{ id: string; toTaskId?: string; graphNodesAdded?: number }>(`/api/tasks/${fromTaskId}/links`, {
        method: 'POST',
        body: JSON.stringify({ toTaskId, toKey, type }),
      }),
    onSuccess: (res, vars) =>
      invalidateTaskScopes(qc, vars.projectId, vars.fromTaskId, res.toTaskId ? [res.toTaskId] : undefined),
  })
}

export function useDeleteLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; projectId?: string }) =>
      apiFetch<{ ok: boolean }>(`/api/links/${id}`, { method: 'DELETE' }),
    onSuccess: (_l, vars) => invalidateTaskScopes(qc, vars.projectId),
  })
}

// ---------- Граф ----------

export function useCreateGraphNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, ...body }: {
      projectId: string
      refType: string
      refId?: string
      x?: number
      y?: number
      text?: string
      w?: number
      h?: number
    }) => apiFetch<{ id: string }>(`/api/projects/${projectId}/graph/nodes`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (_n, vars) => qc.invalidateQueries({ queryKey: ['graph', vars.projectId] }),
  })
}

export function useBulkAddGraphTasks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, all, taskIds }: { projectId: string; all?: boolean; taskIds?: string[] }) =>
      apiFetch<{ created: number; ids: string[] }>(`/api/projects/${projectId}/graph/bulk-add`, {
        method: 'POST',
        body: JSON.stringify(all ? { all: true } : { taskIds }),
      }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['graph', vars.projectId] })
      qc.invalidateQueries({ queryKey: ['tasks', vars.projectId] })
    },
  })
}

export function useUpdateGraphNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: {
      id: string
      projectId?: string
      x?: number
      y?: number
      text?: string
      color?: string | null
      w?: number
      h?: number
      parentId?: string | null
    }) =>
      apiFetch<{ ok: boolean }>(`/api/graph/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  })
}

export function useDeleteGraphNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string }) =>
      apiFetch<{ ok: boolean }>(`/api/graph/nodes/${id}`, { method: 'DELETE' }),
    onSuccess: (_n, vars) => qc.invalidateQueries({ queryKey: ['graph', vars.projectId] }),
  })
}

export function useSaveGraphPositions() {
  return useMutation({
    mutationFn: ({
      projectId,
      positions,
    }: {
      projectId: string
      positions: { id: string; x: number; y: number; parentId?: string | null }[]
    }) =>
      apiFetch<{ ok: boolean }>(`/api/projects/${projectId}/graph`, { method: 'PATCH', body: JSON.stringify({ positions }) }),
  })
}

export function useWrapGraphGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, nodeIds, title }: { projectId: string; nodeIds: string[]; title?: string }) =>
      apiFetch<{ id: string }>(`/api/projects/${projectId}/graph/groups`, {
        method: 'POST',
        body: JSON.stringify({ nodeIds, title }),
      }),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['graph', vars.projectId] }),
  })
}

// ---------- Свободные рёбра канваса ----------

export function useCreateGraphEdge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      fromNodeId,
      toNodeId,
      kind,
    }: {
      projectId: string
      fromNodeId: string
      toNodeId: string
      kind?: 'canvas' | 'relates' | 'blocks'
    }) =>
      apiFetch<{ id: string }>(`/api/projects/${projectId}/graph/edges`, {
        method: 'POST',
        body: JSON.stringify({ fromNodeId, toNodeId, kind }),
      }),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['graph', vars.projectId] }),
  })
}

export function useDeleteGraphEdge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string }) =>
      apiFetch<{ ok: boolean }>(`/api/graph/edges/${id}`, { method: 'DELETE' }),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['graph', vars.projectId] }),
  })
}

// ---------- Статусы (настройка workflow) ----------

function invalidateProjectScopes(qc: QueryClient, projectId?: string) {
  if (projectId) {
    qc.invalidateQueries({ queryKey: ['project', projectId] })
    qc.invalidateQueries({ queryKey: ['tasks', projectId] })
    qc.invalidateQueries({ queryKey: ['graph', projectId] })
  }
  qc.invalidateQueries({ queryKey: ['projects'] })
}

export function useCreateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, ...body }: { projectId: string; name: string; color?: string; category?: number }) =>
      apiFetch<{ id: string }>(`/api/projects/${projectId}/statuses`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (_r, vars) => invalidateProjectScopes(qc, vars.projectId),
  })
}

export function useUpdateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, projectId, ...body }: { id: string; projectId?: string; name?: string; color?: string; category?: number }) =>
      apiFetch<{ ok: boolean }>(`/api/statuses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (_r, vars) => invalidateProjectScopes(qc, vars.projectId),
  })
}

export function useDeleteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      projectId,
      migrateTo,
      createNoStatus,
    }: {
      id: string
      projectId: string
      migrateTo?: string
      createNoStatus?: boolean
    }) =>
      apiFetch<{ ok: boolean }>(`/api/statuses/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ migrateTo, createNoStatus }),
      }),
    onSuccess: (_r, vars) => invalidateProjectScopes(qc, vars.projectId),
  })
}

export function useReorderStatuses() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, order }: { projectId: string; order: string[] }) =>
      apiFetch<{ ok: boolean }>(`/api/projects/${projectId}/statuses`, { method: 'PATCH', body: JSON.stringify({ order }) }),
    onSuccess: (_r, vars) => invalidateProjectScopes(qc, vars.projectId),
  })
}

// ---------- Прочее ----------

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function attachmentFileUrl(id: string, preview = false): string {
  return `/api/attachments/${id}${preview ? '?preview=1' : ''}`
}
