'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Глобальный error boundary: краш рантайма не превращается в белый экран */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')

  useEffect(() => {
    console.error('[app error]', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} className="gap-1.5">
          <RotateCcw className="h-4 w-4" /> {t('retry')}
        </Button>
        <Button variant="outline" onClick={() => window.location.assign('/')}>
          {t('home')}
        </Button>
      </div>
    </div>
  )
}
