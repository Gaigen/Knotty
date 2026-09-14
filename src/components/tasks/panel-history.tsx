'use client'

import { useTranslations } from 'next-intl'
import {
  ArrowLeftRight, FileMinus2, FilePlus2, GitBranch, MessageSquare, MessageSquareOff, Pencil, PlusCircle,
} from 'lucide-react'
import { UserAvatar } from '@/components/shared/bits'
import { useEnumLabels } from '@/lib/i18n/use-enum-labels'
import { useFormatters } from '@/lib/i18n/use-formatters'
import type { TaskFullDto, ActivityDto } from '@/lib/types'

/** История изменений (ФТ-5.3): «кто, что поменял, когда»; показываем последние 100 событий */
export function PanelHistory({ task }: { task: TaskFullDto }) {
  const t = useTranslations('panels.history')
  const { typeLabel, priorityLabel } = useEnumLabels()
  const { formatDateTime, formatDate } = useFormatters()

  function fmtValue(v: unknown): string {
    if (v === null || v === undefined) return '—'
    if (typeof v === 'boolean') return v ? t('yes') : t('no')
    if (Array.isArray(v)) return v.join(', ')
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
        try {
          return formatDate(v)
        } catch {
          return v
        }
      }
      if (['low', 'mid', 'high', 'crit'].includes(v)) return priorityLabel(v)
      if (['epic', 'story', 'task', 'bug'].includes(v)) return typeLabel(v)
      return v
    }
    return JSON.stringify(v)
  }

  function fieldLabel(field: unknown): string {
    if (typeof field === 'string' && field in { title: 1, description: 1, type: 1, assigneeId: 1, priority: 1, dueDate: 1, labels: 1, parentId: 1 }) {
      return t(`fields.${field as 'title'}`)
    }
    return typeof field === 'string' ? field : t('fieldDefault')
  }

  function linkTypeLabel(linkType: unknown): string {
    if (linkType === 'blocks') return t('linkBlocks')
    if (linkType === 'relates') return t('linkRelates')
    return String(linkType)
  }

  function describeEvent(a: ActivityDto): string {
    const p = a.payload as Record<string, unknown>
    switch (a.event) {
      case 'created':
        return t('created')
      case 'status_changed':
        return t('statusChanged', { old: fmtValue(p.old), new: fmtValue(p.new) })
      case 'commented':
        return t('commented')
      case 'comment_edited':
        return t('commentEdited')
      case 'comment_deleted':
        return t('commentDeleted')
      case 'file_added':
        return t('fileAdded', { name: fmtValue(p.fileName) })
      case 'file_removed':
        return t('fileRemoved', { name: fmtValue(p.fileName) })
      case 'linked':
        return p.direction === 'in'
          ? t('linkedIn')
          : t('linkedOut', {
              type: linkTypeLabel(p.type),
              other: p.otherKey ? t('linkedOutWith', { key: fmtValue(p.otherKey) }) : '',
            })
      case 'unlinked':
        return t('unlinked', {
          other: p.otherKey ? t('unlinkedWith', { key: fmtValue(p.otherKey) }) : '',
        })
      case 'field_changed': {
        const field = (p.field as string) || fieldLabel(p.fieldLabel)
        const fieldKey = typeof p.field === 'string' ? p.field : null
        if (fieldKey === 'description') return t('descriptionChanged')
        if (fieldKey === 'labels') return t('labelsChanged')
        const oldV = p.old === null || p.old === undefined ? '—' : fmtValue(p.old)
        const newV = p.new === null || p.new === undefined ? '—' : fmtValue(p.new)
        if (fieldKey === 'dueDate') {
          return t('dueChanged', {
            old: oldV === '—' ? t('noDue') : oldV,
            new: newV === '—' ? t('noDue') : newV,
          })
        }
        if (fieldKey === 'assigneeId') {
          return t('assigneeChanged', { name: newV === '—' ? t('notAssigned') : newV })
        }
        if (fieldKey === 'parentId') {
          return t('parentChanged', {
            old: oldV === '—' ? t('noParent') : oldV,
            new: newV === '—' ? t('noParent') : newV,
          })
        }
        if (fieldKey === 'title') return t('titleChanged')
        if (fieldKey === 'priority') return t('priorityChanged', { old: oldV, new: newV })
        if (fieldKey === 'type') return t('typeChanged', { old: oldV, new: newV })
        const label = fieldLabel(fieldKey ?? p.fieldLabel)
        return oldV !== newV
          ? t('fieldGeneric', { field: label, old: oldV, new: newV })
          : t('fieldGeneric', { field: label, old: oldV, new: newV })
      }
      default:
        return a.event
    }
  }

  if (task.activity.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
  }

  return (
    <div>
      <ol className="space-y-0 p-4" aria-label={t('aria')}>
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
        <p className="border-t px-4 py-2 text-center text-xs text-muted-foreground">{t('truncated')}</p>
      )}
    </div>
  )
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
    case 'comment_edited':
      return <span className={cls}><Pencil className="h-3.5 w-3.5 text-sky-600" /></span>
    case 'comment_deleted':
      return <span className={cls}><MessageSquareOff className="h-3.5 w-3.5 text-muted-foreground" /></span>
    case 'file_added':
      return <span className={cls}><FilePlus2 className="h-3.5 w-3.5 text-amber-600" /></span>
    case 'file_removed':
      return <span className={cls}><FileMinus2 className="h-3.5 w-3.5 text-amber-700" /></span>
    case 'linked':
    case 'unlinked':
      return <span className={cls}><ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" /></span>
    default:
      return <span className={cls}><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></span>
  }
}
