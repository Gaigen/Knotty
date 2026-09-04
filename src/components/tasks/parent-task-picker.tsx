'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { TypeIcon } from '@/components/shared/bits'
import { TYPE_LABELS_RU } from '@/lib/config'
import { cn } from '@/lib/utils'
import type { TaskFullDto, TaskRowDto } from '@/lib/types'

const PARENT_COMBO_BUTTON_CLASS = cn(
  'h-8 w-full min-w-0 shrink justify-between gap-2 whitespace-normal font-normal text-sm',
)

function ParentTaskValue({ parent }: { parent: NonNullable<TaskFullDto['parent']> }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left">
      <TypeIcon type={parent.type} className="h-3.5 w-3.5 shrink-0" />
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{parent.key}</span>
      <span className="min-w-0 truncate">{parent.title}</span>
    </span>
  )
}

export function ParentTaskPicker({
  task,
  parentCandidates,
  onPatch,
  popoverClassName = 'w-[min(400px,calc(100vw-2rem))] p-0',
  showTypeHint = false,
}: {
  task: TaskFullDto
  parentCandidates: TaskRowDto[]
  onPatch: (body: Record<string, unknown>) => Promise<unknown>
  popoverClassName?: string
  showTypeHint?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className={PARENT_COMBO_BUTTON_CLASS}>
            {task.parent ? (
              <ParentTaskValue parent={task.parent} />
            ) : (
              <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">Нет родителя</span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className={popoverClassName} align="start" collisionPadding={16}>
          <Command>
            <CommandInput placeholder="Поиск задачи-родителя…" />
            <CommandList>
              <CommandEmpty>Нет подходящих задач</CommandEmpty>
              <CommandGroup>
                <CommandItem value="no-parent" onSelect={() => { onPatch({ parentId: null }).catch(() => {}); setOpen(false) }}>
                  <Check className={cn('h-4 w-4', !task.parent && 'opacity-100', task.parent && 'opacity-0')} />
                  Без родителя
                </CommandItem>
                {parentCandidates.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`${t.key} ${t.title}`}
                    onSelect={() => { onPatch({ parentId: t.id }).catch(() => {}); setOpen(false) }}
                  >
                    <Check className={cn('h-4 w-4', task.parent?.id === t.id ? 'opacity-100' : 'opacity-0')} />
                    <TypeIcon type={t.type} className="h-3.5 w-3.5 shrink-0" />
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{t.key}</span>
                    <span className="min-w-0 truncate">{t.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {task.parent && (
        <button
          type="button"
          className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onPatch({ parentId: null }).catch(() => {})}
        >
          <Link2 className="h-3 w-3 shrink-0" />
          <span className="truncate">Открепить от {task.parent.key}</span>
        </button>
      )}

      {showTypeHint && (
        <p className="mt-1 break-words text-[11px] text-muted-foreground">
          Только задачи, которые могут быть родителем для типа «{TYPE_LABELS_RU[task.type]}» (п. 4.1.1 ТЗ)
        </p>
      )}
    </div>
  )
}
