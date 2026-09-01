'use client'

import { prefGet, prefKey, prefSet } from '@/lib/prefs'

/** Построение URL для SPA-навигации (единый маршрут '/') */
export type ProjectTab = 'tasks' | 'board' | 'graph'

export function projectUrl(projectId: string, tab: ProjectTab = 'tasks'): string {
  return `/?project=${projectId}&tab=${tab}`
}

export function projectTaskUrl(projectId: string, tab: ProjectTab, taskId: string | null): string {
  const base = projectUrl(projectId, tab)
  return taskId ? `${base}&task=${taskId}` : base
}

const LAST_PROJECT_KEY = prefKey('lastProject')

export function rememberLastProject(projectId: string) {
  prefSet(LAST_PROJECT_KEY, projectId)
}

export function getLastProjectId(): string | null {
  return prefGet(LAST_PROJECT_KEY)
}
