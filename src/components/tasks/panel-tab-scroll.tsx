'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Прокручиваемое тело вкладки в полноэкранной панели задачи */
export function PanelTabScroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('custom-scroll h-full min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}>
      {children}
    </div>
  )
}
