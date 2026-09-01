'use client'

import { useEffect, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { MarkdownView } from '@/components/shared/markdown'
import { PdfPreview } from '@/components/shared/pdf-preview'
import { FileMimeIcon } from '@/components/shared/bits'
import { attachmentFileUrl } from '@/lib/api'
import {
  GRAPH_TEXT_SNIPPET_BYTES,
  resolveAttachmentPreviewKind,
  type AttachmentPreviewKind,
} from '@/lib/attachment-preview'

type Att = { id: string; fileName: string; mime: string; hasPreview: boolean }

function GraphTextSnippet({ url, asMarkdown }: { url: string; asMarkdown?: boolean }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error()
        const buf = await res.arrayBuffer()
        if (cancelled) return
        const slice = buf.byteLength > GRAPH_TEXT_SNIPPET_BYTES ? buf.slice(0, GRAPH_TEXT_SNIPPET_BYTES) : buf
        setText(new TextDecoder('utf-8', { fatal: false }).decode(slice))
      })
      .catch(() => {
        if (!cancelled) setText(null)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (!text) {
    return <p className="p-2 text-[10px] text-muted-foreground">Загрузка…</p>
  }

  if (asMarkdown) {
    return (
      <div className="nowheel nodrag nopan custom-scroll max-h-full overflow-auto p-2 text-[11px] leading-snug">
        <MarkdownView source={text} compact />
      </div>
    )
  }

  return (
    <pre className="nowheel nodrag nopan custom-scroll max-h-full overflow-auto p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
      {text}
    </pre>
  )
}

/** Мини-превью вложения прямо на ноде графа */
export function AttachmentGraphPreview({
  attachment,
  onOpenPreview,
  autoFit,
  onAutoFitSize,
}: {
  attachment: Att
  onOpenPreview?: (att: Att) => void
  /** Подогнать w/h ноды по медиа, если пользователь ещё не ресайзил */
  autoFit?: boolean
  onAutoFitSize?: (w: number, h: number) => void
}) {
  const kind = resolveAttachmentPreviewKind(attachment.mime, attachment.fileName)
  const fileUrl = attachmentFileUrl(attachment.id)
  const thumbUrl = attachment.hasPreview ? attachmentFileUrl(attachment.id, true) : fileUrl
  const fittedRef = useRef(false)

  const tryAutoFit = (naturalW: number, naturalH: number) => {
    if (!autoFit || !onAutoFitSize || fittedRef.current) return
    fittedRef.current = true
    onAutoFitSize(naturalW, naturalH)
  }

  const openBtn = (
    <button
      type="button"
      className="nodrag nopan pointer-events-auto absolute right-1.5 top-1.5 z-10 rounded-md bg-black/55 p-1 text-white opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100 [.group:hover>&]:opacity-100"
      onClick={(e) => {
        e.stopPropagation()
        onOpenPreview?.(attachment)
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label="Полноэкранный просмотр"
      title="Полноэкранный просмотр"
    >
      <Maximize2 className="h-3.5 w-3.5" />
    </button>
  )

  if (kind === 'image') {
    return (
      <div className="group relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-muted">
        {openBtn}
        <img
          src={thumbUrl}
          alt={attachment.fileName}
          className="max-h-full max-w-full object-contain"
          draggable={false}
          onLoad={(e) => tryAutoFit(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
        />
        <span className="absolute bottom-1 right-1 max-w-[85%] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          {attachment.fileName}
        </span>
      </div>
    )
  }

  if (kind === 'video') {
    return (
      <div className="group relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-black">
        {openBtn}
        <video
          src={fileUrl}
          controls
          className="nodrag nopan max-h-full max-w-full object-contain"
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            tryAutoFit(v.videoWidth, v.videoHeight)
          }}
        />
        <span className="absolute bottom-1 right-1 max-w-[85%] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          {attachment.fileName}
        </span>
      </div>
    )
  }

  if (kind === 'audio') {
    return (
      <div className="group flex h-full w-full flex-col items-stretch justify-center gap-2 p-3">
        {openBtn}
        <div className="flex flex-col items-center gap-2">
          <FileMimeIcon mime={attachment.mime} className="h-8 w-8 shrink-0 text-muted-foreground" />
          <audio src={fileUrl} controls className="nodrag nopan block w-full min-w-0" preload="metadata" />
        </div>
        <span className="truncate text-center text-[10px] text-muted-foreground" title={attachment.fileName}>
          {attachment.fileName}
        </span>
      </div>
    )
  }

  if (kind === 'pdf') {
    return (
      <div className="group relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-muted">
        {openBtn}
        <PdfPreview url={fileUrl} mode="thumbnail" className="nodrag nopan nowheel h-full min-h-0" />
        <span className="absolute bottom-1 right-1 max-w-[85%] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          {attachment.fileName}
        </span>
      </div>
    )
  }

  if (kind === 'markdown' || kind === 'text') {
    return (
      <div className="group relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-muted/40">
        {openBtn}
        <div className="flex shrink-0 items-center gap-1.5 border-b bg-card/80 px-2 py-1">
          <FileMimeIcon mime={attachment.mime} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-[10px] font-medium" title={attachment.fileName}>
            {attachment.fileName}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <GraphTextSnippet url={fileUrl} asMarkdown={kind === 'markdown'} />
        </div>
      </div>
    )
  }

  return (
    <div className="group relative flex h-full w-full items-center gap-2 p-2.5">
      <FileMimeIcon mime={attachment.mime} className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 break-words text-xs">{attachment.fileName}</span>
    </div>
  )
}

export function attachmentNodeKeepAspect(kind: AttachmentPreviewKind): boolean {
  return kind === 'image' || kind === 'video'
}
