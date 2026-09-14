import en from '../../../messages/en.json'
import ru from '../../../messages/ru.json'

type ApiClientKey = keyof typeof ru.apiClient

function resolveClientLocale(): 'ru' | 'en' {
  if (typeof document === 'undefined') return 'en'
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)
  return match?.[1] === 'ru' ? 'ru' : 'en'
}

export function clientApiMessage(key: ApiClientKey, values?: Record<string, string | number>): string {
  const locale = resolveClientLocale()
  const msgs = locale === 'en' ? en.apiClient : ru.apiClient
  let msg: string = msgs[key]
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      msg = msg.replace(`{${k}}`, String(v))
    }
  }
  return msg
}
