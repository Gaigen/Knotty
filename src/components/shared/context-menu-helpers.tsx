'use client'

/**
 * Общие хелперы для контекстных меню по правой кнопке (ФТ «ПКМ везде»).
 * Переиспользуются на лаунчере, списке задач, канбане, во вкладках панели задачи.
 * Граф использует свой layout, но компоненты пунктов идентичны — см. graph-view.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CtxPos { x: number; y: number }

/**
 * Хранилище состояния ПКМ-меню: позиция экрана + опциональный data-контекст
 * (например, задача/проект/комментарий, на котором был клик).
 *
 * Возвращает open/close и текущее состояние. Esc закрывает меню автоматически.
 */
export function useCtxMenu<T = undefined>() {
  const [state, setState] = useState<{ pos: CtxPos; data: T | undefined } | null>(null)

  const open = (pos: CtxPos, data?: T) => setState({ pos, data })
  const close = () => setState(null)

  useEffect(() => {
    if (!state) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setState(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [!!state])

  return { state, open, close }
}

/** Прозрачный слой-клик-перехватчик: клик/ПКМ вне меню закрывает его. */
export function CtxBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose() }}
      aria-hidden
    />
  )
}

/** Контейнер фиксированного меню в позиции клика, ограниченный краями окна. */
export function CtxContainer({
  pos,
  children,
  minWidth = 230,
  maxHeight = 360,
}: {
  pos: CtxPos
  children: ReactNode
  minWidth?: number
  maxHeight?: number
}) {
  return (
    <div
      className="relative z-50 overflow-visible rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{
        position: 'fixed',
        left: Math.min(pos.x, window.innerWidth - minWidth - 16),
        top: Math.min(pos.y, window.innerHeight - maxHeight),
        minWidth,
      }}
      role="menu"
    >
      {children}
    </div>
  )
}

export function CtxItem({
  icon,
  label,
  onClick,
  danger,
  dot,
  avatar,
  shortcut,
}: {
  icon?: ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  dot?: string
  avatar?: ReactNode
  shortcut?: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
        danger ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-muted'
      )}
    >
      {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />}
      {avatar}
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {shortcut && <span className="ml-auto text-[10px] text-muted-foreground">{shortcut}</span>}
    </button>
  )
}

export function CtxSeparator() {
  return <div className="my-1 h-px bg-border" role="separator" />
}

export function CtxLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{children}</div>
}

/** Пункт с раскрывающимся подразделом (flyout справа). */
export function CtxSubmenu({
  open,
  onToggle,
  icon,
  label,
  children,
}: {
  open: boolean
  onToggle: () => void
  icon?: ReactNode
  label: string
  children: ReactNode
}) {
  return (
    <div className="relative">
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
          open ? 'bg-muted' : 'hover:bg-muted'
        )}
      >
        {icon}
        <span className="flex-1 truncate">{label}</span>
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-[calc(100%-4px)] top-0 z-10 min-w-[180px] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  )
}
