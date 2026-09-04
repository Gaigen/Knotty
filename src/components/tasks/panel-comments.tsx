'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MarkdownView } from '@/components/shared/markdown'
import { UserAvatar } from '@/components/shared/bits'
import {
  CtxBackdrop, CtxContainer, CtxItem, CtxSeparator, type CtxPos,
} from '@/components/shared/context-menu-helpers'
import type { CommentDto, TaskFullDto } from '@/lib/types'
import { useAddComment, useDeleteComment, useUpdateComment } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Комментарии (ФТ-2.7): Markdown, Enter — отправить, Shift+Enter — перенос */
export function PanelComments({ task }: { task: TaskFullDto; onPatch: (body: Record<string, unknown>) => Promise<unknown> }) {
  const add = useAddComment()
  const update = useUpdateComment()
  const del = useDeleteComment()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [ctxMenu, setCtxMenu] = useState<{ pos: CtxPos; comment: CommentDto } | null>(null)

  useEffect(() => {
    // прокрутка к последнему комментарию при открытии
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [task.id])

  function submit() {
    const text = draft.trim()
    if (!text) return
    add.mutate(
      { taskId: task.id, projectId: task.projectId, body: text },
      {
        onSuccess: () => setDraft(''),
        onError: (e) => toast.error(e.message),
      }
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={listRef} className="custom-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {task.comments.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Комментариев пока нет. Обсудите задачу — история сохранится.
          </p>
        )}
        {task.comments.map((c) => {
          const editing = editingId === c.id
          return (
            <div
              key={c.id}
              className="group flex gap-2.5"
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu({ pos: { x: e.clientX, y: e.clientY }, comment: c })
              }}
            >
              <UserAvatar user={c.author} size={28} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.author.name}</span>
                  <span className="text-xs text-muted-foreground" title={new Date(c.createdAt).toLocaleString('ru-RU')}>
                    {timeAgo(c.createdAt)}
                  </span>
                  <span className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        setEditingId(c.id)
                        setEditDraft(c.body)
                      }}
                      aria-label="Редактировать комментарий"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      onClick={() => {
                        if (confirm('Удалить комментарий?')) {
                          del.mutate({ id: c.id, taskId: task.id, projectId: task.projectId }, { onError: (e) => toast.error(e.message) })
                        }
                      }}
                      aria-label="Удалить комментарий"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
                {editing ? (
                  <div className="mt-1 space-y-1.5">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      className="w-full resize-y rounded-lg border bg-background p-2 text-sm outline-none ring-ring focus:ring-1"
                      autoFocus
                    />
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          const text = editDraft.trim()
                          if (!text) return
                          update.mutate(
                            { id: c.id, taskId: task.id, projectId: task.projectId, body: text },
                            { onSuccess: () => setEditingId(null), onError: (e) => toast.error(e.message) }
                          )
                        }}
                      >
                        Сохранить
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={cn('mt-0.5 rounded-lg rounded-tl-none border bg-muted/40 px-3 py-2')}>
                    <MarkdownView source={c.body} compact />
                    {c.updatedAt !== c.createdAt && (
                      <span className="mt-1 block text-[11px] text-muted-foreground">изменён {timeAgo(c.updatedAt)}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* композер */}
      <div className="shrink-0 border-t bg-background p-3">
        <div className="relative">
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={2}
            placeholder="Комментарий (Markdown). Enter — отправить, Shift+Enter — перенос"
            className="w-full resize-y rounded-lg border bg-background p-2.5 pr-8 text-sm outline-none ring-ring placeholder:text-muted-foreground/60 focus:ring-1"
            aria-label="Новый комментарий"
          />
          {draft && (
            <button
              type="button"
              className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:text-foreground"
              onClick={() => setDraft('')}
              aria-label="Очистить"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Поддерживается Markdown</span>
          <Button size="sm" className="h-7 text-xs" disabled={!draft.trim() || add.isPending} onClick={submit}>
            {add.isPending ? 'Отправка…' : 'Отправить'}
          </Button>
        </div>
      </div>

      {/* Контекстное меню комментария по ПКМ */}
      {ctxMenu && (
        <>
          <CtxBackdrop onClose={() => setCtxMenu(null)} />
          <CtxContainer pos={ctxMenu.pos} minWidth={220}>
            <CtxItem
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Редактировать"
              onClick={() => {
                const c = ctxMenu.comment
                setCtxMenu(null)
                setEditingId(c.id)
                setEditDraft(c.body)
              }}
            />
            <CtxSeparator />
            <CtxItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Удалить"
              danger
              onClick={() => {
                const c = ctxMenu.comment
                setCtxMenu(null)
                if (confirm('Удалить комментарий?')) {
                  del.mutate({ id: c.id, taskId: task.id, projectId: task.projectId }, { onError: (e) => toast.error(e.message) })
                }
              }}
            />
          </CtxContainer>
        </>
      )}
    </div>
  )
}
