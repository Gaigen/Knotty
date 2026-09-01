'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Eye, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react'
import { FileMimeIcon } from '@/components/shared/bits'
import { AttachmentViewer } from '@/components/shared/attachment-viewer'
import { Button } from '@/components/ui/button'
import {
  CtxBackdrop, CtxContainer, CtxItem, type CtxPos,
} from '@/components/shared/context-menu-helpers'
import { attachmentFileUrl, useDeleteAttachment, useUploadAttachments } from '@/lib/api'
import { formatSize, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AttachmentDto, TaskFullDto } from '@/lib/types'

/** Вложения (ФТ-5.2): drag-n-drop, мультизагрузка, превью картинок, полноэкранный просмотр */
export function PanelAttachments({ task, onPatch }: { task: TaskFullDto; onPatch: (body: Record<string, unknown>) => Promise<unknown> }) {
  const upload = useUploadAttachments()
  const del = useDeleteAttachment()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [viewer, setViewer] = useState<AttachmentDto | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ pos: CtxPos; att: AttachmentDto } | null>(null)

  function uploadFiles(files: File[] | FileList) {
    const arr = Array.from(files)
    if (arr.length === 0) return
    upload.mutate(
      { taskId: task.id, projectId: task.projectId, files: arr },
      {
        onSuccess: (created) => toast.success(created.length > 1 ? `Загружено файлов: ${created.length}` : `Файл «${created[0]?.fileName}» загружен`),
        onError: (e) => toast.error(e.message),
      }
    )
  }

  function insertIntoDescription(att: AttachmentDto) {
    // fix: вставляем Markdown-ссылку прямо в конец описания (ФТ-2.7), а не в буфер
    const md = `![${att.fileName}](attachment:${att.id})`
    const next = task.description ? `${task.description.replace(/\s+$/, '')}\n\n${md}\n` : `${md}\n`
    onPatch({ description: next })
      .then(() => toast.success(`«${att.fileName}» вставлено в конец описания`))
      .catch(() => {})
  }

  const images = task.attachments.filter((a) => a.mime.startsWith('image/'))

  return (
    <div
      className="p-4"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        uploadFiles(e.dataTransfer.files)
      }}
    >
      {/* зона загрузки */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed p-6 text-center transition-colors',
          dragOver ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/30' : 'hover:bg-muted/50'
        )}
        aria-label="Загрузить файлы"
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium">Перетащите файлы или нажмите</span>
        <span className="text-xs text-muted-foreground">до 10 МБ на файл · не более 50 МБ на задачу</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) uploadFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {upload.isPending && (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Paperclip className="h-4 w-4 animate-pulse" /> Загрузка…
        </div>
      )}

      {/* превью картинок */}
      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {images.map((a) => (
            <button
              key={a.id}
              type="button"
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              onClick={() => setViewer(a)}
              aria-label={`Открыть ${a.fileName}`}
            >
              <img
                src={attachmentFileUrl(a.id, a.hasPreview)}
                alt={a.fileName}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* таблица файлов */}
      {task.attachments.length > 0 && (
        <ul className="mt-4 space-y-1">
          {task.attachments.map((a) => (
            <li
              key={a.id}
              className="group flex cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 transition-colors hover:bg-muted/40"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a, button')) return
                setViewer(a)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu({ pos: { x: e.clientX, y: e.clientY }, att: a })
              }}
            >
              <FileMimeIcon mime={a.mime} className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" title={a.fileName}>{a.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {formatSize(a.size)} · {timeAgo(a.createdAt)}
                </div>
              </div>
              <a
                href={`${attachmentFileUrl(a.id)}?download=1`}
                className="rounded p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
                aria-label={`Скачать ${a.fileName}`}
                download
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              {a.mime.startsWith('image/') && (
                <button
                  type="button"
                  onClick={() => insertIntoDescription(a)}
                  className="rounded p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  title="Скопировать Markdown для вставки в описание"
                  aria-label="Вставить в описание"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Удалить файл «${a.fileName}»?`)) {
                    del.mutate({ id: a.id, taskId: task.id, projectId: task.projectId }, { onError: (e) => toast.error(e.message) })
                  }
                }}
                className="rounded p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-destructive group-hover:opacity-100"
                aria-label={`Удалить ${a.fileName}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {task.attachments.length === 0 && !upload.isPending && (
        <p className="mt-4 text-center text-sm text-muted-foreground">Вложений пока нет</p>
      )}

      <AttachmentViewer item={viewer} onClose={() => setViewer(null)} />

      {/* Контекстное меню вложения по ПКМ */}
      {ctxMenu && (
        <>
          <CtxBackdrop onClose={() => setCtxMenu(null)} />
          <CtxContainer pos={ctxMenu.pos} minWidth={230}>
            <CtxItem
              icon={<Eye className="h-3.5 w-3.5" />}
              label="Открыть"
              onClick={() => {
                const a = ctxMenu.att
                setCtxMenu(null)
                setViewer(a)
              }}
            />
            <CtxItem
              icon={<Download className="h-3.5 w-3.5" />}
              label="Скачать"
              onClick={() => {
                const a = ctxMenu.att
                setCtxMenu(null)
                const link = document.createElement('a')
                link.href = `${attachmentFileUrl(a.id)}?download=1`
                link.download = a.fileName
                link.click()
              }}
            />
            {ctxMenu.att.mime.startsWith('image/') && (
              <CtxItem
                icon={<ImageIcon className="h-3.5 w-3.5" />}
                label="Вставить в описание"
                onClick={() => {
                  const a = ctxMenu.att
                  setCtxMenu(null)
                  insertIntoDescription(a)
                }}
              />
            )}
            <CtxItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Удалить…"
              danger
              onClick={() => {
                const a = ctxMenu.att
                setCtxMenu(null)
                if (confirm(`Удалить файл «${a.fileName}»?`)) {
                  del.mutate({ id: a.id, taskId: task.id, projectId: task.projectId }, { onError: (e) => toast.error(e.message) })
                }
              }}
            />
          </CtxContainer>
        </>
      )}
    </div>
  )
}
