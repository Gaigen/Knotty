'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, EyeOff, KeyRound, Loader2, LogIn, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { KnottyMark } from '@/components/shared/knotty-mark'
import { apiFetch, bootstrapRequest, loginRequest } from '@/lib/api'
import { APP_NAME, APP_TAGLINE } from '@/lib/branding'
import type { SessionUserDto } from '@/lib/types'

type Mode = 'checking' | 'login' | 'setup'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [mode, setMode] = useState<Mode>('checking')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // если уже залогинен — сразу в приложение
        const session = await apiFetch<{ user: unknown }>('/api/auth/session')
        if (cancelled) return
        if (session.user) {
          router.replace('/')
          return
        }
        const boot = await apiFetch<{ needed: boolean }>('/api/auth/bootstrap')
        if (cancelled) return
        setMode(boot.needed ? 'setup' : 'login')
      } catch {
        if (!cancelled) setMode('login')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  /** Обновить кеш сессии ДО перехода — иначе AuthGate возьмёт старый {user: null}
   *  из react-query (staleTime 60с) и отправит обратно на /login */
  const settleSession = (user: SessionUserDto) => {
    qc.setQueryData(['me'], { user })
  }

  const submitLogin = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      toast.error('Некорректный email')
      return
    }
    if (!password) {
      toast.error('Введите пароль')
      return
    }
    setPending(true)
    try {
      const user = await loginRequest(email.trim().toLowerCase(), password)
      settleSession(user)
      router.replace('/')
    } catch (e) {
      toast.error((e as Error).message)
      setPending(false)
    }
  }

  const submitSetup = async () => {
    if (!name.trim()) {
      toast.error('Имя обязательно')
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      toast.error('Некорректный email')
      return
    }
    if (password.length < 6) {
      toast.error('Пароль: минимум 6 символов')
      return
    }
    if (password !== password2) {
      toast.error('Пароли не совпадают')
      return
    }
    setPending(true)
    try {
      const user = await bootstrapRequest(name.trim(), email.trim().toLowerCase(), password)
      settleSession(user)
      toast.success(`Добро пожаловать, ${name.trim()}! Аккаунт администратора создан.`)
      router.replace('/')
    } catch (e) {
      toast.error((e as Error).message)
      setPending(false)
    }
  }

  const isSetup = mode === 'setup'

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <KnottyMark className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{APP_NAME}</h1>
              <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
            </div>
          </div>

          <div className="rounded-xl border bg-background p-6 shadow-sm">
            {mode === 'checking' ? (
              <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-sm">Проверка сессии…</p>
              </div>
            ) : isSetup ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Первичная настройка</h2>
                </div>
                <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                  В системе ещё нет ни одного аккаунта. Создайте аккаунт{' '}
                  <b>администратора</b> — он сможет добавлять остальных участников команды
                  и управлять их доступом.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    submitSetup()
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="login-name">Имя</Label>
                    <Input
                      id="login-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Иван Петров"
                      autoFocus
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">Пароль</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="минимум 6 символов"
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password2">Повторите пароль</Label>
                    <Input
                      id="login-password2"
                      type={showPassword ? 'text' : 'password'}
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full gap-1.5" disabled={pending}>
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    {pending ? 'Создаю аккаунт…' : 'Создать администратора'}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <LogIn className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Вход</h2>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    submitLogin()
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">Пароль</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full gap-1.5" disabled={pending}>
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogIn className="h-4 w-4" />
                    )}
                    {pending ? 'Вхожу…' : 'Войти'}
                  </Button>
                </form>
              </>
            )}
          </div>

          {mode === 'login' && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Забыли пароль или нет аккаунта? Попросите администратора —{' '}
              он выдаст доступ в разделе «Пользователи».
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
