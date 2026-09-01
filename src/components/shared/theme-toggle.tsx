'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Переключатель светлой/тёмной/системной темы.
 *  До монтирования тексты нейтральны — SSR и первый клиентский рендер совпадают,
 *  иначе Next.js ловит hydration mismatch на aria-label/title. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const isDark = mounted && resolvedTheme === 'dark'
  const label = mounted ? (isDark ? 'Включить светлую тему' : 'Включить тёмную тему') : 'Переключить тему'
  const title = mounted ? (isDark ? 'Светлая тема' : 'Тёмная тема') : 'Тема'

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('shrink-0', className)}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={title}
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )
      ) : (
        <Moon className="h-4 w-4 opacity-0" aria-hidden />
      )}
    </Button>
  )
}
