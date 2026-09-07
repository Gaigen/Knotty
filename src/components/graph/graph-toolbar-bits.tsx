'use client'

import type { ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'

export function GraphFilterCheck({
  label,
  checked,
  onChange,
  dot,
  avatar,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  dot?: string
  avatar?: ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted/60">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} className="h-3.5 w-3.5" />
      {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />}
      {avatar}
      <span className="truncate">{label}</span>
    </label>
  )
}

export function GraphToolbarBtn({
  title,
  onClick,
  icon,
  disabled,
}: {
  title: string
  onClick: () => void
  icon: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex flex-1 items-center justify-center p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {icon}
    </button>
  )
}
