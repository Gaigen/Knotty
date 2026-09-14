'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { CircleHelp, ChevronUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Kbd } from '@/components/shared/bits'
import { Button } from '@/components/ui/button'
import { prefGet, prefKey, prefSet } from '@/lib/prefs'
import { cn } from '@/lib/utils'

const HINTS_PREF = prefKey('graphHintsOpen')

function GraphHint({ keys, label }: { keys: ReactNode; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
      <span className="inline-flex items-center gap-0.5">{keys}</span>
      <span className="text-muted-foreground/35" aria-hidden>
        →
      </span>
      <span>{label}</span>
    </span>
  )
}

/** Подсказки по управлению канвасом графа — сворачиваются, состояние в localStorage */
export function GraphCanvasHints({ className }: { className?: string }) {
  const t = useTranslations('graph.hints')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const v = prefGet(HINTS_PREF)
    setOpen(v === null ? true : v === '1')
  }, [])

  function setOpenPersist(next: boolean) {
    setOpen(next)
    prefSet(HINTS_PREF, next ? '1' : '0')
  }

  return (
    <div
      className={cn(
        'hidden items-stretch overflow-hidden rounded-lg border bg-background/90 text-[10px] leading-none text-muted-foreground shadow-sm backdrop-blur md:flex',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto shrink-0 gap-1 rounded-none px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-muted/60"
        title={open ? t('hide') : t('show')}
        aria-expanded={open}
        onClick={() => setOpenPersist(!open)}
      >
        <CircleHelp className="h-3.5 w-3.5 shrink-0" />
        {!open && <span>{t('controls')}</span>}
        {open && <ChevronUp className="h-3 w-3 shrink-0 opacity-60" />}
      </Button>

      {open && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-l px-2.5 py-1.5">
          <GraphHint keys={<Kbd>drag</Kbd>} label={t('dragSelect')} />
          <GraphHint
            keys={
              <>
                <Kbd>СКМ</Kbd>
                <span className="text-[9px] text-muted-foreground/50">/</span>
                <Kbd>Space</Kbd>
              </>
            }
            label={t('pan')}
          />
          <GraphHint
            keys={
              <>
                <Kbd>Ctrl</Kbd>
                <span className="text-[9px] text-muted-foreground/50">+</span>
                <span>{t('click')}</span>
              </>
            }
            label={t('addToSelection')}
          />
          <GraphHint
            keys={
              <>
                <span>{t('edge')}</span>
                <Kbd>×</Kbd>
              </>
            }
            label={t('edgeDelete')}
          />
          <GraphHint keys={<Kbd>ПКМ</Kbd>} label={t('contextMenu')} />
          <GraphHint keys={<Kbd>/</Kbd>} label={t('find')} />
          <GraphHint
            keys={
              <>
                <Kbd>Ctrl</Kbd>
                <span className="text-[9px] text-muted-foreground/50">+</span>
                <Kbd>Z</Kbd>
              </>
            }
            label={t('undo')}
          />
          <GraphHint keys={<Kbd>↑↓←→</Kbd>} label={t('nudge')} />
          <GraphHint keys={<Kbd>+</Kbd>} label={t('zoom')} />
        </div>
      )}
    </div>
  )
}
