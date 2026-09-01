import { LoginPage } from '@/components/auth/login-page'
import { APP_NAME } from '@/lib/branding'

export const metadata = {
  title: `Вход — ${APP_NAME}`,
}

export default function Page() {
  return <LoginPage />
}
