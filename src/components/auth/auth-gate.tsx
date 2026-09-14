'use client'

import { useEffect, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useMe } from '@/lib/api'

/** Обёртка приватных экранов: пока проверяем сессию — сплэш; не авторизован — /login */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter()
  const t = useTranslations('session')
  const { data, isLoading } = useMe()

  useEffect(() => {
    if (!isLoading && data && !data.user) {
      router.replace('/login')
    }
  }, [isLoading, data, router])

  if (isLoading || !data?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{t('checking')}</span>
      </div>
    )
  }

  return <>{children}</>
}
