'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { KeyRound, LogOut, Plug, Pencil, ShieldCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserAvatar } from '@/components/shared/bits'
import { logoutRequest } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import type { SessionUserDto } from '@/lib/types'
import { ChangePasswordDialog } from '@/components/auth/change-password-dialog'
import { ApiTokensDialog } from '@/components/auth/api-tokens-dialog'
import { ProfileEditDialog } from '@/components/auth/profile-edit-dialog'

/** Меню аккаунта: профиль, пароль, токены, выход */
export function AccountMenu({ user }: { user: SessionUserDto }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [profileOpen, setProfileOpen] = useState(false)
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [apiTokensOpen, setApiTokensOpen] = useState(false)

  async function logout() {
    await logoutRequest()
    qc.clear()
    router.replace('/login')
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="gap-1.5 pl-1.5 pr-3"
            aria-label={`Аккаунт: ${user.name}`}
          >
            <UserAvatar user={user} size={24} />
            <span className="hidden max-w-[140px] truncate sm:inline">{user.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <button
            type="button"
            className="w-full rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent"
            onClick={() => setProfileOpen(true)}
          >
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            {user.isAdmin && (
              <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                <ShieldCheck className="h-3 w-3" /> администратор
              </p>
            )}
          </button>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem onSelect={() => setProfileOpen(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> Редактировать профиль
          </DropdownMenuItem>
          {user.isAdmin && (
            <DropdownMenuItem asChild className="gap-2">
              <Link href="/admin/users">
                <Users className="h-4 w-4" /> Пользователи
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setChangePwOpen(true)} className="gap-2">
            <KeyRound className="h-4 w-4" /> Сменить пароль
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setApiTokensOpen(true)} className="gap-2">
            <Plug className="h-4 w-4" /> API-токены
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem onSelect={logout} className="gap-2 text-destructive focus:text-destructive">
            <LogOut className="h-4 w-4" /> Выйти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileEditDialog user={user} open={profileOpen} onOpenChange={setProfileOpen} />
      <ChangePasswordDialog open={changePwOpen} onOpenChange={setChangePwOpen} />
      <ApiTokensDialog open={apiTokensOpen} onOpenChange={setApiTokensOpen} />
    </>
  )
}
