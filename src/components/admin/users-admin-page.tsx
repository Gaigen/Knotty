'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Mail, Pencil, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useMe } from '@/lib/api'
import { UserAvatar } from '@/components/shared/bits'
import { useFormatters } from '@/lib/i18n/use-formatters'
import { cn } from '@/lib/utils'
import type { UserDto } from '@/lib/types'

type UserRow = UserDto & {
  createdAt: string
  assignedTasksCount: number
  isAdmin: boolean
  hasPassword: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface UserFormValue {
  name: string
  email: string
  avatarUrl: string
  password: string
  isAdmin: boolean
}

function validateForm(
  v: UserFormValue,
  isEdit: boolean,
  t: ReturnType<typeof useTranslations<'admin'>>,
  ta: ReturnType<typeof useTranslations<'auth'>>
): string | null {
  if (!v.name.trim()) return ta('nameRequired')
  if (v.name.trim().length > 80) return t('nameTooLong')
  if (!EMAIL_RE.test(v.email.trim())) return ta('invalidEmail')
  if (v.avatarUrl.trim() && !/^https?:\/\//i.test(v.avatarUrl.trim())) {
    return ta('avatarUrlInvalid')
  }
  if (!isEdit && v.password.length < 6) return ta('passwordMin')
  if (v.password !== '' && v.password.length < 6) return ta('passwordMin')
  return null
}

/** Диалог создания/редактирования пользователя */
function UserFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  currentUserId,
  onSubmit,
  pending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'create' | 'edit'
  initial?: UserFormValue | null
  /** в edit-режиме: редактируем сами себя → чекбокс админа заблокирован */
  currentUserId?: string
  initialId?: string
  onSubmit: (v: UserFormValue) => void
  pending: boolean
}) {
  const t = useTranslations('admin')
  const ta = useTranslations('auth')
  const tc = useTranslations('common')
  const [form, setForm] = useState<UserFormValue>({
    name: '',
    email: '',
    avatarUrl: '',
    password: '',
    isAdmin: false,
  })

  useEffect(() => {
    if (open) {
      // сброс полей формы при открытии диалога — внешний триггер, нужен одноразовый sync
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(
        initial ?? { name: '', email: '', avatarUrl: '', password: '', isAdmin: false }
      )
    }
  }, [open, initial])

  const isEdit = mode === 'edit'
  const set = (patch: Partial<UserFormValue>) => setForm((f) => ({ ...f, ...patch }))

  const submit = () => {
    const err = validateForm(form, isEdit, t, ta)
    if (err) {
      toast.error(err)
      return
    }
    onSubmit({ ...form, name: form.name.trim(), email: form.email.trim().toLowerCase() })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('formEditTitle') : t('formCreateTitle')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('formEditDesc') : t('formCreateDesc')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="user-name">{ta('name')}</Label>
            <Input
              id="user-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={ta('namePlaceholder')}
              autoFocus
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-email">{ta('email')}</Label>
            <Input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
              placeholder="ivan@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-password">
              {isEdit ? t('passwordEdit') : t('passwordCreate')}
            </Label>
            <Input
              id="user-password"
              type="password"
              value={form.password}
              onChange={(e) => set({ password: e.target.value })}
              placeholder={isEdit ? t('passwordEditPlaceholder') : ta('passwordMinPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-avatar">{t('avatarLabel')}</Label>
            <Input
              id="user-avatar"
              value={form.avatarUrl}
              onChange={(e) => set({ avatarUrl: e.target.value })}
              placeholder={t('avatarPlaceholder')}
            />
          </div>
          <label
            htmlFor="user-admin"
            className="flex items-start gap-2 rounded-lg border p-3 text-sm"
          >
            <Checkbox
              id="user-admin"
              checked={form.isAdmin}
              onCheckedChange={(v) => set({ isAdmin: v === true })}
            />
            <span className="leading-snug">
              {t('adminLabel')}
              <span className="block text-xs text-muted-foreground">
                {t('adminHint')}
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (isEdit ? tc('saving') : t('creating')) : isEdit ? tc('save') : t('createUser')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UsersAdminPage() {
  const router = useRouter()
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const { timeAgo } = useFormatters()
  const { data: users = [], isLoading } = useUsers()
  const { data: meData, isLoading: meLoading } = useMe()
  const me = meData?.user ?? null
  const createMut = useCreateUser()
  const updateMut = useUpdateUser()
  const deleteMut = useDeleteUser()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)

  useEffect(() => {
    if (!meLoading && meData && !meData.user) router.replace('/login')
  }, [meLoading, meData, router])

  const rows = users as UserRow[]

  const onCreate = (v: UserFormValue) => {
    createMut.mutate(
      {
        name: v.name,
        email: v.email,
        password: v.password,
        isAdmin: v.isAdmin,
        ...(v.avatarUrl ? { avatarUrl: v.avatarUrl } : {}),
      },
      {
        onSuccess: () => {
          toast.success(t('userCreated', { name: v.name }))
          setCreateOpen(false)
        },
        onError: (e: Error) => toast.error(e.message),
      }
    )
  }

  const onUpdate = (v: UserFormValue) => {
    if (!editTarget) return
    updateMut.mutate(
      {
        id: editTarget.id,
        body: {
          name: v.name,
          email: v.email,
          avatarUrl: v.avatarUrl || null,
          ...(v.password ? { password: v.password } : {}),
          isAdmin: v.isAdmin,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('userUpdated'))
          setEditTarget(null)
        },
        onError: (e: Error) => toast.error(e.message),
      }
    )
  }

  const onDelete = () => {
    if (!deleteTarget) return
    const { id, name } = deleteTarget
    deleteMut.mutate(
      { id },
      {
        onSuccess: (res) => {
          const n = res.releasedTasks ?? 0
          toast.success(
            n > 0
              ? t('deleteSuccessWithTasks', { name, count: n })
              : t('deleteSuccess', { name })
          )
          setDeleteTarget(null)
        },
        onError: (e: Error) => toast.error(e.message),
      }
    )
  }

  // --- guard: ждём сессию / только для админов ---
  if (meLoading || !meData) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {tc('loading')}
      </div>
    )
  }
  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {t('redirecting')}
      </div>
    )
  }
  if (!me.isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 px-4 text-center">
        <ShieldCheck className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t('noAccessTitle')}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t('noAccessDescription')}
        </p>
        <Button variant="outline" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4" /> {t('backToProjects')}
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/')}
            className="gap-1.5 text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t('backToProjects')}
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">{t('title')}</h1>
              <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>
          <div className="flex-1" />
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" /> {t('add')}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {isLoading ? (
          <div className="py-20 text-center text-sm text-muted-foreground">{tc('loading')}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border bg-background p-12 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {t('emptyDescription')}
            </p>
            <Button className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-4 w-4" /> {t('addUser')}
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">{t('colUser')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('colEmail')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('colAccess')}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t('colTasks')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('colCreated')}</th>
                  <th className="w-10 px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b last:border-0 transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar user={u} size={28} />
                        <span className="font-medium">{u.name}</span>
                        {u.isAdmin && (
                          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                            <ShieldCheck className="h-3 w-3" /> {t('adminBadge')}
                          </span>
                        )}
                        {me.id === u.id && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {t('youBadge')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        <span className="font-mono text-xs">{u.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.hasPassword ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">
                          {t('passwordSet')}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          {t('noPassword')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span
                        className={cn(
                          'inline-flex min-w-[24px] justify-center rounded px-1.5 py-0.5 text-xs',
                          (u.assignedTasksCount ?? 0) > 0
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground'
                        )}
                      >
                        {u.assignedTasksCount ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground" title={u.createdAt}>
                      {timeAgo(u.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={t('actionsFor', { name: u.name })}
                          >
                            <span className="text-lg leading-none">⋯</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onSelect={() => setEditTarget(u)}
                            className="gap-2"
                          >
                            <Pencil className="h-4 w-4" /> {t('editUser')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setDeleteTarget(u)}
                            className="gap-2 text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" /> {t('deleteEllipsis')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          {t('deleteHint')}
        </p>
      </main>

      <UserFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSubmit={onCreate}
        pending={createMut.isPending}
      />

      <UserFormDialog
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        mode="edit"
        currentUserId={me.id}
        initial={
          editTarget
            ? {
                name: editTarget.name,
                email: editTarget.email,
                avatarUrl: editTarget.avatarUrl ?? '',
                password: '',
                isAdmin: !!editTarget.isAdmin,
              }
            : null
        }
        onSubmit={onUpdate}
        pending={updateMut.isPending}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget &&
                t.rich('deleteDescription', {
                  name: deleteTarget.name,
                  email: deleteTarget.email,
                  taskCount:
                    (deleteTarget.assignedTasksCount ?? 0) > 0
                      ? t('deleteDescriptionTaskCount', {
                          count: deleteTarget.assignedTasksCount ?? 0,
                        })
                      : '',
                  b: (chunks) => <b>{chunks}</b>,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? t('deleting') : tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
