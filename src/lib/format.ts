'use client'

import { PRIORITY_LABELS_RU, TYPE_LABELS_RU } from '@/lib/config'

/** Относительное время: «5 мин назад», «2 ч назад», «вчера» */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'вчера'
  if (days < 7) return `${days} дн назад`
  return formatDate(iso)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

export function isOverdue(dueDate: string | null | undefined, statusCategory: number): boolean {
  if (!dueDate || statusCategory === 3) return false
  const d = new Date(dueDate)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return d.getTime() < today.getTime()
}

export function typeLabel(type: string): string {
  return TYPE_LABELS_RU[type] ?? type
}

export function priorityLabel(priority: string): string {
  return PRIORITY_LABELS_RU[priority] ?? priority
}
