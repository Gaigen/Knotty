'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import { Download, FileQuestion, X } from 'lucide-react'
import { MarkdownView } from '@/components/shared/markdown'
import { PdfPreview } from '@/components/shared/pdf-preview'
import { FileMimeIcon } from '@/components/shared/bits'
import { attachmentFileUrl } from '@/lib/api'
import {
  MAX_TEXT_PREVIEW_BYTES,
  resolveAttachmentPreviewKind,
  type AttachmentPreviewKind,
} from '@/lib/attachment-preview'
import { useFormatters } from '@/lib/i18n/use-formatters'
import { cn } from '@/lib/utils'

export type AttachmentPreviewItem = {
  id: string
  fileName: string
  mime: string
  size?: number
  hasPreview?: boolean
}

function TextPreview({ url, fileName, asMarkdown }: { url: string; fileName: string; asMarkdown?: boolean }) {
  const t = useTranslations('shared')
  const tc = useTranslations('common')
  const { formatSize } = useFormatters()
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [content, setContent] = useState('')
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setContent('')
    setTruncated(false)

    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.statusText)
        const buf = await res.arrayBuffer()
        if (cancelled) return
        const slice = buf.byteLength > MAX_TEXT_PREVIEW_BYTES ? buf.slice(0, MAX_TEXT_PREVIEW_BYTES) : buf
        setTruncated(buf.byteLength > MAX_TEXT_PREVIEW_BYTES)
        setContent(new TextDecoder('utf-8', { fatal: false }).decode(slice))
        setState('ok')
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [url])

  if (state === 'loading') {
    return <p className="text-sm text-muted-foreground">{tc('loading')}</p>
  }
  if (state === 'error') {
    return <p className="text-sm text-destructive">{t('attachmentLoadError')}</p>
  }

  if (asMarkdown) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {truncated && (
          <p className="text-xs text-amber-200/90">
            {t('attachmentTruncated', { size: formatSize(MAX_TEXT_PREVIEW_BYTES) })}
          </p>
        )}
        <div className="custom-scroll min-h-0 flex-1 overflow-auto rounded-lg bg-background p-4 shadow-2xl">
          <MarkdownView source={content} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {truncated && (
        <p className="text-xs text-amber-200/90">
          {t('attachmentTruncated', { size: formatSize(MAX_TEXT_PREVIEW_BYTES) })}
        </p>
      )}
      <pre
        className="custom-scroll min-h-0 flex-1 overflow-auto rounded-lg bg-zinc-950 p-4 text-[13px] leading-relaxed text-zinc-100"
        aria-label={t('textAria', { fileName })}
      >
        {content}
      </pre>
    </div>
  )
}

function PreviewBody({
  item,
  kind,
  url,
}: {
  item: AttachmentPreviewItem
  kind: AttachmentPreviewKind
  url: string
}) {
  const t = useTranslations('shared')
  switch (kind) {
    case 'image':
      return (
        <img
          src={url}
          alt={item.fileName}
          className="block max-h-[min(85vh,calc(100vh-5rem))] max-w-[min(96vw,100%)] w-auto h-auto object-contain rounded-lg shadow-2xl"
        />
      )
    case 'pdf':
      return (
        <PdfPreview url={url} mode="viewer" className="min-h-0 flex-1 w-full" darkCanvas />
      )
    case 'video':
      return (
        <video
          src={url}
          controls
          playsInline
          className="block max-h-[min(85vh,calc(100vh-5rem))] max-w-[min(96vw,100%)] w-auto h-auto rounded-lg shadow-2xl"
          preload="metadata"
          onClick={(e) => e.stopPropagation()}
        >
          {t('videoUnsupported')}
        </video>
      )
    case 'audio':
      return (
        <div className="w-full max-w-md shrink-0 rounded-xl bg-white/10 px-8 py-10">
          <div className="flex flex-col items-center gap-6">
            <FileMimeIcon mime={item.mime} className="h-16 w-16 shrink-0 text-white/80" />
            <audio src={url} controls className="block w-full" preload="metadata">
              {t('audioUnsupported')}
            </audio>
          </div>
        </div>
      )
    case 'markdown':
      return <TextPreview url={url} fileName={item.fileName} asMarkdown />
    case 'text':
      return <TextPreview url={url} fileName={item.fileName} />
    default:
      return (
        <div className="flex flex-col items-center gap-4 rounded-xl bg-white/10 px-8 py-10 text-center text-white">
          <FileQuestion className="h-14 w-14 text-white/60" />
          <p className="text-sm text-white/90">{t('previewUnavailable')}</p>
          <p className="text-xs text-white/60">{item.mime || t('unknownMime')}</p>
        </div>
      )
  }
}

/** Полноэкранный предпросмотр вложения: картинки, PDF, текст, markdown, видео, аудио */
export function AttachmentViewer({
  item,
  onClose,
}: {
  item: AttachmentPreviewItem | null
  onClose: () => void
}) {
  const t = useTranslations('shared')
  const tc = useTranslations('common')
  const { formatSize } = useFormatters()
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [item, onClose])

  if (!item) return null

  const kind = resolveAttachmentPreviewKind(item.mime, item.fileName)
  const isMediaOverlay = kind === 'image' || kind === 'video' || kind === 'audio'
  const fileUrl = attachmentFileUrl(item.id)
  const displayUrl = fileUrl

  const overlay = (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={t('viewerAria', { fileName: item.fileName })}
    >
      <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950 px-4 py-3 text-white">
        <FileMimeIcon mime={item.mime} className="h-5 w-5 shrink-0 text-white/70" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={item.fileName}>{item.fileName}</div>
          {item.size != null && (
            <div className="text-xs text-white/50">{formatSize(item.size)}</div>
          )}
        </div>
        <a
          href={`${fileUrl}?download=1`}
          download
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs text-white transition-colors hover:bg-white/20"
        >
          <Download className="h-4 w-4" />
          {t('download')}
        </a>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label={t('closeViewer')}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div
        className={cn(
          'flex min-h-0 flex-1 p-4',
          kind === 'pdf' || kind === 'text' || kind === 'markdown'
            ? 'flex-col'
            : 'items-center justify-center',
          isMediaOverlay && 'p-6'
        )}
        onClick={isMediaOverlay ? onClose : undefined}
      >
        <div
          className={cn(
            'flex min-h-0 w-full flex-col',
            kind === 'pdf' && 'mx-auto max-w-5xl flex-1',
            (kind === 'text' || kind === 'markdown') && 'flex-1',
            kind === 'audio' && 'mx-auto max-w-md',
            isMediaOverlay && kind !== 'audio' && 'max-w-full',
            kind !== 'pdf' &&
              kind !== 'text' &&
              kind !== 'markdown' &&
              kind !== 'audio' &&
              'items-center justify-center'
          )}
          onClick={isMediaOverlay ? (e) => e.stopPropagation() : undefined}
        >
          <PreviewBody item={item} kind={kind} url={displayUrl} />
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
