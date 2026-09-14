'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { KeyRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useChangeMyPassword } from '@/lib/api'

export function ChangePasswordDialog({
  open,
  onOpenChange,
  hasPassword,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** false — у аккаунта ещё нет пароля (наследие сид-данных), старый вводить не нужно */
  hasPassword: boolean
}) {
  const t = useTranslations('auth')
  const tc = useTranslations('common')
  const mut = useChangeMyPassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [next2, setNext2] = useState('')

  useEffect(() => {
    if (open) {
      // сброс полей при открытии — внешний триггер
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrent('')
      setNext('')
      setNext2('')
    }
  }, [open])

  const submit = () => {
    if (hasPassword && !current) {
      toast.error(t('currentPasswordRequired'))
      return
    }
    if (next.length < 6) {
      toast.error(t('newPasswordMin'))
      return
    }
    if (next !== next2) {
      toast.error(t('newPasswordMismatch'))
      return
    }
    mut.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.success(t('passwordChanged'))
          onOpenChange(false)
        },
        onError: (e: Error) => toast.error(e.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('changePasswordTitle')}</DialogTitle>
          <DialogDescription>
            {hasPassword ? t('changePasswordDescHasPassword') : t('changePasswordDescNoPassword')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="space-y-3"
        >
          {hasPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-current">{t('currentPassword')}</Label>
              <Input
                id="cp-current"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cp-next">{t('newPassword')}</Label>
            <Input
              id="cp-next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder={t('passwordMinPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-next2">{t('repeatNewPassword')}</Label>
            <Input
              id="cp-next2"
              type="password"
              value={next2}
              onChange={(e) => setNext2(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="gap-1.5" disabled={mut.isPending}>
              <KeyRound className="h-4 w-4" />
              {mut.isPending ? tc('saving') : t('changePasswordSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
