'use client'

import { useEffect, useState } from 'react'
import { TaskPanelFull } from '@/components/tasks/task-panel-full'
import { TaskPanelCompact } from '@/components/tasks/task-panel-compact'
import type { StatusDto, UserDto } from '@/lib/types'
import { prefGet, prefKey, prefSet } from '@/lib/prefs'

/**
 * Обёртка-переключатель между полноэкранным редактором и компактной правой панелью.
 * Сохраняет выбор пользователя в localStorage.
 * Public API прежний — project-view менять не нужно.
 */
const STORAGE_KEY = prefKey('taskPanelMode')
const DEFAULT_MODE: 'full' | 'compact' = 'full'

function readMode(): 'full' | 'compact' {
  if (typeof window === 'undefined') return DEFAULT_MODE
  const v = prefGet(STORAGE_KEY)
  if (v === 'compact' || v === 'full') return v
  return DEFAULT_MODE
}

export function TaskPanel(props: {
  taskId: string
  users: UserDto[]
  statuses: StatusDto[]
  projectKey: string
  onClose: () => void
  onOpenTask: (id: string) => void
  onDeleted: () => void
}) {
  // SSR-стабильный стартовый режим, заменяется на клиентский после mount,
  // чтобы избежать hydration mismatch.
  const [mode, setMode] = useState<'full' | 'compact'>(DEFAULT_MODE)
  const [mounted, setMounted] = useState(false)

  // чтение localStorage после mount — иначе SSR/клиент дадут разный режим (hydration mismatch)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(readMode())
    setMounted(true)
  }, [])

  function switchMode(next: 'full' | 'compact') {
    setMode(next)
    prefSet(STORAGE_KEY, next)
  }

  // До монтирования рендерим full-режим (по умолчанию), чтобы совпасть с SSR.
  // На клиенте после mount — актуальный режим из localStorage.
  const currentMode = mounted ? mode : DEFAULT_MODE

  const sharedProps = {
    ...props,
    onSwitchMode: () => switchMode(currentMode === 'full' ? 'compact' : 'full'),
  }

  if (currentMode === 'compact') {
    return <TaskPanelCompact {...sharedProps} />
  }
  return <TaskPanelFull {...sharedProps} />
}
