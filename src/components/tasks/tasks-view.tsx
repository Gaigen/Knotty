'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronDown, ChevronRight, Columns3, ListTodo, MessageSquare, Paperclip, Plus, SearchX,
  ArrowRight, Check, Copy, CopyPlus, ExternalLink, Flame, GitBranch, Trash2, UserCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FiltersBar, visibleTasksWithAncestors, type FiltersState } from '@/components/project/filters'
import { EmptyState, Kbd, LabelChip, PriorityIcon, StatusBadge, TypeIcon, UserAvatar } from '@/components/shared/bits'
import {
  CtxBackdrop, CtxContainer, CtxItem, CtxSeparator, CtxSubmenu, type CtxPos,
} from '@/components/shared/context-menu-helpers'
import { copyToClipboard, useDeleteTask, useTasks, useUpdateTask, useUsers } from '@/lib/api'
import { PRIORITIES, PRIORITY_LABELS_RU, PRIORITY_ORDER } from '@/lib/config'
import { formatDate, isOverdue } from '@/lib/format'
import { isEditableTarget } from '@/lib/keyboard'
import { cn } from '@/lib/utils'
import { prefGet, prefKey, prefSet } from '@/lib/prefs'
import type { ProjectDetailDto, TaskRowDto, UserDto } from '@/lib/types'

type GroupMode = 'status' | 'assignee' | 'none'
type SortField = 'key' | 'title' | 'status' | 'assignee' | 'priority' | 'dueDate' | 'createdAt'

interface GroupRow {
  kind: 'group'
  key: string
  label: string
  count: number
  collapsed: boolean
  color?: string
  avatar?: React.ReactNode
}
interface TaskRow {
  kind: 'task'
  task: TaskRowDto
  depth: number
  grayed: boolean
  expanded: boolean
  selected: boolean
}
type Row = GroupRow | TaskRow

const COLUMNS: { id: string; label: string; width: string }[] = [
  { id: 'type', label: '', width: '44px' },
  { id: 'key', label: 'Ключ', width: '104px' },
  { id: 'title', label: 'Название', width: 'minmax(300px, 1fr)' },
  { id: 'status', label: 'Статус', width: '150px' },
  { id: 'assignee', label: 'Исполнитель', width: '96px' },
  { id: 'priority', label: 'Приоритет', width: '76px' },
  { id: 'dueDate', label: 'Срок', width: '88px' },
  { id: 'labels', label: 'Метки', width: '190px' },
]

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export function TasksView({
  project,
  users,
  filters,
  onFiltersChange,
  search,
  onSearchChange,
  searchRef,
  onOpenTask,
  activeTaskId,
  onCreateTask,
}: {
  project: ProjectDetailDto
  users: UserDto[]
  filters: FiltersState
  onFiltersChange: (f: FiltersState) => void
  search: string
  onSearchChange: (s: string) => void
  searchRef?: React.RefObject<HTMLInputElement | null>
  onOpenTask: (id: string) => void
  activeTaskId: string | null
  onCreateTask: () => void
}) {
  const debouncedSearch = useDebounced(search.trim())
  const { data: tasks = [], isLoading } = useTasks(project.id, debouncedSearch || undefined)
  const qc = useQueryClient()
  const updateMut = useUpdateTask()
  const delMut = useDeleteTask()

  const [groupMode, setGroupMode] = useState<GroupMode>('status')
  const [sort, setSort] = useState<{ field: SortField; dir: 'asc' | 'desc' } | null>(null)
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set(['priority']))
  const [ctxMenu, setCtxMenu] = useState<{ pos: CtxPos; task: TaskRowDto } | null>(null)
  const [ctxSubmenu, setCtxSubmenu] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  // восстановление per-user состояния (ФТ-2.2, ФТ-2.3, ФТ-2.7)
  useEffect(() => {
    const apply = () => {
      try {
        const gm = prefGet(prefKey('groupMode')) as GroupMode | null
        if (gm === 'status' || gm === 'assignee' || gm === 'none') setGroupMode(gm)
        const ct = prefGet(prefKey(`collapsedTasks:${project.id}`))
        if (ct) setCollapsedTasks(new Set(JSON.parse(ct)))
        const cg = prefGet(prefKey(`collapsedGroups:${project.id}`))
        if (cg) setCollapsedGroups(new Set(JSON.parse(cg)))
        const hc = prefGet(prefKey('hiddenCols'))
        if (hc) setHiddenCols(new Set(JSON.parse(hc)))
      } catch {}
    }
    const raf = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(raf)
  }, [project.id])

  const persistCollapsedTasks = (s: Set<string>) => {
    setCollapsedTasks(s)
    try {
      prefSet(prefKey(`collapsedTasks:${project.id}`), JSON.stringify([...s]))
    } catch {}
  }
  const persistCollapsedGroups = (s: Set<string>) => {
    setCollapsedGroups(s)
    try {
      prefSet(prefKey(`collapsedGroups:${project.id}`), JSON.stringify([...s]))
    } catch {}
  }

  const statusById = useMemo(() => new Map(project.statuses.map((s) => [s.id, s])), [project.statuses])
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  const searchActive = !!debouncedSearch

  // видимость с предками (ФТ-2.5)
  const visibility = useMemo(
    () => visibleTasksWithAncestors(tasks, filters, searchActive),
    [tasks, filters, searchActive]
  )

  const shownCount = useMemo(
    () => [...visibility.values()].filter((v) => v.visible && !v.grayed).length,
    [visibility]
  )

  // сортировка корней + вложенность (ФТ-2.4)
  const sortedTasks = useMemo(() => {
    if (!sort) return tasks
    const dir = sort.dir === 'asc' ? 1 : -1
    const cmp = (a: TaskRowDto, b: TaskRowDto): number => {
      switch (sort.field) {
        case 'key':
          return (a.number - b.number) * dir
        case 'title':
          return a.title.localeCompare(b.title, 'ru') * dir
        case 'status': {
          const oa = statusById.get(a.statusId)?.order ?? 0
          const ob = statusById.get(b.statusId)?.order ?? 0
          return (oa - ob) * dir
        }
        case 'assignee': {
          const na = a.assigneeId ? (userById.get(a.assigneeId)?.name ?? '') : 'яя'
          const nb = b.assigneeId ? (userById.get(b.assigneeId)?.name ?? '') : 'яя'
          return na.localeCompare(nb, 'ru') * dir
        }
        case 'priority':
          return ((PRIORITY_ORDER[a.priority] ?? 0) - (PRIORITY_ORDER[b.priority] ?? 0)) * dir
        case 'dueDate': {
          // пустые всегда вниз (ФТ-2.4)
          if (!a.dueDate && !b.dueDate) return 0
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()) * dir
        }
        case 'createdAt':
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir
        default:
          return 0
      }
    }
    // сортируем внутри «братьев», сохраняя дерево
    const byParent = new Map<string | null, TaskRowDto[]>()
    for (const t of tasks) {
      const arr = byParent.get(t.parentId) ?? []
      arr.push(t)
      byParent.set(t.parentId, arr)
    }
    for (const arr of byParent.values()) arr.sort(cmp)
    const out: TaskRowDto[] = []
    const emit = (parent: string | null) => {
      for (const t of byParent.get(parent) ?? []) {
        out.push(t)
        emit(t.id)
      }
    }
    emit(null)
    return out
  }, [tasks, sort, statusById, userById])

  // строки: группы + задачи с отступами
  const rows = useMemo<Row[]>(() => {
    const visibleList = sortedTasks.filter((t) => visibility.has(t.id))
    const taskRow = (t: TaskRowDto, depth: number): TaskRow[] => {
      const info = visibility.get(t.id)!
      const expanded = !collapsedTasks.has(t.id)
      const self: TaskRow = {
        kind: 'task',
        task: t,
        depth,
        grayed: info.grayed,
        expanded,
        selected: selectedId === t.id,
      }
      if (!expanded) return [self]
      const children = visibleList.filter((c) => c.parentId === t.id)
      const childRows: TaskRow[] = []
      for (const c of children) childRows.push(...taskRow(c, depth + 1))
      return [self, ...childRows]
    }

    if (groupMode === 'none') {
      return visibleList.filter((t) => !t.parentId || !visibility.has(t.parentId)).flatMap((t) => taskRow(t, 0))
    }

    // группировка (ФТ-2.3)
    interface GroupDef { key: string; label: string; color?: string; avatar?: React.ReactNode; order: number }
    let groups: GroupDef[]
    if (groupMode === 'status') {
      groups = project.statuses.map((s) => ({ key: s.id, label: s.name, color: s.color, order: s.order }))
    } else {
      groups = [
        ...users.map((u) => ({ key: u.id, label: u.name, avatar: <UserAvatar user={u} size={18} />, order: 0 })),
        { key: 'none', label: 'Не назначен', avatar: <UserAvatar user={null} size={18} />, order: 1 },
      ]
    }

    const out: Row[] = []
    for (const g of groups) {
      const members = visibleList.filter((t) =>
        groupMode === 'status'
          ? t.statusId === g.key
          : t.assigneeId === g.key || (g.key === 'none' && !t.assigneeId)
      )
      if (members.length === 0) continue
      // внутри группы: сначала корни группы (задачи, чей родитель не в этой группе)
      const inGroup = new Set(members.map((m) => m.id))
      const top = members.filter((t) => !t.parentId || !inGroup.has(t.parentId))
      const body: TaskRow[] = []
      const emitGroup = (t: TaskRowDto, depth: number) => {
        const info = visibility.get(t.id)!
        body.push({ kind: 'task', task: t, depth, grayed: info.grayed, expanded: !collapsedTasks.has(t.id), selected: selectedId === t.id })
        if (collapsedTasks.has(t.id)) return
        for (const c of members) if (c.parentId === t.id) emitGroup(c, depth + 1)
      }
      top.forEach((t) => emitGroup(t, 0))
      out.push({ kind: 'group', key: g.key, label: g.label, count: members.length, collapsed: collapsedGroups.has(g.key), color: g.color, avatar: g.avatar })
      if (!collapsedGroups.has(g.key)) out.push(...body)
    }
    return out
  }, [sortedTasks, visibility, collapsedTasks, collapsedGroups, groupMode, project.statuses, users, selectedId])

  // виртуализация (НФТ: 5000 задач)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].kind === 'group' ? 38 : 42),
    overscan: 12,
  })

  // клавиатурная навигация по строкам (ФТ-2.10)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return
      if (e.code !== 'ArrowDown' && e.code !== 'ArrowUp' && e.code !== 'Enter') return
      const taskRows = rows.filter((r): r is TaskRow => r.kind === 'task')
      if (taskRows.length === 0) return
      const idx = taskRows.findIndex((r) => r.task.id === selectedId)
      if (e.code === 'ArrowDown') {
        e.preventDefault()
        const next = idx < 0 ? 0 : Math.min(idx + 1, taskRows.length - 1)
        setSelectedId(taskRows[next].task.id)
        scrollToTask(taskRows[next].task.id)
      } else if (e.code === 'ArrowUp') {
        e.preventDefault()
        const next = idx < 0 ? taskRows.length - 1 : Math.max(idx - 1, 0)
        setSelectedId(taskRows[next].task.id)
        scrollToTask(taskRows[next].task.id)
      } else if (e.code === 'Enter' && selectedId) {
        e.preventDefault()
        onOpenTask(selectedId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rows, selectedId, onOpenTask])

  function scrollToTask(taskId: string) {
    const rowIndex = rows.findIndex((r) => r.kind === 'task' && r.task.id === taskId)
    if (rowIndex >= 0) virtualizer.scrollToIndex(rowIndex, { align: 'auto' })
  }

  const visibleColumns = COLUMNS.filter((c) => !hiddenCols.has(c.id) || c.id === 'type' || c.id === 'title')
  const gridTemplate = visibleColumns.map((c) => c.width).join(' ')

  function toggleSort(field: SortField) {
    setSort((prev) => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' }
      if (prev.dir === 'asc') return { field, dir: 'desc' }
      return null
    })
  }

  function highlight(text: string): React.ReactNode {
    if (!searchActive) return text
    const q = debouncedSearch.toLowerCase()
    const idx = text.toLowerCase().indexOf(q)
    if (idx < 0) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/40">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  // ---- Действия над задачей из ПКМ (дублируются как кнопки/меню панели задачи) ----
  function closeCtx() { setCtxMenu(null); setCtxSubmenu(null) }

  async function duplicateTask(t: TaskRowDto) {
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: t.type,
          title: `${t.title} (копия)`,
          statusId: t.statusId,
          assigneeId: t.assigneeId,
          priority: t.priority,
          dueDate: t.dueDate,
          labels: t.labels,
          parentId: t.parentId,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Не удалось дублировать')
      const created = await res.json()
      qc.invalidateQueries({ queryKey: ['tasks', project.id] })
      qc.invalidateQueries({ queryKey: ['project', project.id] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success(`Создана копия ${created.key}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function copyKey(t: TaskRowDto) {
    if (await copyToClipboard(t.key)) toast.success('Ключ скопирован')
    else toast.error('Не удалось скопировать')
  }

  async function copyLink(t: TaskRowDto) {
    const url = `${window.location.origin}/?project=${project.id}&tab=tasks&task=${t.id}`
    if (await copyToClipboard(url)) toast.success('Ссылка скопирована')
    else toast.error('Не удалось скопировать')
  }

  function patchField(t: TaskRowDto, field: 'statusId' | 'priority' | 'assigneeId', value: string | null) {
    updateMut.mutate(
      { id: t.id, projectId: project.id, [field]: value },
      { onError: (e) => toast.error(e.message) }
    )
  }

  function markDone(t: TaskRowDto) {
    const done = [...project.statuses].filter((s) => s.category === 3).sort((a, b) => b.order - a.order)[0]
    if (done) patchField(t, 'statusId', done.id)
    else toast.error('В проекте нет статуса с категорией «Готово»')
  }

  function deleteTask(t: TaskRowDto) {
    if (!confirm(`Удалить задачу ${t.key}?\n\nПодзадачи открепятся, связи, вложения и комментарии удалятся.`)) return
    delMut.mutate(
      { id: t.id, projectId: project.id },
      { onSuccess: () => toast.success('Задача удалена'), onError: (e) => toast.error(e.message) }
    )
  }

  const nothingVisible = !isLoading && tasks.length > 0 && visibility.size === 0
  const isFiltered = searchActive || shownCount !== tasks.length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FiltersBar
        project={project}
        tasks={tasks}
        users={users}
        filters={filters}
        onFiltersChange={onFiltersChange}
        search={search}
        onSearchChange={onSearchChange}
        total={tasks.length}
        shown={shownCount}
        searchRef={searchRef}
      />

      {/* тулбар вьюхи: группировка + колонки */}
      <div className="flex items-center gap-2 border-b bg-background px-4 py-1.5 sm:px-6">
        <div className="flex items-center gap-1 rounded-lg border p-0.5" role="group" aria-label="Группировка">
          {(
            [
              ['status', 'По статусу'],
              ['assignee', 'По исполнителю'],
              ['none', 'Без группировки'],
            ] as [GroupMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setGroupMode(mode)
                try {
                  prefSet(prefKey('groupMode'), mode)
                } catch {}
              }}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                groupMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              aria-pressed={groupMode === mode}
            >
              {label}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto h-7 gap-1.5 text-xs">
              <Columns3 className="h-3.5 w-3.5" /> Колонки
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {COLUMNS.filter((c) => c.id !== 'type' && c.id !== 'title').map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={!hiddenCols.has(c.id)}
                onCheckedChange={(v) => {
                  const next = new Set(hiddenCols)
                  if (v) next.delete(c.id)
                  else next.add(c.id)
                  setHiddenCols(next)
                  try {
                    prefSet(prefKey('hiddenCols'), JSON.stringify([...next]))
                  } catch {}
                }}
                className="text-sm"
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* состояния (ФТ-2.11) */}
      {isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={<ListTodo className="h-10 w-10" />}
            title="В проекте пока нет задач"
            description="Создайте первую задачу — она появится в списке, на доске и сможет стать нодой графа."
            action={
              <Button onClick={onCreateTask} className="gap-1.5">
                <Plus className="h-4 w-4" /> Создать задачу
              </Button>
            }
          />
        </div>
      ) : nothingVisible || (isFiltered && shownCount === 0) ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={<SearchX className="h-10 w-10" />}
            title="Ничего не найдено"
            description={
              searchActive
                ? `По запросу «${debouncedSearch}» ничего не найдено. Попробуйте другой запрос или сбросьте фильтры.`
                : 'Под текущие фильтры не подходит ни одна задача.'
            }
          />
        </div>
      ) : (
        <div ref={scrollRef} className="custom-scroll min-h-0 flex-1 overflow-auto">
          {/* Заголовок таблицы (ФТ-2.1) */}
          <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
            <div className="grid min-w-[1050px] items-center px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground" style={{ gridTemplateColumns: gridTemplate }}>
              <span className="w-8" />
              <SortHeader label="Ключ" field="key" sort={sort} onToggle={toggleSort} />
              <SortHeader label="Название" field="title" sort={sort} onToggle={toggleSort} />
              {!hiddenCols.has('status') && <SortHeader label="Статус" field="status" sort={sort} onToggle={toggleSort} />}
              {!hiddenCols.has('assignee') && <SortHeader label="Исполнитель" field="assignee" sort={sort} onToggle={toggleSort} />}
              {!hiddenCols.has('priority') && <SortHeader label="Приоритет" field="priority" sort={sort} onToggle={toggleSort} />}
              {!hiddenCols.has('dueDate') && <SortHeader label="Срок" field="dueDate" sort={sort} onToggle={toggleSort} />}
              {!hiddenCols.has('labels') && <span className="pl-2">Метки</span>}
            </div>
          </div>

          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', minWidth: 1050 }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index]
              const start = vi.start
              if (row.kind === 'group') {
                return (
                  <div
                    key={`g-${row.key}`}
                    className="absolute left-0 right-0 flex h-[38px] items-center gap-2 border-b bg-muted/40 px-2"
                    style={{ top: start, transform: 'translateY(0)' }}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-[13px] font-semibold hover:bg-muted/70"
                      onClick={() => {
                        const next = new Set(collapsedGroups)
                        if (next.has(row.key)) next.delete(row.key)
                        else next.add(row.key)
                        persistCollapsedGroups(next)
                      }}
                      aria-expanded={!row.collapsed}
                    >
                      {row.collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      {row.avatar}
                      {row.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} aria-hidden />}
                      <span className="truncate">{row.label}</span>
                      <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] font-normal text-muted-foreground">{row.count}</Badge>
                    </button>
                  </div>
                )
              }
              const t = row.task
              const status = statusById.get(t.statusId)
              const assignee = t.assigneeId ? userById.get(t.assigneeId) : null
              const overdue = isOverdue(t.dueDate, status?.category ?? 0)
              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={-1}
                  aria-label={`Задача ${t.key}: ${t.title}`}
                  onClick={() => {
                    setSelectedId(t.id)
                    onOpenTask(t.id)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setSelectedId(t.id)
                    setCtxMenu({ pos: { x: e.clientX, y: e.clientY }, task: t })
                  }}
                  className={cn(
                    'absolute left-0 right-0 grid h-[42px] cursor-pointer items-center border-b px-2 text-sm transition-colors hover:bg-muted/50',
                    activeTaskId === t.id && 'bg-teal-50 dark:bg-teal-950/30',
                    selectedId === t.id && activeTaskId !== t.id && 'bg-muted/70',
                    row.grayed && 'opacity-50'
                  )}
                  style={{ top: start, gridTemplateColumns: gridTemplate }}
                >
                  {/* тип + шеврон иерархии */}
                  <span className="flex w-8 items-center justify-center" style={{ paddingLeft: row.depth * 16 }}>
                    {t.hasChildren && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          const next = new Set(collapsedTasks)
                          if (next.has(t.id)) next.delete(t.id)
                          else next.add(t.id)
                          persistCollapsedTasks(next)
                        }}
                        className="mr-0.5 rounded p-0.5 hover:bg-muted"
                        aria-label={row.expanded ? `Свернуть подзадачи ${t.key}` : `Развернуть подзадачи ${t.key}`}
                        aria-expanded={row.expanded}
                      >
                        {row.expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    )}
                    <TypeIcon type={t.type} />
                  </span>
                  <span className="pl-1 font-mono text-xs text-muted-foreground">{t.key}</span>
                  <span className={cn('flex min-w-0 items-center gap-1.5 pl-2 pr-3', t.type === 'epic' && 'font-medium')}>
                    <span className="truncate">{highlight(t.title)}</span>
                    {t.commentCount > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={`${t.commentCount} комментариев`}>
                        <MessageSquare className="h-2.5 w-2.5" /> {t.commentCount}
                      </span>
                    )}
                    {t.attachmentCount > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={`${t.attachmentCount} вложений`}>
                        <Paperclip className="h-2.5 w-2.5" /> {t.attachmentCount}
                      </span>
                    )}
                  </span>
                  {!hiddenCols.has('status') && (
                    <span className="pl-2">
                      {status && <StatusBadge name={status.name} color={status.color} className="max-w-[130px] truncate" />}
                    </span>
                  )}
                  {!hiddenCols.has('assignee') && (
                    <span className="pl-3">
                      <UserAvatar user={assignee} size={22} />
                    </span>
                  )}
                  {!hiddenCols.has('priority') && (
                    <span className="pl-3">
                      <PriorityIcon priority={t.priority} />
                    </span>
                  )}
                  {!hiddenCols.has('dueDate') && (
                    <span className={cn('pl-2 text-xs', overdue ? 'font-medium text-red-600' : 'text-muted-foreground')}>
                      {t.dueDate ? formatDate(t.dueDate) : '—'}
                    </span>
                  )}
                  {!hiddenCols.has('labels') && (
                    <span className="flex min-w-0 items-center gap-1 overflow-hidden pl-2">
                      {t.labels.slice(0, 3).map((l) => (
                        <LabelChip key={l} label={l} />
                      ))}
                      {t.labels.length > 3 && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">+{t.labels.length - 3}</span>
                      )}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {tasks.length > 0 && (
            <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
              <Kbd>↑</Kbd><Kbd>↓</Kbd> навигация <Kbd>Enter</Kbd> открыть <Kbd>N</Kbd> создать <Kbd>/</Kbd> поиск
            </div>
          )}
        </div>
      )}

      {/* Контекстное меню задачи по ПКМ */}
      {ctxMenu && (
        <>
          <CtxBackdrop onClose={closeCtx} />
          <CtxContainer pos={ctxMenu.pos} minWidth={240}>
            <CtxItem
              icon={<ArrowRight className="h-3.5 w-3.5" />}
              label="Открыть"
              onClick={() => { const t = ctxMenu.task; closeCtx(); onOpenTask(t.id) }}
            />
            <CtxItem
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              label="Открыть в новой вкладке"
              onClick={() => {
                const t = ctxMenu.task
                window.open(`/?project=${project.id}&tab=tasks&task=${t.id}`, '_blank', 'noopener')
                closeCtx()
              }}
            />
            <CtxItem
              icon={<CopyPlus className="h-3.5 w-3.5" />}
              label="Дублировать"
              onClick={() => { const t = ctxMenu.task; closeCtx(); duplicateTask(t) }}
            />
            <CtxSeparator />
            <CtxItem
              icon={<Copy className="h-3.5 w-3.5" />}
              label="Копировать ключ"
              onClick={() => { const t = ctxMenu.task; copyKey(t); closeCtx() }}
            />
            <CtxItem
              icon={<Copy className="h-3.5 w-3.5" />}
              label="Копировать ссылку"
              onClick={() => { const t = ctxMenu.task; copyLink(t); closeCtx() }}
            />
            <CtxSeparator />
            <CtxSubmenu
              open={ctxSubmenu === 'status'}
              onToggle={() => setCtxSubmenu(ctxSubmenu === 'status' ? null : 'status')}
              icon={<GitBranch className="h-3.5 w-3.5" />}
              label="Статус"
            >
              {project.statuses.map((s) => (
                <CtxItem
                  key={s.id}
                  dot={s.color}
                  label={s.name}
                  onClick={() => { const t = ctxMenu.task; patchField(t, 'statusId', s.id); closeCtx() }}
                />
              ))}
            </CtxSubmenu>
            <CtxSubmenu
              open={ctxSubmenu === 'priority'}
              onToggle={() => setCtxSubmenu(ctxSubmenu === 'priority' ? null : 'priority')}
              icon={<Flame className="h-3.5 w-3.5" />}
              label="Приоритет"
            >
              {PRIORITIES.map((p) => (
                <CtxItem
                  key={p}
                  label={PRIORITY_LABELS_RU[p]}
                  onClick={() => { const t = ctxMenu.task; patchField(t, 'priority', p); closeCtx() }}
                />
              ))}
            </CtxSubmenu>
            <CtxSubmenu
              open={ctxSubmenu === 'assignee'}
              onToggle={() => setCtxSubmenu(ctxSubmenu === 'assignee' ? null : 'assignee')}
              icon={<UserCircle2 className="h-3.5 w-3.5" />}
              label="Исполнитель"
            >
              {users.map((u) => (
                <CtxItem
                  key={u.id}
                  avatar={<UserAvatar user={u} size={16} />}
                  label={u.name}
                  onClick={() => { const t = ctxMenu.task; patchField(t, 'assigneeId', u.id); closeCtx() }}
                />
              ))}
              <CtxSeparator />
              <CtxItem
                label="Не назначен"
                onClick={() => { const t = ctxMenu.task; patchField(t, 'assigneeId', null); closeCtx() }}
              />
            </CtxSubmenu>
            <CtxSeparator />
            <CtxItem
              icon={<Check className="h-3.5 w-3.5 text-emerald-600" />}
              label="Готово"
              onClick={() => { const t = ctxMenu.task; closeCtx(); markDone(t) }}
            />
            <CtxSeparator />
            <CtxItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Удалить…"
              danger
              onClick={() => { const t = ctxMenu.task; closeCtx(); deleteTask(t) }}
            />
          </CtxContainer>
        </>
      )}
    </div>
  )
}

function SortHeader({
  label,
  field,
  sort,
  onToggle,
}: {
  label: string
  field: SortField
  sort: { field: SortField; dir: 'asc' | 'desc' } | null
  onToggle: (f: SortField) => void
}) {
  const active = sort?.field === field
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      className={cn(
        'flex items-center gap-1 truncate px-2 py-2 text-left transition-colors hover:text-foreground',
        active && 'text-foreground'
      )}
      aria-label={`Сортировать по: ${label}`}
    >
      {label}
      {active && <ChevronDown className={cn('h-3 w-3', sort!.dir === 'asc' && 'rotate-180')} />}
    </button>
  )
}
