'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateTaskScopes } from '@/lib/api'
import {
  graphEchoKey,
  projectEchoKey,
  shouldIgnoreLocalEcho,
  taskEchoKey,
} from '@/lib/mutation-echo'
import type { ProjectRealtimeMessage } from '@/lib/realtime-types'

const DEBOUNCE_MS = 250

type PendingScope = 'full' | 'task' | 'graph' | 'none'

const SCOPE_RANK: Record<PendingScope, number> = {
  none: 0,
  task: 1,
  graph: 2,
  full: 3,
}

function mergeScope(a: PendingScope, b: PendingScope): PendingScope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b
}

/** Подписка на SSE: обновляет кэш React Query, подавляя эхо собственных мутаций */
export function useProjectRealtime(projectId: string | null) {
  const qc = useQueryClient()
  const sourceRef = useRef<EventSource | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ taskId?: string; taskIds: Set<string>; scope: PendingScope }>({
    taskIds: new Set(),
    scope: 'none',
  })

  useEffect(() => {
    if (!projectId) return

    function flush() {
      debounceRef.current = null
      const pending = pendingRef.current
      pendingRef.current = { taskIds: new Set(), scope: 'none' }

      const scope = pending.scope
      if (scope === 'none') return

      const taskId = pending.taskId
      if (taskId && shouldIgnoreLocalEcho(taskEchoKey(taskId))) return
      if (scope === 'graph' && shouldIgnoreLocalEcho(graphEchoKey(projectId!))) return
      if (scope === 'full' && shouldIgnoreLocalEcho(projectEchoKey(projectId!))) return

      invalidateTaskScopes(
        qc,
        projectId!,
        taskId,
        pending.taskIds.size > 0 ? [...pending.taskIds] : undefined,
        scope
      )
    }

    function scheduleInvalidate(
      taskId?: string,
      taskIds?: string[],
      scope: PendingScope = 'full'
    ) {
      if (taskId) pendingRef.current.taskId = taskId
      for (const id of taskIds ?? []) pendingRef.current.taskIds.add(id)
      pendingRef.current.scope = mergeScope(pendingRef.current.scope, scope)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(flush, DEBOUNCE_MS)
    }

    const es = new EventSource(`/api/projects/${projectId}/events`)
    sourceRef.current = es

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ProjectRealtimeMessage
        if (data.projectId !== projectId || data.hello) return
        scheduleInvalidate(data.taskId, data.taskIds, data.scope ?? 'full')
      } catch {
        // некорректное сообщение — игнорируем
      }
    }

    return () => {
      es.close()
      sourceRef.current = null
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = null
      pendingRef.current = { taskIds: new Set(), scope: 'none' }
    }
  }, [projectId, qc])
}
