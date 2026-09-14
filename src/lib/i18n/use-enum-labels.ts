'use client'

import { useTranslations } from 'next-intl'
import { TASK_TYPES, PRIORITIES } from '@/lib/config'

export function useEnumLabels() {
  const taskType = useTranslations('taskType')
  const priority = useTranslations('priority')
  const category = useTranslations('category')
  const status = useTranslations('status')

  return {
    typeLabel: (type: string) => {
      if ((TASK_TYPES as readonly string[]).includes(type)) return taskType(type as 'epic')
      return type
    },
    priorityLabel: (p: string) => {
      if ((PRIORITIES as readonly string[]).includes(p)) return priority(p as 'low')
      return p
    },
    categoryLabel: (c: number) => category(String(c) as '0'),
    noStatusLabel: () => status('noStatus'),
  }
}
