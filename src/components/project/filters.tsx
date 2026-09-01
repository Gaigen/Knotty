'use client'

import { useMemo } from 'react'
import { Filter, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Kbd, UserAvatar, labelColor } from '@/components/shared/bits'
import { PRIORITIES, PRIORITY_LABELS_RU, TASK_TYPES, TYPE_LABELS_RU } from '@/lib/config'
import type { ProjectDetailDto, TaskRowDto, UserDto } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface FiltersState {
  statusIds: string[]
  assigneeIds: string[] // 'none' = не назначен
  priorities: string[]
  types: string[]
  labels: string[]
}

export const EMPTY_FILTERS: FiltersState = { statusIds: [], assigneeIds: [], priorities: [], types: [], labels: [] }

export function isFiltersActive(f: FiltersState): boolean {
  return f.statusIds.length + f.assigneeIds.length + f.priorities.length + f.types.length + f.labels.length > 0
}

export function countActive(f: FiltersState): number {
  return f.statusIds.length + f.assigneeIds.length + f.priorities.length + f.types.length + f.labels.length
}

/** Клиентская часть фильтрации (ФТ-2.5): поиск выполняется на сервере (флаг matches) */
export function matchesClientFilters(t: TaskRowDto, f: FiltersState): boolean {
  if (f.statusIds.length && !f.statusIds.includes(t.statusId)) return false
  if (f.assigneeIds.length) {
    if (t.assigneeId === null ? !f.assigneeIds.includes('none') : !f.assigneeIds.includes(t.assigneeId)) return false
  }
  if (f.priorities.length && !f.priorities.includes(t.priority)) return false
  if (f.types.length && !f.types.includes(t.type)) return false
  if (f.labels.length && !f.labels.some((l) => t.labels.includes(l))) return false
  return true
}

/** id задач, видимых при активных фильтрах: совпавшие + их предки (ФТ-2.5) */
export function visibleTasksWithAncestors(tasks: TaskRowDto[], f: FiltersState, searchActive: boolean): Map<string, { visible: boolean; grayed: boolean }> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const result = new Map<string, { visible: boolean; grayed: boolean }>()

  const passes = (t: TaskRowDto) => matchesClientFilters(t, f) && (!searchActive || t.matches !== false)

  for (const t of tasks) {
    if (passes(t)) {
      result.set(t.id, { visible: true, grayed: false })
      // поднять предков серым
      let pid = t.parentId
      const guard = new Set<string>()
      while (pid && !guard.has(pid)) {
        guard.add(pid)
        const parent = byId.get(pid)
        if (!parent) break
        const cur = result.get(pid)
        if (cur?.visible && !cur.grayed) break // уже показан как совпавший
        result.set(pid, { visible: true, grayed: true })
        pid = parent.parentId
      }
    }
  }
  return result
}

interface FiltersBarProps {
  project: ProjectDetailDto
  tasks: TaskRowDto[] | undefined
  users: UserDto[]
  filters: FiltersState
  onFiltersChange: (f: FiltersState) => void
  search: string
  onSearchChange: (s: string) => void
  total: number
  shown: number
  searchRef?: React.RefObject<HTMLInputElement | null>
  /** доп. элементы тулбара конкретной вьюхи (напр., «Все колонки» на канбане) */
  children?: React.ReactNode
}

/** Общая панель фильтров над вьюхами (ФТ-2.5/2.6, ФТ-4.7) */
export function FiltersBar({
  project,
  tasks,
  users,
  filters,
  onFiltersChange,
  search,
  onSearchChange,
  total,
  shown,
  searchRef,
  children,
}: FiltersBarProps) {
  const allLabels = useMemo(() => {
    const s = new Set<string>()
    tasks?.forEach((t) => t.labels.forEach((l) => s.add(l)))
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [tasks])

  const active = isFiltersActive(filters)
  const shownText = active || search ? `Показано ${shown} из ${total}` : `Всего: ${total}`

  function toggle(field: keyof FiltersState, value: string) {
    const arr = filters[field] as string[]
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
    onFiltersChange({ ...filters, [field]: next })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2.5 sm:px-6">
      <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Поиск: название, ключ, метка, текст…"
          className="h-8 pl-8 pr-8 text-sm"
          aria-label="Поиск задач"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden sm:block">
          <Kbd>/</Kbd>
        </span>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn('h-8 gap-1.5', active && 'border-teal-700/50 text-teal-800')}>
            <Filter className="h-3.5 w-3.5" />
            Фильтры
            {active && <Badge className="ml-1 h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">{countActive(filters)}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <div className="max-h-[420px] space-y-4 overflow-y-auto custom-scroll pr-1">
            <FilterSection title="Статус">
              {project.statuses.map((s) => (
                <FilterCheck
                  key={s.id}
                  checked={filters.statusIds.includes(s.id)}
                  onToggle={() => toggle('statusIds', s.id)}
                  label={s.name}
                  dot={s.color}
                />
              ))}
            </FilterSection>
            <FilterSection title="Исполнитель">
              {users.map((u) => (
                <FilterCheck
                  key={u.id}
                  checked={filters.assigneeIds.includes(u.id)}
                  onToggle={() => toggle('assigneeIds', u.id)}
                  label={u.name}
                  avatar={<UserAvatar user={u} size={18} />}
                />
              ))}
              <FilterCheck
                checked={filters.assigneeIds.includes('none')}
                onToggle={() => toggle('assigneeIds', 'none')}
                label="Не назначен"
                avatar={<UserAvatar user={null} size={18} />}
              />
            </FilterSection>
            <FilterSection title="Приоритет">
              {PRIORITIES.map((p) => (
                <FilterCheck
                  key={p}
                  checked={filters.priorities.includes(p)}
                  onToggle={() => toggle('priorities', p)}
                  label={PRIORITY_LABELS_RU[p]}
                />
              ))}
            </FilterSection>
            <FilterSection title="Тип">
              {TASK_TYPES.map((t) => (
                <FilterCheck
                  key={t}
                  checked={filters.types.includes(t)}
                  onToggle={() => toggle('types', t)}
                  label={TYPE_LABELS_RU[t]}
                />
              ))}
            </FilterSection>
            {allLabels.length > 0 && (
              <FilterSection title="Метки">
                <div className="flex flex-wrap gap-1.5">
                  {allLabels.map((l) => {
                    const on = filters.labels.includes(l)
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => toggle('labels', l)}
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium transition-all',
                          on ? 'text-white' : 'hover:opacity-80'
                        )}
                        style={on ? { backgroundColor: labelColor(l) } : { backgroundColor: `${labelColor(l)}1a`, color: labelColor(l) }}
                        aria-pressed={on}
                      >
                        {l}
                      </button>
                    )
                  })}
                </div>
              </FilterSection>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {children}

      <div className="ml-auto flex items-center gap-2">
        {active && (
          <div className="hidden max-w-[340px] flex-wrap items-center gap-1 md:flex">
            {filters.statusIds.map((id) => {
              const s = project.statuses.find((x) => x.id === id)
              return s ? (
                <button
                  key={id}
                  onClick={() => toggle('statusIds', id)}
                  className="group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: `${s.color}1a`, color: s.color }}
                >
                  {s.name} <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                </button>
              ) : null
            })}
            {filters.priorities.map((p) => (
              <button key={p} onClick={() => toggle('priorities', p)} className="group inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                {PRIORITY_LABELS_RU[p]} <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
              </button>
            ))}
            {filters.types.map((t) => (
              <button key={t} onClick={() => toggle('types', t)} className="group inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                {TYPE_LABELS_RU[t]} <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
              </button>
            ))}
            {filters.labels.map((l) => (
              <button key={l} onClick={() => toggle('labels', l)} className="group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `${labelColor(l)}1a`, color: labelColor(l) }}>
                {l} <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
              </button>
            ))}
            {(filters.assigneeIds ?? []).map((id) => {
              const u = users.find((x) => x.id === id)
              return (
                <button key={id} onClick={() => toggle('assigneeIds', id)} className="group inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                  {id === 'none' ? 'Не назначен' : u?.name ?? id} <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                </button>
              )
            })}
          </div>
        )}
        <span className="hidden shrink-0 text-xs text-muted-foreground lg:inline" aria-live="polite">{shownText}</span>
        {active && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => onFiltersChange({ ...EMPTY_FILTERS })}>
            Сбросить всё
          </Button>
        )}
      </div>
    </div>
  )
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</Label>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function FilterCheck({
  checked,
  onToggle,
  label,
  dot,
  avatar,
}: {
  checked: boolean
  onToggle: () => void
  label: string
  dot?: string
  avatar?: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted/60">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="h-3.5 w-3.5" />
      {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />}
      {avatar}
      <span className="truncate">{label}</span>
    </label>
  )
}
