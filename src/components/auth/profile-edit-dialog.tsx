'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpdateMyProfile } from '@/lib/api'
import type { SessionUserDto } from '@/lib/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ProfileEditDialog({
  user,
  open,
  onOpenChange,
}: {
  user: SessionUserDto
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const t = useTranslations('auth')
  const tc = useTranslations('common')
  const update = useUpdateMyProfile()
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '')

  useEffect(() => {
    if (open) {
      setName(user.name)
      setEmail(user.email)
      setAvatarUrl(user.avatarUrl ?? '')
    }
  }, [open, user])

  function submit() {
    const trimmedName = name.trim()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedName) {
      toast.error(t('nameRequired'))
      return
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      toast.error(t('invalidEmail'))
      return
    }
    if (avatarUrl.trim() && !/^https?:\/\//i.test(avatarUrl.trim())) {
      toast.error(t('avatarUrlInvalid'))
      return
    }
    update.mutate(
      {
        name: trimmedName,
        email: trimmedEmail,
        avatarUrl: avatarUrl.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(t('profileUpdated'))
          onOpenChange(false)
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('profileEditTitle')}</DialogTitle>
          <DialogDescription>{t('profileEditDesc')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">{t('name')}</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">{t('email')}</Label>
            <Input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-avatar">{t('avatarLabelOptional')}</Label>
            <Input
              id="profile-avatar"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? tc('saving') : tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
