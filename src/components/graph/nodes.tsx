'use client'

import { useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { GripHorizontal, Maximize2, MessageSquare, Paperclip, Pencil, SquareArrowOutUpRight, Trash2 } from 'lucide-react'
import { MarkdownView, isMarkdownCheckboxInteraction } from '@/components/shared/markdown'
import { TypeIcon, UserAvatar, PriorityIcon, LabelChip } from '@/components/shared/bits'
import {
  AttachmentGraphPreview,
  attachmentNodeKeepAspect,
} from '@/components/shared/attachment-graph-preview'
import { fitGraphAttachmentDimensions, resolveAttachmentPreviewKind } from '@/lib/attachment-preview'
import { cn } from '@/lib/utils'
import type { GraphTaskSnapshot, UserDto } from '@/lib/types'

const RESIZER_LINE = { borderWidth: 0 }
const RESIZER_HANDLE = {
  width: 9,
  height: 9,
  borderRadius: 3,
  border: '2px solid #ffffff',
  boxShadow: '0 1px 3px rgba(0,0,0,.4)',
  background: '#0f766e',
  zIndex: 50,
}
// рамка поверх ноды скрыта — ресайз только за 4 угловые ручки (по фидбеку)
const RESIZER_LINE_CLS = 'hidden'
// крупный хэндл виден при hover/выделении (CSS) — целиться намного проще
const HANDLE_CLS =
  '!z-50 !h-3 !w-3 !rounded-full !border-2 !border-white !bg-teal-600 shadow-md pointer-events-auto'

export interface TaskNodeData extends Record<string, unknown> {
  snapshot: GraphTaskSnapshot
  assignee?: UserDto | null
  dimmed?: boolean
  onResize?: (id: string, w?: number, h?: number) => void
  onOpenTask?: (nodeId: string, taskId: string) => void
  onDeleteNode?: (nodeId: string, label: string) => void
}

export interface NoteNodeData extends Record<string, unknown> {
  text: string
  dimmed?: boolean
  onSave?: (id: string, text: string) => void
  /** открыть заметку в большом окне предпросмотра */
  onExpand?: (id: string, text: string) => void
  onResize?: (id: string, w?: number, h?: number) => void
  onDeleteNode?: (nodeId: string, label: string) => void
}

export interface AttachmentNodeData extends Record<string, unknown> {
  attachment: { id: string; fileName: string; mime: string; hasPreview: boolean }
  dimmed?: boolean
  /** полноэкранный просмотр картинки / открытие файла */
  onOpenPreview?: (att: { id: string; fileName: string; mime: string; hasPreview: boolean }) => void
  onResize?: (id: string, w?: number, h?: number) => void
  onDeleteNode?: (nodeId: string, label: string) => void
  /** true — подогнать размер ноды по контенту при первой загрузке медиа */
  autoFitSize?: boolean
  onAutoFitSize?: (id: string, naturalW: number, naturalH: number) => void
}

/** Кнопка плавающего тулбара ноды */
function TBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        'rounded-md p-1.5 transition-colors',
        danger
          ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

/** Нода-задача (ФТ-3.2). Тулбар при выделении, ресайз за углы, хэндлы на hover. */
export function TaskNodeCard({ data, selected, id }: NodeProps) {
  const d = data as TaskNodeData
  const s = d.snapshot
  return (
    <div
      className={cn(
        'relative flex h-full w-full min-w-[180px] flex-col rounded-xl border-2 bg-card p-2.5 shadow-md transition-opacity',
        s.blocked ? 'border-red-500' : 'border-transparent',
        d.dimmed && 'opacity-25',
        selected && 'ring-2 ring-teal-500/60'
      )}
      style={!s.blocked ? { borderColor: s.statusColor } : undefined}
    >
      <NodeToolbar isVisible={selected} position={Position.Top} offset={10} className="nodrag nopan">
        <div className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-lg">
          <TBtn title="Открыть задачу" onClick={() => d.onOpenTask?.(id, s.id)}>
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          </TBtn>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          <TBtn title="Удалить ноду с канваса" danger onClick={() => d.onDeleteNode?.(id, 'ноду (задача останется в проекте)')}>
            <Trash2 className="h-3.5 w-3.5" />
          </TBtn>
        </div>
      </NodeToolbar>

      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={84}
        color="#0f766e"
        lineStyle={RESIZER_LINE}
        lineClassName={RESIZER_LINE_CLS}
        handleStyle={RESIZER_HANDLE}
        onResizeEnd={(_, params) => d.onResize?.(id, params.width, params.height)}
      />
      <Handle type="target" position={Position.Left} className={HANDLE_CLS} />

      {/* шапка: тип, ключ, статус */}
      <div className="flex items-center gap-1.5">
        <TypeIcon type={s.type} className="h-4 w-4" />
        <span className="font-mono text-[11px] text-muted-foreground">{s.key}</span>
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: `${s.statusColor}1f`, color: s.statusColor }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.statusColor }} />
          {s.statusName}
        </span>
      </div>

      {/* название: сколько влезло в высоту ноды — столько видно */}
      <p className="mt-1 min-h-0 flex-1 overflow-hidden text-[13px] font-medium leading-snug">{s.title}</p>

      {s.labels.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 overflow-hidden">
          {s.labels.slice(0, 4).map((l) => (
            <LabelChip key={l} label={l} />
          ))}
          {s.labels.length > 4 && <span className="text-[10px] text-muted-foreground">+{s.labels.length - 4}</span>}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-2">
        <PriorityIcon priority={s.priority} />
        {s.commentCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <MessageSquare className="h-3 w-3" /> {s.commentCount}
          </span>
        )}
        {s.attachmentCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground" title={`${s.attachmentCount} вложений`}>
            <Paperclip className="h-3 w-3" /> {s.attachmentCount}
          </span>
        )}
        {d.assignee && (
          <span className="ml-auto">
            <UserAvatar user={d.assignee} size={18} />
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} className={HANDLE_CLS} />
    </div>
  )
}

/** Нода-заметка (ФТ-3.2): Markdown, редактирование двойным кликом, предпросмотр */
export function NoteNodeCard({ data, selected, id }: NodeProps) {
  const d = data as NoteNodeData
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(d.text)
  const [prevText, setPrevText] = useState(d.text)
  const ref = useRef<HTMLTextAreaElement>(null)

  // синхронизация черновика с внешним текстом (паттерн «правка состояния при рендере»)
  if (d.text !== prevText) {
    setPrevText(d.text)
    setDraft(d.text)
  }

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  function save() {
    setEditing(false)
    if (draft !== d.text) {
      d.onSave?.(id, draft)
    }
  }

  return (
    <div
      className={cn(
        'relative flex h-full w-full min-w-[200px] flex-col rounded-xl border-2 border-amber-300/70 bg-amber-50/90 p-3 shadow-md transition-opacity dark:border-amber-500/40 dark:bg-amber-950/30',
        d.dimmed && 'opacity-25',
        selected && 'ring-2 ring-amber-400/60'
      )}
      onDoubleClick={(e) => {
        if (isMarkdownCheckboxInteraction(e.target)) return
        setEditing(true)
      }}
    >
      {/* Только с полоски — перетаскивание; клики в текст/чекбоксы не выделяют ноду */}
      <div
        className="note-drag-handle -mx-3 -mt-3 mb-1 flex cursor-grab items-center justify-center gap-1 rounded-t-[10px] border-b border-amber-200/50 py-0.5 text-amber-800/50 active:cursor-grabbing"
        title="Перетащить заметку"
      >
        <GripHorizontal className="h-3 w-3" />
      </div>
      <NodeToolbar isVisible={selected} position={Position.Top} offset={10} className="nodrag nopan">
        <div className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-lg">
          <TBtn title="Редактировать" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn title="Предпросмотр" onClick={() => d.onExpand?.(id, d.text)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </TBtn>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          <TBtn title="Удалить заметку" danger onClick={() => d.onDeleteNode?.(id, 'заметку')}>
            <Trash2 className="h-3.5 w-3.5" />
          </TBtn>
        </div>
      </NodeToolbar>

      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={84}
        color="#d97706"
        lineStyle={RESIZER_LINE}
        lineClassName={RESIZER_LINE_CLS}
        handleStyle={{ ...RESIZER_HANDLE, background: '#d97706' }}
        onResizeEnd={(_, params) => d.onResize?.(id, params.width, params.height)}
      />
      <Handle type="target" position={Position.Left} className={HANDLE_CLS} />
      <Handle type="source" position={Position.Right} className={HANDLE_CLS} />

      {editing ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* nodrag — чтобы выделение текста не таскало ноду; nowheel — скролл текста */}
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraft(d.text)
                setEditing(false)
              }
              e.stopPropagation()
            }}
            rows={5}
            className="nodrag nowheel h-full w-full flex-1 resize-none rounded-md border bg-white/90 p-1.5 font-mono text-xs outline-none dark:bg-background/70"
            aria-label="Текст заметки"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">Esc — выйти, клик вне — сохранить</p>
        </div>
      ) : (
        <div
          className="custom-scroll nowheel nodrag nopan min-h-0 flex-1 overflow-y-auto"
          title="Двойной клик — редактировать текст; чекбоксы кликабельны"
        >
          {d.text?.trim() ? (
            <MarkdownView
              source={d.text}
              compact
              interactiveCheckboxes
              onSourceChange={(next) => {
                setDraft(next)
                setPrevText(next)
                d.onSave?.(id, next)
              }}
            />
          ) : (
            <p className="text-xs italic text-muted-foreground">Пустая заметка — двойной клик для редактирования</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Нода-вложение (ФТ-3.2): превью файла на канвасе + полноэкранный просмотр */
export function AttachmentNodeCard({ data, selected, id }: NodeProps) {
  const d = data as AttachmentNodeData
  const a = d.attachment
  const kind = resolveAttachmentPreviewKind(a.mime, a.fileName)
  const keepRatio = attachmentNodeKeepAspect(kind)

  return (
    <div
      className={cn(
        'group relative flex h-full w-full min-w-[120px] flex-col overflow-visible rounded-xl border bg-card shadow-md transition-opacity',
        d.dimmed && 'opacity-25',
        selected && 'ring-2 ring-teal-500/60'
      )}
    >
      <NodeToolbar isVisible={selected} position={Position.Top} offset={10} className="nodrag nopan">
        <div className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-lg">
          <TBtn title="Открыть (полноэкранный просмотр)" onClick={() => d.onOpenPreview?.(a)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </TBtn>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          <TBtn title="Удалить ноду файла" danger onClick={() => d.onDeleteNode?.(id, 'ноду файла')}>
            <Trash2 className="h-3.5 w-3.5" />
          </TBtn>
        </div>
      </NodeToolbar>

      {/* z-0 — превью под ручками ресайза и connection handles */}
      <div className="relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
        <div
          className="attachment-drag-handle flex shrink-0 cursor-grab items-center justify-center border-b border-border/60 bg-muted/50 py-0.5 text-muted-foreground active:cursor-grabbing"
          title="Перетащить файл"
        >
          <GripHorizontal className="h-3 w-3" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <AttachmentGraphPreview
            attachment={a}
            onOpenPreview={d.onOpenPreview}
            autoFit={d.autoFitSize}
            onAutoFitSize={(nw, nh) => {
              const { w, h } = fitGraphAttachmentDimensions(nw, nh)
              d.onAutoFitSize?.(id, w, h)
            }}
          />
        </div>
      </div>

      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={64}
        color="#0f766e"
        lineStyle={RESIZER_LINE}
        handleStyle={RESIZER_HANDLE}
        lineClassName={RESIZER_LINE_CLS}
        keepAspectRatio={keepRatio}
        onResizeEnd={(_, params) => d.onResize?.(id, params.width, params.height)}
      />
      <Handle type="target" position={Position.Left} className={HANDLE_CLS} />
      <Handle type="source" position={Position.Right} className={HANDLE_CLS} />
    </div>
  )
}
