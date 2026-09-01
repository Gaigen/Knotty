'use client'

import { Bug, Layers, Bookmark, SquareCheckBig, ChevronDown, ChevronUp, Equal, Flame, ArrowUp, ArrowDownRight, User, File as FileIcon, FileText, FileArchive, Image as ImageIcon, Music, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserDto } from '@/lib/types'

// ---------- Тип задачи ----------

export function TypeIcon({ type, className }: { type: string; className?: string }) {
  const cls = cn('h-4 w-4 shrink-0', className)
  switch (type) {
    case 'epic':
      return <Layers className={cn(cls, 'text-violet-600')} aria-label="Эпик" />
    case 'story':
      return <Bookmark className={cn(cls, 'text-emerald-600')} aria-label="Стори" />
    case 'bug':
      return <Bug className={cn(cls, 'text-red-600')} aria-label="Баг" />
    default:
      return <SquareCheckBig className={cn(cls, 'text-sky-700')} aria-label="Задача" />
  }
}

// ---------- Приоритет ----------

export function PriorityIcon({ priority, className }: { priority: string; className?: string }) {
  const cls = cn('h-3.5 w-3.5 shrink-0', className)
  switch (priority) {
    case 'crit':
      return <Flame className={cn(cls, 'text-red-600')} aria-label="Критический приоритет" />
    case 'high':
      return <ArrowUp className={cn(cls, 'text-orange-500')} aria-label="Высокий приоритет" />
    case 'low':
      return <ArrowDownRight className={cn(cls, 'text-slate-400')} aria-label="Низкий приоритет" />
    default:
      return <Equal className={cn(cls, 'text-slate-400')} aria-label="Средний приоритет" />
  }
}

// ---------- Статус ----------

export function StatusBadge({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap',
        className
      )}
      style={{ backgroundColor: `${color}1f`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
      {name}
    </span>
  )
}

// ---------- Пользователь ----------

export function UserAvatar({ user, size = 24, className }: { user?: UserDto | null; size?: number; className?: string }) {
  const initials = user?.name
    ?.split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.name} width={size} height={size} className={cn('rounded-full object-cover', className)} style={{ width: size, height: size }} />
  }
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground select-none',
        !user && 'border border-dashed',
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.42) }}
      title={user?.name}
      aria-label={user ? user.name : 'Не назначен'}
    >
      {user ? initials : <User style={{ width: size * 0.55, height: size * 0.55 }} />}
    </span>
  )
}

// ---------- Метки ----------

const LABEL_COLORS = ['#0f766e', '#7c3aed', '#b45309', '#be123c', '#4338ca', '#0e7490', '#713f12', '#4d7c0f']

export function labelColor(label: string): string {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return LABEL_COLORS[hash % LABEL_COLORS.length]
}

export function LabelChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  const color = labelColor(label)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap"
      style={{ backgroundColor: `${color}14`, color }}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="rounded-full hover:bg-black/10 px-0.5 leading-none"
          aria-label={`Убрать метку ${label}`}
        >
          ×
        </button>
      )}
    </span>
  )
}

// ---------- Прочее ----------

export function ChevronToggle({ open, className }: { open: boolean; className?: string }) {
  return open ? (
    <ChevronUp className={cn('h-3.5 w-3.5 text-muted-foreground', className)} />
  ) : (
    <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground', className)} />
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center">
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <div className="text-base font-medium">{title}</div>
      {description && <div className="max-w-md text-sm text-muted-foreground">{description}</div>}
      {action}
    </div>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}

// ---------- Иконка типа файла ----------

export function FileMimeIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith('image/')) return <ImageIcon className={className} />
  if (mime.startsWith('video/')) return <Video className={className} />
  if (mime.startsWith('audio/')) return <Music className={className} />
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return <FileArchive className={className} />
  if (mime.startsWith('text/') || mime.includes('pdf') || mime.includes('word')) return <FileText className={className} />
  return <FileIcon className={className} />
}
