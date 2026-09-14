'use client'

import type { Locale } from '@/i18n/routing'

function dateLocale(locale: string): string {
  return locale === 'en' ? 'en-US' : 'ru-RU'
}

/** @deprecated Prefer useFormatters().timeAgo in client components */
export function timeAgo(iso: string | null | undefined, locale: Locale = 'ru'): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return locale === 'en' ? 'just now' : 'только что'
  if (min < 60) return locale === 'en' ? `${min} min ago` : `${min} мин назад`
  const hours = Math.floor(min / 60)
  if (hours < 24) return locale === 'en' ? `${hours} h ago` : `${hours} ч назад`
  const days = Math.floor(hours / 24)
  if (days === 1) return locale === 'en' ? 'yesterday' : 'вчера'
  if (days < 7) return locale === 'en' ? `${days} d ago` : `${days} дн назад`
  return formatDate(iso, locale)
}

export function formatDate(iso: string | null | undefined, locale: Locale = 'ru'): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'short' })
}

export function formatDateTime(iso: string | null | undefined, locale: Locale = 'ru'): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(dateLocale(locale), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatSize(bytes: number, locale: Locale = 'ru'): string {
  if (bytes < 1024) return locale === 'en' ? `${bytes} B` : `${bytes} Б`
  if (bytes < 1024 * 1024) {
    const v = (bytes / 1024).toFixed(1)
    return locale === 'en' ? `${v} KB` : `${v} КБ`
  }
  const v = (bytes / (1024 * 1024)).toFixed(1)
  return locale === 'en' ? `${v} MB` : `${v} МБ`
}

export function isOverdue(dueDate: string | null | undefined, statusCategory: number): boolean {
  if (!dueDate || statusCategory === 3) return false
  const d = new Date(dueDate)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return d.getTime() < today.getTime()
}

/** @deprecated Use useEnumLabels() in client components */
export function typeLabel(type: string): string {
  const ru: Record<string, string> = { epic: 'Эпик', story: 'Стори', task: 'Задача', bug: 'Баг' }
  return ru[type] ?? type
}

/** @deprecated Use useEnumLabels() in client components */
export function priorityLabel(priority: string): string {
  const ru: Record<string, string> = { low: 'Низкий', mid: 'Средний', high: 'Высокий', crit: 'Критический' }
  return ru[priority] ?? priority
}
