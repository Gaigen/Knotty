'use client'

import {
  ArrowLeftRight, FilePlus2, GitBranch, MessageSquare, Pencil, PlusCircle,
} from 'lucide-react'
import { UserAvatar } from '@/components/shared/bits'
import { formatDateTime } from '@/lib/format'
import type { TaskFullDto, ActivityDto } from '@/lib/types'

/** История изменений (ФТ-5.3): «кто, что поменял, когда»; показываем последние 100 событий */
export function PanelHistory({ task }: { task: TaskFullDto }) {
  if (task.activity.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">История пуста</p>
  }
  return (
    <div>
      <ol className="space-y-0 p-4" aria-label="История изменений">
        {task.activity.map((a, i) => (
          <li key={a.id} className="relative flex gap-3 pb-4">
            {i < task.activity.length - 1 && <span className="absolute left-[13px] top-8 h-full w-px bg-border" aria-hidden />}
            <EventIcon event={a} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">{describeEvent(a)}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserAvatar user={a.actor} size={14} />
                {a.actor.name} · {formatDateTime(a.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {task.activity.length >= 100 && (
        <p className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
          Показаны последние 100 событий
        </p>
      )}
    </div>
  )
}

function describeEvent(a: ActivityDto): string {
  const p = a.payload as Record<string, unknown>
  switch (a.event) {
    case 'created':
      return `создал(а) задачу`
    case 'status_changed':
      return `изменил(а) статус: ${fmt(p.old)} → ${fmt(p.new)}`
    case 'commented':
      return 'оставил(а) комментарий'
    case 'file_added':
      return `добавил(а) файл «${fmt(p.fileName)}»`
    case 'linked':
      return p.direction === 'in' ? 'добавил(а) входящую связь' : `создал(а) связь (${linkType(p.type)})${p.otherKey ? ` с ${fmt(p.otherKey)}` : ''}`
    case 'unlinked':
      return `удалил(а) связь${p.otherKey ? ` с ${fmt(p.otherKey)}` : ''}`
    case 'field_changed': {
      const label = fmt(p.fieldLabel) || 'поле'
      if (label === 'описание') return 'изменил(а) описание'
      if (label === 'метки') return `обновил(а) метки`
      const oldV = p.old === null || p.old === undefined ? '—' : fmt(p.old)
      const newV = p.new === null || p.new === undefined ? '—' : fmt(p.new)
      if (label === 'срок') return `изменил(а) срок: ${oldV === '—' ? 'без срока' : oldV} → ${newV === '—' ? 'без срока' : newV}`
      if (label === 'исполнитель') return `сменил(а) исполнителя → ${newV === '—' ? 'не назначен' : newV}`
      return `изменил(а) ${label}${oldV !== newV ? `: ${oldV} → ${newV}` : ''}`
    }
    default:
      return a.event
  }
}

function linkType(t: unknown): string {
  if (t === 'blocks') return 'блокирует'
  if (t === 'relates') return 'связана'
  return String(t)
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'да' : 'нет'
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'string') {
    // даты ISO → читаемый вид
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      try {
        return new Date(v).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      } catch {
        return v
      }
    }
    // приоритет/тип — локализация
    const map: Record<string, string> = {
      low: 'низкий', mid: 'средний', high: 'высокий', crit: 'критический',
      epic: 'эпик', story: 'стори', task: 'задача', bug: 'баг',
    }
    return map[v] ?? v
  }
  return JSON.stringify(v)
}

function EventIcon({ event }: { event: ActivityDto }) {
  const cls = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background'
  switch (event.event) {
    case 'created':
      return <span className={cls}><PlusCircle className="h-3.5 w-3.5 text-teal-700" /></span>
    case 'status_changed':
      return <span className={cls}><GitBranch className="h-3.5 w-3.5 text-violet-600" /></span>
    case 'commented':
      return <span className={cls}><MessageSquare className="h-3.5 w-3.5 text-sky-700" /></span>
    case 'file_added':
      return <span className={cls}><FilePlus2 className="h-3.5 w-3.5 text-amber-600" /></span>
    case 'linked':
    case 'unlinked':
      return <span className={cls}><ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" /></span>
    default:
      return <span className={cls}><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></span>
  }
}
