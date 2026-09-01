'use client'

import { useRef, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bold, Italic, Code, List, ListChecks, Heading2, Link2, Image as ImageIcon, Eye, Pencil, Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { attachmentFileUrl } from '@/lib/api'

/** Разрешает внутренние ссылки attachment:id; остальные — через стандартный санитайзер */
function markdownUrlTransform(url: string): string {
  if (/^attachment:/i.test(url)) return url
  return defaultUrlTransform(url)
}

/** GFM task item: - [ ] / - [x] / 1. [ ] */
const TASK_ITEM_RE = /^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\](.*)$/

/** Переключает чекбокс по индексу (0-based) в тексте Markdown */
export function toggleMarkdownCheckbox(source: string, index: number): string {
  const lines = source.split('\n')
  let n = 0
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TASK_ITEM_RE)
    if (!m) continue
    if (n === index) {
      const checked = m[2].toLowerCase() === 'x'
      lines[i] = `${m[1]}[${checked ? ' ' : 'x'}]${m[3]}`
      return lines.join('\n')
    }
    n += 1
  }
  return source
}

/** Клик по чекбоксу / пункту чек-листа — не выделять ноду React Flow */
export function isMarkdownCheckboxInteraction(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return !!el.closest(
    'input[type="checkbox"], .task-list-item, .task-list-item-interactive, .markdown-task-list'
  )
}

function stopGraphPointer(e: React.MouseEvent | React.PointerEvent) {
  e.stopPropagation()
}

/** Превращает attachment:id в URL файла; остальные src пропускает */
function resolveImgSrc(src: string): string {
  const m = src.match(/^attachment:(.+)$/)
  if (m) return attachmentFileUrl(m[1])
  return src
}

/** Просмотр Markdown (ФТ-5.1): рендер на клиенте; чекбоксы кликабельны при onSourceChange */
export function MarkdownView({
  source,
  className,
  compact,
  interactiveCheckboxes,
  onSourceChange,
}: {
  source: string
  className?: string
  compact?: boolean
  /** Клик по чекбоксу переключает [ ] ↔ [x] и вызывает onSourceChange */
  interactiveCheckboxes?: boolean
  onSourceChange?: (next: string) => void
}) {
  if (!source?.trim()) {
    return <p className={cn('text-sm text-muted-foreground italic', className)}>Нет описания</p>
  }

  const canToggle = interactiveCheckboxes && onSourceChange
  let checkboxIndex = 0

  return (
    <div
      className={cn(
        'markdown-body text-sm leading-relaxed',
        compact ? 'text-[13px]' : '',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={markdownUrlTransform}
        components={{
          img: ({ src, alt, node }) => {
            const raw =
              (typeof src === 'string' && src) ||
              (typeof node?.properties?.src === 'string' ? String(node.properties.src) : '')
            const resolved = resolveImgSrc(raw)
            if (!resolved) return null
            return (
              <img
                src={resolved}
                alt={alt ?? ''}
                className="my-2 max-w-full rounded-lg border"
                loading="lazy"
              />
            )
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-teal-700 underline underline-offset-2 hover:opacity-80">
              {children}
            </a>
          ),
          li: ({ children, className: c }) => {
            const isTask = !!c?.includes('task-list-item')
            return (
              <li
                className={cn(
                  c,
                  'marker:text-muted-foreground',
                  isTask && canToggle && 'nodrag nopan task-list-item-interactive cursor-pointer'
                )}
                onMouseDown={isTask && canToggle ? stopGraphPointer : undefined}
                onPointerDown={isTask && canToggle ? stopGraphPointer : undefined}
                onClick={
                  isTask && canToggle
                    ? (e) => {
                        stopGraphPointer(e)
                        if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return
                        const raw = (e.currentTarget as HTMLElement)
                          .querySelector('input[type="checkbox"][data-task-idx]')
                          ?.getAttribute('data-task-idx')
                        if (raw == null) return
                        onSourceChange!(toggleMarkdownCheckbox(source, Number(raw)))
                      }
                    : undefined
                }
              >
                {children}
              </li>
            )
          },
          ul: ({ children, className: c }) => (
            <ul
              className={cn(
                c,
                c?.includes('contains-task-list') && canToggle && 'markdown-task-list nodrag nopan'
              )}
              onMouseDown={c?.includes('contains-task-list') && canToggle ? stopGraphPointer : undefined}
            >
              {children}
            </ul>
          ),
          input: (props) => {
            if (props.type !== 'checkbox') {
              return <input {...props} />
            }
            const idx = checkboxIndex++
            if (!canToggle) {
              return (
                <input
                  {...props}
                  disabled
                  className="mr-1.5 h-3.5 w-3.5 align-middle accent-teal-700 disabled:opacity-100"
                />
              )
            }
            return (
              <input
                type="checkbox"
                checked={props.checked}
                data-task-idx={idx}
                className="nodrag nopan mr-2 h-4 w-4 shrink-0 cursor-pointer align-middle accent-teal-700"
                onMouseDown={stopGraphPointer}
                onPointerDown={stopGraphPointer}
                onClick={stopGraphPointer}
                onChange={(e) => {
                  stopGraphPointer(e)
                  onSourceChange!(toggleMarkdownCheckbox(source, idx))
                }}
              />
            )
          },
          code: ({ className: c, children, ...rest }) => {
            const isBlock = /language-/.test(c ?? '')
            if (isBlock) {
              return (
                <code className={cn(c, 'block font-mono')} {...rest}>
                  {children}
                </code>
              )
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-teal-800" {...rest}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-zinc-100 text-[12px] leading-relaxed">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-muted-foreground/40 pl-3 text-muted-foreground">{children}</blockquote>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

interface ToolbarAction {
  icon: React.ReactNode
  title: string
  wrap?: [string, string]
  prefix?: string
}

const ACTIONS: ToolbarAction[] = [
  { icon: <Bold className="h-4 w-4" />, title: 'Жирный', wrap: ['**', '**'] },
  { icon: <Italic className="h-4 w-4" />, title: 'Курсив', wrap: ['_', '_'] },
  { icon: <Code className="h-4 w-4" />, title: 'Код', wrap: ['`', '`'] },
  { icon: <Heading2 className="h-4 w-4" />, title: 'Заголовок', prefix: '## ' },
  { icon: <List className="h-4 w-4" />, title: 'Список', prefix: '- ' },
  { icon: <ListChecks className="h-4 w-4" />, title: 'Чекбокс', prefix: '- [ ] ' },
  { icon: <Link2 className="h-4 w-4" />, title: 'Ссылка', wrap: ['[', '](https://)'] },
  { icon: <ImageIcon className="h-4 w-4" />, title: 'Картинка', wrap: ['![описание](', ')'] },
]

/**
 * Редактор Markdown (ФТ-2.7): textarea + тулбар + переключение просмотр/редактирование.
 * v1.0-опция «plain textarea + preview» из открытого вопроса п. 10.2.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = 140,
  className,
  onUploadImage,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: number
  className?: string
  onUploadImage?: (file: File) => void
}) {
  const [preview, setPreview] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  function applyAction(action: ToolbarAction) {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end)
    let next = value
    let cursor = end
    if (action.wrap) {
      const [open, close] = action.wrap
      next = value.slice(0, start) + open + selected + close + value.slice(end)
      cursor = start + open.length + selected.length
    } else if (action.prefix) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      next = value.slice(0, lineStart) + action.prefix + value.slice(lineStart)
      cursor = end + action.prefix.length
    }
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(cursor, cursor)
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file && onUploadImage) onUploadImage(file)
  }

  return (
    <div className={cn('rounded-lg border bg-background', className)}>
      <div className="flex items-center justify-between border-b px-1.5 py-1">
        <div className="flex items-center gap-0.5">
          {ACTIONS.map((a) => (
            <button
              key={a.title}
              type="button"
              title={a.title}
              onClick={() => applyAction(a)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {a.icon}
            </button>
          ))}
          {onUploadImage && (
            <label
              title="Загрузить картинку"
              className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Undo2 className="h-4 w-4 rotate-90" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onUploadImage(f)
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {preview ? 'Редактировать' : 'Предпросмотр'}
        </Button>
      </div>
      {preview ? (
        <div className="max-h-[420px] overflow-y-auto p-3" style={{ minHeight }}>
          <MarkdownView source={value} interactiveCheckboxes onSourceChange={onChange} />
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'Поддерживается Markdown: **жирный**, `код`, списки, чекбоксы…'}
          className="w-full resize-y rounded-b-lg bg-transparent p-3 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
          style={{ minHeight }}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault()
          }}
        />
      )}
    </div>
  )
}
