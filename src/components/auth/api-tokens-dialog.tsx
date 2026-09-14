'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
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
import {
  copyToClipboard,
  useApiTokens,
  useCreateApiToken,
  useDeleteApiToken,
  useRevealApiToken,
} from '@/lib/api'
import { useFormatters } from '@/lib/i18n/use-formatters'

export function ApiTokensDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const t = useTranslations('auth')
  const tc = useTranslations('common')
  const { timeAgo } = useFormatters()
  const { data: tokens = [], isLoading } = useApiTokens()
  const create = useCreateApiToken()
  const del = useDeleteApiToken()
  const reveal = useRevealApiToken()
  const [name, setName] = useState('')
  const [revealed, setRevealed] = useState<{ name: string; token: string } | null>(null)
  const [visible, setVisible] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setName('')
      setRevealed(null)
      setVisible({})
    }
  }, [open])

  async function copyToken(token: string) {
    if (await copyToClipboard(token)) toast.success(t('tokenCopied'))
    else toast.error(tc('copyFailed'))
  }

  function createToken() {
    const n = name.trim()
    if (!n) {
      toast.error(t('tokenNameRequired'))
      return
    }
    create.mutate(
      { name: n },
      {
        onSuccess: (row) => {
          setName('')
          setRevealed({ name: row.name, token: row.token })
          setVisible((prev) => ({ ...prev, [row.id]: row.token }))
          toast.success(t('tokenCreated'))
        },
        onError: (e: Error) => toast.error(e.message),
      }
    )
  }

  function toggleReveal(id: string) {
    if (visible[id]) {
      setVisible((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      return
    }
    reveal.mutate(id, {
      onSuccess: (row) => {
        setVisible((prev) => ({ ...prev, [id]: row.token }))
      },
      onError: (e: Error) => toast.error(e.message),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('apiTokensTitle')}</DialogTitle>
          <DialogDescription>{t('apiTokensDesc')}</DialogDescription>
        </DialogHeader>

        {revealed && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">{t('newTokenNamed', { name: revealed.name })}</p>
            <code className="block break-all rounded bg-background p-2 text-xs">{revealed.token}</code>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copyToken(revealed.token)}>
              <Copy className="h-3.5 w-3.5" /> {tc('copy')}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="token-name">{t('newTokenLabel')}</Label>
          <div className="flex gap-2">
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('tokenNamePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && createToken()}
            />
            <Button onClick={createToken} disabled={create.isPending} className="shrink-0 gap-1">
              <Plus className="h-4 w-4" /> {t('createToken')}
            </Button>
          </div>
        </div>

        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
          {isLoading && <p className="text-sm text-muted-foreground">{tc('loading')}</p>}
          {!isLoading && tokens.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noTokens')}</p>
          )}
          {tokens.map((tok) => (
            <div key={tok.id} className="rounded-md px-2 py-1.5 hover:bg-muted/60">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{tok.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tok.lastUsedAt ? t('tokenUsedAt', { time: timeAgo(tok.lastUsedAt) }) : t('tokenNeverUsed')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    aria-label={visible[tok.id] ? t('hideTokenAria', { name: tok.name }) : t('showTokenAria', { name: tok.name })}
                    disabled={reveal.isPending && reveal.variables === tok.id}
                    onClick={() => toggleReveal(tok.id)}
                  >
                    {visible[tok.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={t('deleteTokenAria', { name: tok.name })}
                    onClick={() => {
                      if (confirm(t('revokeTokenConfirm', { name: tok.name }))) {
                        del.mutate(tok.id, {
                          onSuccess: () => {
                            setVisible((prev) => {
                              const next = { ...prev }
                              delete next[tok.id]
                              return next
                            })
                          },
                          onError: (e: Error) => toast.error(e.message),
                        })
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {visible[tok.id] && (
                <div className="mt-2 space-y-1.5">
                  <code className="block break-all rounded bg-background p-2 text-xs">{visible[tok.id]}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => copyToken(visible[tok.id])}
                  >
                    <Copy className="h-3 w-3" /> {tc('copy')}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
