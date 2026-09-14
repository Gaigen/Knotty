import { getTranslations } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { routing, type Locale } from '@/i18n/routing'
import { ApiError } from './validation'

export async function resolveApiLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value
  if (cookieLocale && routing.locales.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale
  }

  const accept = (await headers()).get('accept-language') ?? ''
  if (/\ben\b/i.test(accept)) return 'en'
  return routing.defaultLocale
}

export async function getApiTranslations(namespace: 'apiErrors' | 'taskType' = 'apiErrors') {
  const locale = await resolveApiLocale()
  return getTranslations({ locale, namespace })
}

export async function apiError(
  key: string,
  values?: Record<string, string | number>,
  status = 400
): Promise<never> {
  const t = await getApiTranslations()
  throw new ApiError(t(key as Parameters<typeof t>[0], values), status)
}

export async function taskTypeLabel(type: string): Promise<string> {
  const locale = await resolveApiLocale()
  const t = await getTranslations({ locale, namespace: 'taskType' })
  return t(type as Parameters<typeof t>[0])
}
