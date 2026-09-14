import type messages from '../messages/ru.json'

declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages
    Locale: 'en' | 'ru'
  }
}
