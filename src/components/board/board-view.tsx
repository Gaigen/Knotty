const RAIL_GRID_THRESHOLD = 5
const BOARD_COL_WIDTH = 300
/** половина gap-3 между колонками — для дропа в зазор по X */
const BOARD_COL_GAP_PAD = 6

/** Курсор, не углы карточки; карточка важнее колонки; зазор между колонками по X */
const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  if (pointerHits.length > 0) {
    const cardHit = pointerHits.find((c) => !String(c.id).startsWith('col:'))
    return cardHit ? [cardHit] : [pointerHits[0]]
  }

  const pointer = args.pointerCoordinates
  if (pointer) {
    const columns = args.droppableContainers.filter((c) => String(c.id).startsWith('col:'))
    const xHit = columns.find((c) => {
      const rect = c.rect.current
      if (!rect) return false
      return (
        pointer.x >= rect.left - BOARD_COL_GAP_PAD &&
        pointer.x <= rect.right + BOARD_COL_GAP_PAD
      )
    })
    if (xHit) return [{ id: xHit.id, data: xHit.data }]
  }

  return closestCenter(args)
}

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, closestCenter, pointerWithin, useDroppable, useSensor,
  useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CalendarClock, ChevronsLeft, ChevronsRight, MessageSquare, MonitorSmartphone, Paperclip, Plus, StretchHorizontal,
  ArrowRight, Check, Copy, CopyPlus, ExternalLink, Flame, GitBranch, Trash2, UserCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FiltersBar, matchesClientFilters, type FiltersState } from '@/components/project/filters'
import { EmptyState, LabelChip, PriorityIcon, TypeIcon, UserAvatar } from '@/components/shared/bits'
import {
  CtxBackdrop, CtxContainer, CtxItem, CtxSeparator, CtxSubmenu, type CtxPos,
} from '@/components/shared/context-menu-helpers'
import { copyToClipboard, useDeleteTask, useTasks, useUpdateTask, useUsers } from '@/lib/api'
import { PRIORITIES, PRIORITY_LABELS_RU } from '@/lib/config'
import { formatDate, isOverdue } from '@/lib/format'
import { cn } from '@/lib/utils'
import { prefGet, prefKey, prefSet } from '@/lib/prefs'
import { generateKeyBetween } from 'fractional-indexing'
import type { ProjectDetailDto, TaskRowDto, UserDto } from '@/lib/types'

/**
 * Канбан (ФТ-4.1–4.8). Порядок в колонке — дробный ключ boardOrder (п. 4.3):
 * перемещение между соседями вычисляет ключ между их ключами, соседи не пересчитываются.
 */
export function BoardView({
  project,
  users,
  filters,
  onFiltersChange,
  search,
  onSearchChange,
  searchRef,
  onOpenTask,
  activeTaskId,
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
}) {
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: tasks = [], isLoading } = useTasks(project.id, debounced || undefined)
  const { data: allTasks = [] } = useTasks(project.id)
  const update = useUpdateTask()
  const delMut = useDeleteTask()
  const qc = useQueryClient()

  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set())
  const [activeCard, setActiveCard] = useState<TaskRowDto | null>(null)
  const [highlightCol, setHighlightCol] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  // «Все колонки»: компактные колонки на экране (+ 2 ряда при >5 статусов)
  const [fitAll, setFitAll] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const railHostRef = useRef<HTMLDivElement>(null)
  // ПКМ-меню карточки
  const [ctxMenu, setCtxMenu] = useState<{ pos: CtxPos; task: TaskRowDto } | null>(null)
  const [ctxSubmenu, setCtxSubmenu] = useState<string | null>(null)

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
    const url = `${window.location.origin}/?project=${project.id}&tab=board&task=${t.id}`
    if (await copyToClipboard(url)) toast.success('Ссылка скопирована')
    else toast.error('Не удалось скопировать')
  }

  function patchField(t: TaskRowDto, field: 'statusId' | 'priority' | 'assigneeId', value: string | null) {
    update.mutate(
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

  useEffect(() => {
    const apply = () => {
      try {
        const fit = prefGet(prefKey('boardFitAll')) === '1'
        setFitAll(fit)
        if (fit) {
          setCollapsedCols(new Set())
        } else {
          const cc = prefGet(prefKey(`collapsedCols:${project.id}`))
          if (cc) setCollapsedCols(new Set(JSON.parse(cc)))
        }
      } catch {}
    }
    const raf = requestAnimationFrame(apply)
    const mq = window.matchMedia('(max-width: 767px)')
    const applyMq = () => setIsMobile(mq.matches)
    const raf2 = requestAnimationFrame(applyMq)
    const fn = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', fn)
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(raf2)
      mq.removeEventListener('change', fn)
    }
  }, [project.id])

  function toggleFitAll() {
    setFitAll((v) => {
      const next = !v
      try {
        prefSet(prefKey('boardFitAll'), next ? '1' : '0')
      } catch {}
      if (next) {
        setCollapsedCols(new Set())
        persistCols(project.id, new Set())
      }
      return next
    })
  }

  const statusById = useMemo(() => new Map(project.statuses.map((s) => [s.id, s])), [project.statuses])
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  const searchActive = !!debounced
  const visible = useMemo(
    () => tasks.filter((t) => matchesClientFilters(t, filters) && (!searchActive || t.matches !== false)),
    [tasks, filters, searchActive]
  )
  const shownCount = visible.length

  const columns = useMemo(
    () =>
      project.statuses.map((s) => ({
        status: s,
        cards: visible.filter((t) => t.statusId === s.id).sort((a, b) => (a.boardOrder < b.boardOrder ? -1 : 1)),
      })),
    [project.statuses, visible]
  )

  // фиксированная ширина в обычном виде; в «все колонки» — равномерная сетка
  const colWidth = BOARD_COL_WIDTH
  const fitAllRows = fitAll && project.statuses.length > RAIL_GRID_THRESHOLD ? 2 : 1
  const fitAllGridCols = fitAll ? Math.ceil(project.statuses.length / fitAllRows) : 0

  function renderColumn({ status, cards }: { status: ProjectDetailDto['statuses'][number]; cards: TaskRowDto[] }) {
    if (fitAll) {
      return (
        <BoardColumn
          key={status.id}
          status={status}
          cards={cards}
          compact
          users={users}
          userById={userById}
          statusById={statusById}
          highlight={highlightCol === status.id}
          activeTaskId={activeTaskId}
          onOpenTask={onOpenTask}
          onCollapse={() => {}}
          onQuickAdd={(title) =>
            fetch(`/api/projects/${project.id}/tasks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, statusId: status.id, type: 'task' }),
            })
              .then(async (r) => {
                if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Ошибка создания')
                qc.invalidateQueries({ queryKey: ['tasks', project.id] })
                qc.invalidateQueries({ queryKey: ['projects'] })
              })
              .catch((e) => toast.error((e as Error).message))
          }
          onPatchCard={(id, body) =>
            update.mutate(
              { id, projectId: project.id, ...body },
              { onError: (e) => toast.error(e.message) }
            )
          }
          onContextMenu={(e, t) => {
            e.preventDefault()
            setCtxMenu({ pos: { x: e.clientX, y: e.clientY }, task: t })
          }}
        />
      )
    }

    if (!collapsedCols.has(status.id)) {
      return (
        <BoardColumn
          key={status.id}
          status={status}
          cards={cards}
          colWidth={colWidth}
          users={users}
          userById={userById}
          statusById={statusById}
          highlight={highlightCol === status.id}
          activeTaskId={activeTaskId}
          onOpenTask={onOpenTask}
          allowCollapse
          onCollapse={() => {
            const next = new Set(collapsedCols)
            next.add(status.id)
            setCollapsedCols(next)
            persistCols(project.id, next)
          }}
          onQuickAdd={(title) =>
            fetch(`/api/projects/${project.id}/tasks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, statusId: status.id, type: 'task' }),
            })
              .then(async (r) => {
                if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Ошибка создания')
                qc.invalidateQueries({ queryKey: ['tasks', project.id] })
                qc.invalidateQueries({ queryKey: ['projects'] })
              })
              .catch((e) => toast.error((e as Error).message))
          }
          onPatchCard={(id, body) =>
            update.mutate(
              { id, projectId: project.id, ...body },
              { onError: (e) => toast.error(e.message) }
            )
          }
          onContextMenu={(e, t) => {
            e.preventDefault()
            setCtxMenu({ pos: { x: e.clientX, y: e.clientY }, task: t })
          }}
        />
      )
    }

    return (
      <CollapsedColumn
        key={status.id}
        status={status}
        count={cards.length}
        onExpand={() => {
          const next = new Set(collapsedCols)
          next.delete(status.id)
          setCollapsedCols(next)
          persistCols(project.id, next)
        }}
      />
    )
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  // Колёсико: в колонке — вертикальный скролл; иначе горизонталь (мгновенно, как Shift+wheel)
  useEffect(() => {
    const host = railHostRef.current
    const rail = scrollRef.current
    if (!host || !rail || fitAll) return

    function wheelStep(e: WheelEvent): number {
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * 16
      if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * rail.clientWidth * 0.85
      return e.deltaY
    }

    function onWheel(e: WheelEvent) {
      if (e.shiftKey) return
      if (rail.scrollWidth <= rail.clientWidth + 1) return
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return

      const colScroll = (e.target as HTMLElement).closest('[data-board-col-scroll]')
      if (colScroll instanceof HTMLElement) {
        const maxScroll = colScroll.scrollHeight - colScroll.clientHeight
        if (maxScroll > 2) {
          if (e.deltaY > 0 && colScroll.scrollTop < maxScroll - 1) return
          if (e.deltaY < 0 && colScroll.scrollTop > 0) return
        }
      }

      e.preventDefault()
      rail.scrollLeft += wheelStep(e)
    }

    host.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => host.removeEventListener('wheel', onWheel, { capture: true })
  }, [fitAll, project.statuses.length])

  function setCache(next: TaskRowDto[]) {
    qc.setQueryData(['tasks', project.id, debounced ?? ''], next)
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id)
    setActiveCard(tasks.find((t) => t.id === id) ?? null)
  }

  function onDragOver(e: DragOverEvent) {
    const overId = e.over?.id ? String(e.over.id) : null
    if (!overId) return setHighlightCol(null)
    setHighlightCol(overId.startsWith('col:') ? overId.slice(4) : tasks.find((t) => t.id === overId)?.statusId ?? null)
  }

  function onDragEnd(e: DragEndEvent) {
    setHighlightCol(null)
    setActiveCard(null)
    const { active, over } = e
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const task = tasks.find((t) => t.id === activeId)
    if (!task) return

    let targetStatusId = task.statusId
    let prevKey: string | null = null
    let nextKey: string | null = null

    // fix: соседей для ключа берём из ПОЛНОГО списка, а не отфильтрованного —
    // иначе при активном поиске/фильтрах ключ может совпасть со скрытой карточкой
    const keySource = allTasks.length > 0 ? allTasks : tasks

    if (overId.startsWith('col:')) {
      targetStatusId = overId.slice(4)
      // в конец колонки — после реальной последней карточки (не «a0» вслепую)
      const colCards = keySource
        .filter((t) => t.statusId === targetStatusId)
        .sort((a, b) => (a.boardOrder < b.boardOrder ? -1 : 1))
      prevKey = colCards[colCards.length - 1]?.boardOrder ?? null
      nextKey = null
    } else {
      const overTask = tasks.find((t) => t.id === overId)
      if (!overTask) return
      targetStatusId = overTask.statusId
      // выше или ниже карточки-цели — по позиции указателя относительно середины
      const rect = over.rect
      const isBelow = e.active.rect.current.translated && rect
        ? e.active.rect.current.translated.top > rect.top + rect.height / 2
        : false
      const colCards = keySource
        .filter((t) => t.statusId === targetStatusId)
        .sort((a, b) => (a.boardOrder < b.boardOrder ? -1 : 1))
      const overIdx = colCards.findIndex((c) => c.id === overTask.id)
      if (isBelow) {
        prevKey = overTask.boardOrder
        nextKey = colCards[overIdx + 1]?.boardOrder ?? null
      } else {
        prevKey = colCards[overIdx - 1]?.boardOrder ?? null
        nextKey = overTask.boardOrder
      }
    }

    const sameColumn = targetStatusId === task.statusId
    if (sameColumn && overId === activeId) return

    // ключ между соседями (п. 4.3) — соседи не пересчитываются
    let newKey: string
    try {
      newKey = generateKeyBetween(prevKey, nextKey)
    } catch {
      newKey = generateKeyBetween(null, null)
    }

    // оптимистичное обновление кэша, затем PATCH
    const nextTasks = [...tasks]
    const idx = nextTasks.findIndex((t) => t.id === task.id)
    if (idx >= 0) {
      nextTasks[idx] = { ...task, statusId: targetStatusId, boardOrder: newKey }
      setCache(nextTasks)
    }
    update.mutate(
      { id: task.id, projectId: project.id, statusId: targetStatusId, boardOrder: newKey },
      {
        onError: (err) => {
          toast.error(err.message)
          qc.invalidateQueries({ queryKey: ['tasks', project.id] })
        },
      }
    )
  }

  if (isMobile) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<MonitorSmartphone className="h-10 w-10" />}
          title="Доска доступна с компьютера"
          description="Канбан с перетаскиванием карточек рассчитан на большой экран. Откройте раздел «Задачи» — он адаптирован под мобильные."
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <FiltersBar
        project={project}
        tasks={allTasks}
        users={users}
        filters={filters}
        onFiltersChange={onFiltersChange}
        search={search}
        onSearchChange={onSearchChange}
        total={allTasks.length}
        shown={shownCount}
        searchRef={searchRef}
      >
        {/* «Все колонки» — компактные колонки на экране; >5 статусов — в 2 ряда */}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-1.5 px-2.5',
            fitAll && 'border-teal-700/60 bg-teal-50 text-teal-800 hover:bg-teal-50 dark:bg-teal-950/40 dark:text-teal-300'
          )}
          onClick={toggleFitAll}
          aria-pressed={fitAll}
          title={
            fitAll
              ? 'Обычный вид доски'
              : 'Все статусы на экране (компактные колонки, перетаскивание между ними)'
          }
        >
          <StretchHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{fitAll ? 'Обычный вид' : 'Все колонки'}</span>
        </Button>
      </FiltersBar>

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden p-4">
          {project.statuses.map((s) => (
            <div key={s.id} className="w-[300px] shrink-0 space-y-2">
              <div className="h-8 animate-pulse rounded-lg bg-muted" />
              <div className="h-20 animate-pulse rounded-lg bg-muted" />
              <div className="h-20 animate-pulse rounded-lg bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <div ref={railHostRef} className="relative min-h-0 min-w-0 flex-1 basis-0">
          <DndContext
            sensors={sensors}
            collisionDetection={boardCollisionDetection}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
          >
            <div
              ref={scrollRef}
              className={cn(
                'custom-scroll absolute inset-0',
                fitAll
                  ? 'grid min-h-0 overflow-hidden p-4 gap-3'
                  : 'overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x'
              )}
              style={
                fitAll
                  ? {
                      gridTemplateColumns: `repeat(${fitAllGridCols}, minmax(0, 1fr))`,
                      gridTemplateRows:
                        fitAllRows === 2 ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
                    }
                  : undefined
              }
            >
              <div
                className={cn(
                  fitAll
                    ? 'contents'
                    : 'flex h-full min-h-0 w-max max-w-none flex-row flex-nowrap items-stretch gap-3 p-4'
                )}
              >
                {columns.map(renderColumn)}
              </div>
            </div>

            {/* «призрак» карточки (ФТ-4.3) */}
            <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
              {activeCard && (
                <div className="rotate-2 opacity-90 shadow-2xl" style={{ width: fitAll ? 168 : colWidth - 16 }}>
                  <BoardCard task={activeCard} users={users} userById={userById} statusById={statusById} ghost />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Контекстное меню карточки по ПКМ */}
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
                window.open(`/?project=${project.id}&tab=board&task=${t.id}`, '_blank', 'noopener')
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

function persistCols(projectId: string, cols: Set<string>) {
  try {
    prefSet(prefKey(`collapsedCols:${projectId}`), JSON.stringify([...cols]))
  } catch {}
}

function CollapsedColumn({
  status,
  count,
  onExpand,
}: {
  status: { id: string; name: string; color: string }
  count: number
  onExpand: () => void
}) {
  // fix: свёрнутая колонка — полноправная зона drops: карточка меняет статус,
  // при этом клик по полоске по-прежнему разворачивает колонку
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status.id}` })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-0 max-h-full w-12 shrink-0 flex-col items-center gap-2 self-stretch rounded-xl border bg-muted/40 py-3 transition-colors hover:bg-muted',
        isOver && 'border-teal-600/70 bg-teal-50/70 dark:bg-teal-950/25'
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        className="flex h-full w-full min-h-0 flex-col items-center gap-2 py-0"
        aria-label={`Развернуть колонку ${status.name}`}
      >
        <ChevronsRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
        <span className="max-h-full truncate text-center text-[11px] font-medium leading-tight [writing-mode:vertical-rl]">
          {status.name}
        </span>
        <Badge variant="secondary" className="shrink-0 text-[10px]">{count}</Badge>
      </button>
    </div>
  )
}

interface ColumnProps {
  status: ProjectDetailDto['statuses'][number]
  cards: TaskRowDto[]
  colWidth?: number
  compact?: boolean
  users: UserDto[]
  userById: Map<string, UserDto>
  statusById: Map<string, { id: string; name: string; color: string; category: number }>
  highlight: boolean
  activeTaskId: string | null
  onOpenTask: (id: string) => void
  allowCollapse?: boolean
  onCollapse: () => void
  onQuickAdd: (title: string) => void
  onPatchCard: (id: string, body: Record<string, unknown>) => void
  onContextMenu: (e: React.MouseEvent, task: TaskRowDto) => void
}

function BoardColumn({
  status,
  cards,
  colWidth,
  compact = false,
  users,
  userById,
  statusById,
  highlight,
  activeTaskId,
  onOpenTask,
  allowCollapse = true,
  onCollapse,
  onQuickAdd,
  onPatchCard,
  onContextMenu,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status.id}` })
  const [quickAdd, setQuickAdd] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')
  // fix: ref-хранение черновика — единственный источник для onBlur,
  // чтобы Enter/Escape и последующий blur не создавали задачу дважды
  const quickTitleRef = useRef('')
  const quickInputRef = useRef<HTMLTextAreaElement>(null)

  function commitQuickAdd() {
    const t = quickTitleRef.current.trim()
    quickTitleRef.current = ''
    setQuickTitle('')
    setQuickAdd(false)
    if (t) onQuickAdd(t)
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-0 max-h-full flex-col rounded-xl border bg-muted/40 transition-colors',
        compact ? 'min-w-0 w-full' : 'shrink-0 grow-0',
        highlight && isOver && 'border-teal-600/60 bg-teal-50/60 dark:bg-teal-950/20'
      )}
      style={compact ? undefined : { width: colWidth ?? BOARD_COL_WIDTH, flexBasis: colWidth ?? BOARD_COL_WIDTH }}
      aria-label={`Колонка ${status.name}`}
    >
      {/* Заголовок колонки (ФТ-4.1) */}
      <div className={cn('flex items-center gap-1.5 pb-1 pt-2', compact ? 'px-2' : 'px-3 pt-2.5')}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: status.color }} aria-hidden />
        <span className={cn('truncate font-semibold', compact ? 'text-xs' : 'text-sm')}>{status.name}</span>
        <Badge
          variant="secondary"
          className={cn(
            'font-normal text-muted-foreground',
            compact ? 'h-4 px-1 text-[10px]' : 'h-5 px-1.5 text-[11px]'
          )}
        >
          {cards.length}
        </Badge>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={compact ? 'h-5 w-5' : 'h-6 w-6'}
            onClick={() => setQuickAdd(true)}
            aria-label={`Добавить задачу в «${status.name}»`}
          >
            <Plus className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          </Button>
          {allowCollapse && !compact && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCollapse} aria-label={`Свернуть колонку ${status.name}`}>
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* быстрая карточка (ФТ-4.5) */}
      {quickAdd && (
        <div className="px-2 pb-1">
          <textarea
            ref={quickInputRef}
            autoFocus
            value={quickTitle}
            onChange={(e) => {
              setQuickTitle(e.target.value)
              quickTitleRef.current = e.target.value
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                quickInputRef.current?.blur() // создание — только в onBlur, одним путём
              }
              if (e.key === 'Escape') {
                quickTitleRef.current = ''
                setQuickAdd(false)
                setQuickTitle('')
              }
            }}
            onBlur={commitQuickAdd}
            rows={2}
            placeholder="Название задачи, Enter — создать"
            className="w-full resize-none rounded-lg border bg-background p-2 text-sm outline-none ring-ring focus:ring-1"
          />
        </div>
      )}

      {/* карточки */}
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div
          data-board-col-scroll
          className={cn(
            'custom-scroll touch-pan-y flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain',
            compact ? 'gap-1.5 p-1.5' : 'gap-2 p-2'
          )}
        >
          {cards.map((c) => (
            <SortableCard
              key={c.id}
              task={c}
              compact={compact}
              users={users}
              userById={userById}
              statusById={statusById}
              onOpenTask={onOpenTask}
              active={activeTaskId === c.id}
              onPatchCard={onPatchCard}
              onContextMenu={onContextMenu}
            />
          ))}
          {cards.length === 0 && !quickAdd && (
            <button
              type="button"
              onClick={() => setQuickAdd(true)}
              className="rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground transition-colors hover:bg-muted/60"
            >
              Перетащите карточку или создайте новую
            </button>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableCard({
  task,
  compact = false,
  users,
  userById,
  statusById,
  onOpenTask,
  active,
  onPatchCard,
  onContextMenu,
}: {
  task: TaskRowDto
  compact?: boolean
  users: UserDto[]
  userById: Map<string, UserDto>
  statusById: Map<string, { id: string; name: string; color: string; category: number }>
  onOpenTask: (id: string) => void
  active: boolean
  onPatchCard: (id: string, body: Record<string, unknown>) => void
  onContextMenu: (e: React.MouseEvent, task: TaskRowDto) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const assignee = task.assigneeId ? userById.get(task.assigneeId) : null
  const status = statusById.get(task.statusId)
  const overdue = isOverdue(task.dueDate, status?.category ?? 0)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
      onContextMenu={(e) => onContextMenu(e, task)}
    >
      <BoardCard
        task={task}
        compact={compact}
        users={users}
        userById={userById}
        statusById={statusById}
        active={active}
        overdue={overdue}
        assignee={assignee}
        onOpenTask={onOpenTask}
        onPatchCard={onPatchCard}
      />
    </div>
  )
}

/** Карточка канбана (ФТ-4.2) + быстрые действия на hover (ФТ-4.4) */
function BoardCard({
  task,
  compact = false,
  users,
  userById,
  statusById,
  active,
  overdue,
  assignee,
  onOpenTask,
  onPatchCard,
  ghost,
}: {
  task: TaskRowDto
  compact?: boolean
  users: UserDto[]
  userById: Map<string, UserDto>
  statusById: Map<string, { id: string; name: string; color: string; category: number }>
  active?: boolean
  overdue?: boolean
  assignee?: UserDto | null
  onOpenTask?: (id: string) => void
  onPatchCard?: (id: string, body: Record<string, unknown>) => void
  ghost?: boolean
}) {
  const status = statusById.get(task.statusId)

  return (
    <div
      onClick={() => !ghost && onOpenTask?.(task.id)}
      className={cn(
        'group cursor-pointer rounded-lg border bg-card shadow-sm transition-all hover:shadow-md',
        compact ? 'p-1.5' : 'rounded-xl p-2.5',
        active && 'ring-2 ring-teal-600/50',
        ghost && 'cursor-grabbing'
      )}
      role="button"
      tabIndex={ghost ? -1 : 0}
      onKeyDown={(e) => !ghost && e.key === 'Enter' && onOpenTask?.(task.id)}
      aria-label={`Карточка ${task.key}: ${task.title}`}
    >
      <div className="flex flex-wrap items-start gap-x-1 gap-y-0.5">
        <TypeIcon type={task.type} className={cn('mt-0.5', compact ? 'h-3 w-3' : 'h-4 w-4')} />
        <span className={cn('mt-0.5 font-mono text-muted-foreground', compact ? 'text-[10px]' : 'text-[11px]')}>{task.key}</span>
        {/* быстрые действия (ФТ-4.4) */}
        {!ghost && !compact && onPatchCard && (
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Сменить исполнителя"
                >
                  <UserAvatar user={assignee} size={16} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Исполнитель</p>
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    onClick={() => onPatchCard(task.id, { assigneeId: u.id })}
                  >
                    <UserAvatar user={u} size={18} /> {u.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  onClick={() => onPatchCard(task.id, { assigneeId: null })}
                >
                  <UserAvatar user={null} size={18} /> Не назначен
                </button>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Сменить приоритет"
                >
                  <PriorityIcon priority={task.priority} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1" onClick={(e) => e.stopPropagation()}>
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Приоритет</p>
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    onClick={() => onPatchCard(task.id, { priority: p })}
                  >
                    <PriorityIcon priority={p} /> {PRIORITY_LABELS_RU[p]}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <p
        className={cn(
          'mt-0.5 leading-snug',
          compact ? 'line-clamp-2 text-xs' : 'mt-1 line-clamp-3 text-sm',
          task.type === 'epic' && 'font-medium'
        )}
      >
        {task.title}
      </p>

      {!compact && task.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <LabelChip key={l} label={l} />
          ))}
          {task.labels.length > 3 && <span className="text-[10px] text-muted-foreground">+{task.labels.length - 3}</span>}
        </div>
      )}

      {!compact && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          {task.dueDate && (
            <span className={cn('inline-flex items-center gap-1', overdue && 'font-semibold text-red-600')} title="Срок">
              <CalendarClock className="h-3 w-3" /> {formatDate(task.dueDate)}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title={`${task.commentCount} комментариев`}>
              <MessageSquare className="h-3 w-3" /> {task.commentCount}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title={`${task.attachmentCount} вложений`}>
              <Paperclip className="h-3 w-3" /> {task.attachmentCount}
            </span>
          )}
          {assignee && (
            <span className="ml-auto">
              <UserAvatar user={assignee} size={20} />
            </span>
          )}
        </div>
      )}
      {compact && assignee && (
        <div className="mt-1 flex justify-end">
          <UserAvatar user={assignee} size={16} />
        </div>
      )}
    </div>
  )
}
