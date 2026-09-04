'use client'

import { cn } from '@/lib/utils'

export type TaskPanelTabId = 'details' | 'comments' | 'attachments' | 'links' | 'history'

const TAB_LABELS: Record<TaskPanelTabId, string> = {
  details: 'Детали',
  comments: 'Комментарии',
  attachments: 'Вложения',
  links: 'Связи',
  history: 'История',
}

export function TaskPanelTabLabel({ id, count }: { id: TaskPanelTabId; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span>{TAB_LABELS[id]}</span>
      {!!count && (
        <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-foreground/10 px-1 text-[9px] font-semibold leading-none tabular-nums">
          {count}
        </span>
      )}
    </span>
  )
}

/** Вкладки по ширине контента; при нехватке места переносятся на следующую строку */
export const TASK_PANEL_TABS_LIST_CLASS = 'flex h-auto w-full flex-wrap gap-1 bg-transparent p-0'

export const TASK_PANEL_TAB_TRIGGER_CLASS = cn(
  'h-8 flex-none shrink-0 rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground',
  'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
  'dark:data-[state=active]:bg-background dark:data-[state=active]:border-transparent',
)
