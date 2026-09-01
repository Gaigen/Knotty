'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
}

const MAX_VIEWER_PAGES = 150

type PdfPreviewProps = {
  url: string
  className?: string
  /** thumbnail — нода на графе; viewer — полноэкранный просмотр */
  mode?: 'thumbnail' | 'viewer'
  darkCanvas?: boolean
}

function isRenderCancelled(e: unknown): boolean {
  return (e as Error)?.name === 'RenderingCancelledException'
}

function hiDpiScale(mode: 'thumbnail' | 'viewer'): number {
  const dpr = window.devicePixelRatio || 1
  return mode === 'viewer' ? Math.min(dpr, 2) : Math.min(dpr, 1.5)
}

function paintPage(
  page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>,
  canvas: HTMLCanvasElement,
  containerWidth: number,
  mode: 'thumbnail' | 'viewer',
  zoom: number
): RenderTask {
  const base = page.getViewport({ scale: 1 })
  const fitScale =
    containerWidth > 48
      ? containerWidth / base.width
      : mode === 'thumbnail'
        ? 260 / base.width
        : 720 / base.width

  const displayScale =
    mode === 'viewer'
      ? Math.max(fitScale * zoom, zoom)
      : Math.min(fitScale * zoom, 3)

  const viewport = page.getViewport({ scale: displayScale })
  const pixelRatio = hiDpiScale(mode)

  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`
  canvas.width = Math.floor(viewport.width * pixelRatio)
  canvas.height = Math.floor(viewport.height * pixelRatio)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D недоступен')

  const transform =
    pixelRatio !== 1
      ? ([pixelRatio, 0, 0, pixelRatio, 0, 0] as [number, number, number, number, number, number])
      : undefined

  return page.render({
    canvasContext: ctx,
    viewport,
    transform,
    canvas,
  })
}

/** PDF через pdf.js legacy (Chromium / Electron) */
export function PdfPreview({
  url,
  className,
  mode = 'viewer',
  darkCanvas = false,
}: PdfPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)

  // Загрузка PDF
  useEffect(() => {
    let cancelled = false
    let loadingTask: ReturnType<typeof getDocument> | null = null

    setPdf(null)
    setPageNum(1)
    setTotalPages(0)
    setState('loading')
    setError(null)

    async function load() {
      try {
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.arrayBuffer()
        if (cancelled) return

        loadingTask = getDocument({ data })
        const doc = await loadingTask.promise
        if (cancelled) return

        setPdf(doc)
        setTotalPages(doc.numPages)
        setState('ok')
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || 'Не удалось открыть PDF')
          setState('error')
        }
      }
    }

    load()

    return () => {
      cancelled = true
      loadingTask?.destroy()
    }
  }, [url])

  // Рендер страниц (каждая — свой canvas, без повторного использования)
  useEffect(() => {
    if (!pdf || state !== 'ok') return

    const scroll = scrollRef.current
    const pagesHost = pagesRef.current
    if (!scroll || !pagesHost) return

    let cancelled = false
    const activeTasks: RenderTask[] = []

    const cancelAll = () => {
      for (const t of activeTasks) {
        try {
          t.cancel()
        } catch {
          /* ignore */
        }
      }
      activeTasks.length = 0
    }

    async function renderPages() {
      cancelAll()
      pagesHost.replaceChildren()
      setRendering(true)

      try {
        await new Promise<void>((r) => requestAnimationFrame(() => r()))

        const width = scroll.clientWidth > 48 ? scroll.clientWidth - 24 : 720
        const pageCount =
          mode === 'thumbnail' ? 1 : Math.min(pdf.numPages, MAX_VIEWER_PAGES)

        for (let i = 1; i <= pageCount; i++) {
          if (cancelled) return

          const page = await pdf.getPage(i)
          if (cancelled) return

          const wrap = document.createElement('div')
          wrap.className = 'flex justify-center py-2'
          wrap.dataset.page = String(i)

          const canvas = document.createElement('canvas')
          canvas.className = 'block rounded-lg bg-white shadow-lg'
          wrap.appendChild(canvas)
          pagesHost.appendChild(wrap)

          const task = paintPage(page, canvas, width, mode, zoom)
          activeTasks.push(task)

          try {
            await task.promise
          } catch (e) {
            if (isRenderCancelled(e)) return
            throw e
          }
        }

        if (!cancelled) setRendering(false)
      } catch (e) {
        if (!cancelled && !isRenderCancelled(e)) {
          setError((e as Error).message || 'Ошибка рендера PDF')
          setState('error')
          setRendering(false)
        }
      }
    }

    renderPages()

    return () => {
      cancelled = true
      cancelAll()
      pagesHost.replaceChildren()
    }
  }, [pdf, zoom, state, mode, url])

  // Текущая страница при скролле (viewer)
  useEffect(() => {
    if (mode !== 'viewer' || state !== 'ok') return
    const root = scrollRef.current
    const host = pagesRef.current
    if (!root || !host) return

    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const page = best?.target instanceof HTMLElement ? best.target.dataset.page : undefined
        if (page) setPageNum(Number(page))
      },
      { root, threshold: [0.35, 0.55, 0.75] }
    )

    host.querySelectorAll('[data-page]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [mode, state, rendering, totalPages])

  const scrollToPage = (n: number) => {
    const clamped = Math.min(totalPages, Math.max(1, n))
    setPageNum(clamped)
    const root = scrollRef.current
    const el = pagesRef.current?.querySelector<HTMLElement>(`[data-page="${clamped}"]`)
    if (!root || !el) return
    root.scrollTo({
      top: Math.max(0, el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 8),
      behavior: 'smooth',
    })
  }

  const muted = darkCanvas ? 'text-white/70' : 'text-muted-foreground'

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col',
        mode === 'viewer' && 'min-h-0 flex-1',
        className
      )}
    >
      {state === 'loading' && (
        <p className={cn('text-sm', muted)}>Загрузка PDF…</p>
      )}
      {state === 'error' && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {state === 'ok' && mode === 'viewer' && (
        <div
          className={cn(
            'mb-3 flex shrink-0 flex-wrap items-center justify-center gap-2 rounded-lg px-2 py-1.5',
            darkCanvas ? 'bg-white/10' : 'bg-muted/80'
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', darkCanvas && 'text-white hover:bg-white/15 hover:text-white')}
            disabled={pageNum <= 1 || rendering}
            onClick={() => scrollToPage(pageNum - 1)}
            aria-label="Предыдущая страница"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className={cn('min-w-[5.5rem] text-center text-sm tabular-nums', darkCanvas ? 'text-white' : '')}>
            {pageNum} / {totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', darkCanvas && 'text-white hover:bg-white/15 hover:text-white')}
            disabled={pageNum >= totalPages || rendering}
            onClick={() => scrollToPage(pageNum + 1)}
            aria-label="Следующая страница"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className={cn('mx-1 hidden h-5 w-px sm:block', darkCanvas ? 'bg-white/20' : 'bg-border')} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', darkCanvas && 'text-white hover:bg-white/15 hover:text-white')}
            disabled={zoom <= 0.5 || rendering}
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            aria-label="Уменьшить"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className={cn('text-xs tabular-nums', muted)}>{Math.round(zoom * 100)}%</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', darkCanvas && 'text-white hover:bg-white/15 hover:text-white')}
            disabled={zoom >= 3 || rendering}
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            aria-label="Увеличить"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          {totalPages > MAX_VIEWER_PAGES && (
            <span className={cn('text-[10px]', muted)}>
              Показаны {MAX_VIEWER_PAGES} из {totalPages} стр.
            </span>
          )}
        </div>
      )}

      {state === 'ok' && (
        <div
          ref={scrollRef}
          className={cn(
            'custom-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain',
            mode === 'thumbnail' && 'nowheel nodrag nopan overflow-x-hidden',
            mode === 'viewer' && 'touch-pan-y',
            darkCanvas && 'rounded-lg'
          )}
          tabIndex={mode === 'viewer' ? 0 : undefined}
          onKeyDown={
            mode === 'viewer'
              ? (e) => {
                  if (e.key === 'ArrowLeft') scrollToPage(pageNum - 1)
                  if (e.key === 'ArrowRight') scrollToPage(pageNum + 1)
                }
              : undefined
          }
        >
          <div ref={pagesRef} className="flex flex-col items-center px-2 py-1" />
        </div>
      )}
    </div>
  )
}
