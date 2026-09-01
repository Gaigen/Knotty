'use client'

import { useMemo, useState } from 'react'
import { ListPlus, Search, X } from 'lucide-react'
import { Panel } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TypeIcon } from '@/components/shared/bits'
import type { TaskRowDto } from '@/lib/types'

const TASK_DRAG_TYPE = 'application/knotty-task-id'

export function GraphOffCanvasPanel({
  tasks,
  open,
  onOpenChange,
  bulkAdding,
  readOnly,
  onAddAll,
  onAddTask,
}: {
  tasks: TaskRowDto[]
  open: boolean
  onOpenChange: (open: boolean) => void
  bulkAdding: boolean
  readOnly?: boolean
  onAddAll: () => void
  onAddTask: (taskId: string) => void
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((t) => t.key.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
  }, [tasks, query])

  if (tasks.length === 0) return null

  if (!open) {
    return (
      <Panel position="bottom-right" className="!mb-3 !mr-3 z-[10]">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 bg-background/95 shadow-md backdrop-blur"
          onClick={() => onOpenChange(true)}
        >
          <ListPlus className="h-4 w-4" />
          Не на канвасе ({tasks.length})
        </Button>
      </Panel>
    )
  }

  return (
    <Panel position="bottom-right" className="!mb-3 !mr-3 z-[10]">
      <div className="w-80 rounded-xl border bg-background/95 shadow-lg backdrop-blur">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Не на канвасе: {tasks.length}</span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              disabled={bulkAdding || readOnly}
              onClick={onAddAll}
            >
              <ListPlus className="h-3.5 w-3.5" /> Все
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => onOpenChange(false)}
              aria-label="Скрыть панель"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="border-b px-2 py-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по ключу или названию…"
              className="h-8 pl-8 text-sm"
              aria-label="Поиск задач не на канвасе"
            />
          </div>
        </div>
        <div className="custom-scroll max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Ничего не найдено</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                draggable={!readOnly}
                onDragStart={(e) => {
                  if (readOnly) return
                  e.dataTransfer.setData(TASK_DRAG_TYPE, t.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                disabled={readOnly}
                onClick={() => onAddTask(t.id)}
                title={readOnly ? undefined : 'Клик — в центр канваса; перетащите на нужное место'}
              >
                <TypeIcon type={t.type} className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono text-[10px] text-muted-foreground">{t.key}</span>
                <span className="truncate">{t.title}</span>
              </button>
            ))
          )}
        </div>
        {!readOnly && (
          <p className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
            Клик — в центр. Перетащите на канвас — в точку отпускания.
          </p>
        )}
      </div>
    </Panel>
  )
}

export const GRAPH_TASK_DRAG_TYPE = TASK_DRAG_TYPE
