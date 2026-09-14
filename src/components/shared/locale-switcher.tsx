'use client'

import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as Locale
  const t = useTranslations('locale')
  const router = useRouter()
  const pathname = usePathname()

  return (
    <Select
      value={locale}
      onValueChange={(next) => router.replace(pathname, { locale: next as Locale })}
    >
      <SelectTrigger className={className} aria-label={t('label')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {routing.locales.map((l) => (
          <SelectItem key={l} value={l}>
            {t(l)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
