'use client'

import { useEffect, useState } from 'react'
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
      toast.error('Введите текущий пароль')
      return
    }
    if (next.length < 6) {
      toast.error('Новый пароль: минимум 6 символов')
      return
    }
    if (next !== next2) {
      toast.error('Новые пароли не совпадают')
      return
    }
    mut.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.success('Пароль изменён')
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
          <DialogTitle>Сменить пароль</DialogTitle>
          <DialogDescription>
            {hasPassword
              ? 'Введите текущий пароль и новый.'
              : 'У вашего аккаунта пока нет пароля — просто задайте новый.'}
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
              <Label htmlFor="cp-current">Текущий пароль</Label>
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
            <Label htmlFor="cp-next">Новый пароль</Label>
            <Input
              id="cp-next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="минимум 6 символов"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-next2">Повторите новый пароль</Label>
            <Input
              id="cp-next2"
              type="password"
              value={next2}
              onChange={(e) => setNext2(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" className="gap-1.5" disabled={mut.isPending}>
              <KeyRound className="h-4 w-4" />
              {mut.isPending ? 'Сохраняю…' : 'Сменить пароль'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
