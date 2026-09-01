'use client'

import { useEffect, useState } from 'react'
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
import { timeAgo } from '@/lib/format'

export function ApiTokensDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
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
    if (await copyToClipboard(token)) toast.success('Токен скопирован')
    else toast.error('Не удалось скопировать')
  }

  function createToken() {
    const n = name.trim()
    if (!n) {
      toast.error('Укажите название')
      return
    }
    create.mutate(
      { name: n },
      {
        onSuccess: (row) => {
          setName('')
          setRevealed({ name: row.name, token: row.token })
          setVisible((prev) => ({ ...prev, [row.id]: row.token }))
          toast.success('Токен создан')
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
          <DialogTitle>API-токены</DialogTitle>
          <DialogDescription>
            Для MCP-сервера и скриптов. Токен можно посмотреть и скопировать снова в любое время.
          </DialogDescription>
        </DialogHeader>

        {revealed && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">Новый токен «{revealed.name}»</p>
            <code className="block break-all rounded bg-background p-2 text-xs">{revealed.token}</code>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copyToken(revealed.token)}>
              <Copy className="h-3.5 w-3.5" /> Копировать
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="token-name">Новый токен</Label>
          <div className="flex gap-2">
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="MCP Cursor"
              onKeyDown={(e) => e.key === 'Enter' && createToken()}
            />
            <Button onClick={createToken} disabled={create.isPending} className="shrink-0 gap-1">
              <Plus className="h-4 w-4" /> Создать
            </Button>
          </div>
        </div>

        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
          {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {!isLoading && tokens.length === 0 && (
            <p className="text-sm text-muted-foreground">Токенов ещё нет</p>
          )}
          {tokens.map((t) => (
            <div key={t.id} className="rounded-md px-2 py-1.5 hover:bg-muted/60">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.lastUsedAt ? `использован ${timeAgo(t.lastUsedAt)}` : 'ещё не использовался'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    aria-label={visible[t.id] ? `Скрыть токен ${t.name}` : `Показать токен ${t.name}`}
                    disabled={reveal.isPending && reveal.variables === t.id}
                    onClick={() => toggleReveal(t.id)}
                  >
                    {visible[t.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Удалить токен ${t.name}`}
                    onClick={() => {
                      if (confirm(`Отозвать токен «${t.name}»?`)) {
                        del.mutate(t.id, {
                          onSuccess: () => {
                            setVisible((prev) => {
                              const next = { ...prev }
                              delete next[t.id]
                              return next
                            })
                          },
                          onError: (e) => toast.error(e.message),
                        })
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {visible[t.id] && (
                <div className="mt-2 space-y-1.5">
                  <code className="block break-all rounded bg-background p-2 text-xs">{visible[t.id]}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => copyToken(visible[t.id])}
                  >
                    <Copy className="h-3 w-3" /> Копировать
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
