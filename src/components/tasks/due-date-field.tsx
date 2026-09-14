'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarDays, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useFormatters } from '@/lib/i18n/use-formatters'
import { cn } from '@/lib/utils'

function parseDueDate(iso: string | null): Date | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Срок задачи: popover-календарь (не нативный picker — не вылезает за узкую панель) */
export function DueDateField({
  dueDate,
  onDueDateChange,
  triggerClassName,
  overdue,
}: {
  dueDate: string | null
  onDueDateChange: (iso: string | null) => void
  triggerClassName?: string
  overdue?: boolean
}) {
  const t = useTranslations('taskPanel')
  const { formatDate, locale } = useFormatters()
  const [open, setOpen] = useState(false)
  const selected = parseDueDate(dueDate)

  const quickDays: ReadonlyArray<[string, number]> = [
    [t('today'), 0],
    [t('tomorrow'), 1],
    [t('plus7Days'), 7],
  ]

  function pickDate(d: Date) {
    const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0)
    onDueDateChange(nd.toISOString())
    setOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'h-8 min-w-0 justify-start gap-2 px-2.5 font-normal',
              triggerClassName ?? 'w-[150px]'
            )}
            aria-label={t('dueDateAria')}
          >
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className={cn('truncate text-sm', !dueDate && 'text-muted-foreground')}>
              {dueDate ? formatDate(dueDate) : t('pickDate')}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[284px] p-0"
          align="start"
          side="bottom"
          sideOffset={4}
          collisionPadding={16}
          avoidCollisions
        >
          <Calendar
            mode="single"
            fixedWeeks
            showOutsideDays
            selected={selected}
            onSelect={(d) => d && pickDate(d)}
            defaultMonth={selected}
            className="w-full"
            formatters={{
              formatCaption: (date) =>
                date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
            }}
          />
        </PopoverContent>
      </Popover>

      {quickDays.map(([label, days]) => (
        <button
          key={label}
          type="button"
          className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
          onClick={() => {
            const d = new Date()
            d.setDate(d.getDate() + days)
            pickDate(d)
          }}
        >
          {label}
        </button>
      ))}

      {dueDate && (
        <button
          type="button"
          className="inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          onClick={() => onDueDateChange(null)}
        >
          <X className="h-3 w-3" /> {t('clear')}
        </button>
      )}

      {overdue && dueDate && (
        <span className="text-[11px] font-medium text-red-600">
          {t('overdue', { date: formatDate(dueDate) })}
        </span>
      )}
    </div>
  )
}
