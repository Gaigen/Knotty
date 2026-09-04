'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateTaskScopes } from '@/lib/api'
import type { ProjectRealtimeMessage } from '@/lib/realtime-types'

const DEBOUNCE_MS = 250

/** Подписка на SSE: автоматически подтягивает список, канбан, граф и открытую задачу */
export function useProjectRealtime(projectId: string | null) {
  const qc = useQueryClient()
  const sourceRef = useRef<EventSource | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ taskId?: string; taskIds: Set<string> }>({ taskIds: new Set() })

  useEffect(() => {
    if (!projectId) return

    function flush() {
      debounceRef.current = null
      const pending = pendingRef.current
      pendingRef.current = { taskIds: new Set() }
      invalidateTaskScopes(
        qc,
        projectId!,
        pending.taskId,
        pending.taskIds.size > 0 ? [...pending.taskIds] : undefined
      )
    }

    function scheduleInvalidate(taskId?: string, taskIds?: string[]) {
      if (taskId) pendingRef.current.taskId = taskId
      for (const id of taskIds ?? []) pendingRef.current.taskIds.add(id)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(flush, DEBOUNCE_MS)
    }

    const es = new EventSource(`/api/projects/${projectId}/events`)
    sourceRef.current = es

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ProjectRealtimeMessage
        if (data.projectId !== projectId || data.hello) return
        scheduleInvalidate(data.taskId, data.taskIds)
      } catch {
        // некорректное сообщение — игнорируем
      }
    }

    return () => {
      es.close()
      sourceRef.current = null
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = null
      pendingRef.current = { taskIds: new Set() }
    }
  }, [projectId, qc])
}
