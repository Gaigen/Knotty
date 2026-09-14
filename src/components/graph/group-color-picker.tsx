'use client'

import { useEffect, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { GROUP_COLOR_PRESETS, isValidGroupColor, normalizeGroupColor } from '@/lib/graph-group-color'
import { Input } from '@/components/ui/input'

/** In-DOM picker: нативный input[type=color] в Chromium закрывает родительский Popover */
export function GroupColorPicker({
  value,
  committedColor,
  onPreview,
  onCommit,
}: {
  value: string
  committedColor: string
  /** Локальный предпросмотр на канвасе, без PATCH */
  onPreview: (hex: string) => void
  /** Сохранение на сервер + запись в историю отмены */
  onCommit: (hex: string, before: string) => void
}) {
  const t = useTranslations('graph')
  const accent = normalizeGroupColor(value)
  const committed = normalizeGroupColor(committedColor)
  const [draft, setDraft] = useState(accent)
  const gestureBeforeRef = useRef(accent)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!draggingRef.current) setDraft(accent)
  }, [accent])

  function preview(hex: string) {
    const next = normalizeGroupColor(hex)
    setDraft(next)
    onPreview(next)
  }

  function commit(hex: string, before: string) {
    const next = normalizeGroupColor(hex)
    setDraft(next)
    onPreview(next)
    onCommit(next, before)
  }

  function onHexInput(raw: string) {
    const v = raw.startsWith('#') ? raw : `#${raw}`
    if (!isValidGroupColor(v)) return
    commit(v, committed)
  }

  return (
    <div
      className="w-[200px] space-y-2.5"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-6 gap-1">
        {GROUP_COLOR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={t(`groupColors.${p.id}`)}
            className={cn(
              'mx-auto h-5 w-5 rounded-full border-2 transition-transform hover:scale-110',
              accent === p.hex ? 'border-foreground' : 'border-transparent'
            )}
            style={{ backgroundColor: p.hex }}
            onClick={(e) => {
              e.stopPropagation()
              commit(p.hex, committed)
            }}
          />
        ))}
      </div>
      <div
        onPointerDown={(e) => {
          e.stopPropagation()
          draggingRef.current = true
          gestureBeforeRef.current = draft
        }}
      >
        <HexColorPicker
          color={draft}
          className="group-color-picker"
          onChange={(hex) => preview(hex)}
          onChangeEnd={(hex) => {
            draggingRef.current = false
            commit(hex, gestureBeforeRef.current)
          }}
        />
      </div>
      <Input
        value={draft}
        onChange={(e) => onHexInput(e.target.value.trim())}
        className="h-8 w-full font-mono text-center text-xs"
        aria-label={t('group.hexColorAria')}
        spellCheck={false}
        maxLength={7}
      />
    </div>
  )
}
