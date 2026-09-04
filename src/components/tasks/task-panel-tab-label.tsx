'use client'

import { cn } from '@/lib/utils'

export type TaskPanelTabId = 'details' | 'comments' | 'attachments' | 'links' | 'history'

const TAB_LABELS: Record<TaskPanelTabId, { full: string; short?: string }> = {
  details: { full: 'Детали' },
  comments: { full: 'Комментарии', short: 'Комм.' },
  attachments: { full: 'Вложения', short: 'Файлы' },
  links: { full: 'Связи' },
  history: { full: 'История' },
}

export function TaskPanelTabLabel({
  id,
  count,
  variant = 'full',
  className,
}: {
  id: TaskPanelTabId
  count?: number
  variant?: 'full' | 'compact'
  className?: string
}) {
  const cfg = TAB_LABELS[id]
  const text = variant === 'compact' && cfg.short ? cfg.short : cfg.full

  return (
    <span className={cn('inline-flex max-w-full items-center justify-center gap-1', className)}>
      <span className="truncate">{text}</span>
      {!!count && (
        <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-foreground/10 px-1 text-[9px] font-semibold leading-none tabular-nums">
          {count}
        </span>
      )}
    </span>
  )
}

export const TASK_PANEL_TAB_TRIGGER_CLASS =
  'h-8 min-w-0 flex-1 overflow-hidden rounded-md px-1 text-[11px] font-medium leading-tight text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:bg-background dark:data-[state=active]:border-transparent sm:px-1.5 sm:text-xs'
