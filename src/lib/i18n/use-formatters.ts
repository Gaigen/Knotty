'use client'

import { useLocale, useTranslations } from 'next-intl'
import { formatDate as formatDateBase, formatDateTime as formatDateTimeBase, toDateInputValue } from '@/lib/format'

export function useFormatters() {
  const locale = useLocale()
  const t = useTranslations('time')
  const ts = useTranslations('size')

  const timeAgo = (iso: string | null | undefined): string => {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60_000)
    if (min < 1) return t('justNow')
    if (min < 60) return t('minutesAgo', { count: min })
    const hours = Math.floor(min / 60)
    if (hours < 24) return t('hoursAgo', { count: hours })
    const days = Math.floor(hours / 24)
    if (days === 1) return t('yesterday')
    if (days < 7) return t('daysAgo', { count: days })
    return formatDateBase(iso, locale)
  }

  const formatDate = (iso: string | null | undefined) => formatDateBase(iso, locale)
  const formatDateTime = (iso: string | null | undefined) => formatDateTimeBase(iso, locale)

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return ts('bytes', { count: bytes })
    if (bytes < 1024 * 1024) return ts('kb', { value: (bytes / 1024).toFixed(1) })
    return ts('mb', { value: (bytes / (1024 * 1024)).toFixed(1) })
  }

  return { timeAgo, formatDate, formatDateTime, formatSize, toDateInputValue, locale }
}
