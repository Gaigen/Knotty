import { getTranslations } from 'next-intl/server'
import { LoginPage } from '@/components/auth/login-page'
import { APP_NAME } from '@/lib/branding'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'meta' })
  return { title: t('loginTitle', { appName: APP_NAME }) }
}

export default function Page() {
  return <LoginPage />
}
