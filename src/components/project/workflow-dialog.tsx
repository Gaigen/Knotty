'use client'

import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Check, GripVertical, Palette, Plus, Trash2, Workflow,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  useCreateStatus, useDeleteStatus, useReorderStatuses, useTasks, useUpdateStatus,
} from '@/lib/api'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useEnumLabels } from '@/lib/i18n/use-enum-labels'
import { cn } from '@/lib/utils'
import type { ProjectDetailDto, StatusDto } from '@/lib/types'

const STATUS_PALETTE = [
  '#94a3b8', '#0f766e', '#f59e0b', '#8b5cf6', '#16a34a',
  '#dc2626', '#ea580c', '#0891b2', '#db2777', '#475569',
]

/**
 * Настройка workflow проекта (п. 10.5 ТЗ, этап 2):
 * порядок — drag-and-drop, у каждого статуса имя/цвет/категория;
 * удаление — с переносом задач в другой статус или в «Нет статуса».
 */
export function WorkflowDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectDetailDto
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const tp = useTranslations('project')
  const td = useTranslations('dialogs')
  const tc = useTranslations('common')
  const { categoryLabel, noStatusLabel } = useEnumLabels()
  const create = useCreateStatus()
  const update = useUpdateStatus()
  const del = useDeleteStatus()
  const reorder = useReorderStatuses()
  const { data: tasks = [] } = useTasks(open ? project.id : null)

  const taskCountByStatus = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tasks) m.set(t.statusId, (m.get(t.statusId) ?? 0) + 1)
    return m
  }, [tasks])

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(STATUS_PALETTE[0])
  const [newColorOpen, setNewColorOpen] = useState(false)
  const [newCategory, setNewCategory] = useState(0)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    status: StatusDto
    migrateToId: string
    createNoStatus: boolean
  } | null>(null)
  const newInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // локальная копия статусов — правки применяются мгновенно, сервер подтверждает.
  const [statuses, setStatuses] = useState<StatusDto[]>([])
  const [prevKey, setPrevKey] = useState('')
  // Только id-список: иначе каждый PATCH цвета/имени сбрасывает строки и закрывает палитру
  const syncKey = `${open ? 'open' : 'closed'}:${project.id}:${project.statuses.map((s) => s.id).join(',')}`
  if (open && syncKey !== prevKey) {
    setPrevKey(syncKey)
    setStatuses([...project.statuses].sort((a, b) => a.order - b.order))
  }

  function revertOrder() {
    setStatuses([...project.statuses].sort((a, b) => a.order - b.order))
  }

  function commitName(s: StatusDto, value: string) {
    const name = value.trim()
    setPendingId(null)
    if (!name || name === s.name) return
    update.mutate(
      { id: s.id, projectId: project.id, name },
      {
        onSuccess: () => setStatuses((ss) => ss.map((x) => (x.id === s.id ? { ...x, name } : x))),
        onError: (e) => {
          toast.error(e.message)
          setStatuses((ss) => ss.map((x) => (x.id === s.id ? { ...x, name: s.name } : x)))
        },
      }
    )
    setStatuses((ss) => ss.map((x) => (x.id === s.id ? { ...x, name } : x)))
  }

  function commitColor(s: StatusDto, color: string) {
    update.mutate(
      { id: s.id, projectId: project.id, color },
      { onSuccess: () => setStatuses((ss) => ss.map((x) => (x.id === s.id ? { ...x, color } : x))) }
    )
    setStatuses((ss) => ss.map((x) => (x.id === s.id ? { ...x, color } : x)))
  }

  function commitCategory(s: StatusDto, category: number) {
    update.mutate(
      { id: s.id, projectId: project.id, category },
      { onSuccess: () => setStatuses((ss) => ss.map((x) => (x.id === s.id ? { ...x, category } : x))) }
    )
    setStatuses((ss) => ss.map((x) => (x.id === s.id ? { ...x, category } : x)))
  }

  function applyOrder(next: StatusDto[]) {
    setStatuses(next)
    reorder.mutate(
      { projectId: project.id, order: next.map((x) => x.id) },
      { onError: (e) => { toast.error(e.message); revertOrder() } }
    )
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = statuses.findIndex((x) => x.id === active.id)
    const newIndex = statuses.findIndex((x) => x.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    applyOrder(arrayMove(statuses, oldIndex, newIndex))
  }

  function addStatus() {
    const name = newName.trim()
    if (!name) {
      newInputRef.current?.focus()
      return
    }
    create.mutate(
      { projectId: project.id, name, color: newColor, category: newCategory },
      {
        onSuccess: (r) => {
          setStatuses((ss) => [...ss, { id: r.id, projectId: project.id, name, color: newColor, category: newCategory, order: ss.length }])
          setNewName('')
          toast.success(tp('statusAdded', { name }))
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  function requestRemove(s: StatusDto) {
    const count = taskCountByStatus.get(s.id) ?? 0
    if (count > 0) {
      const others = statuses.filter((x) => x.id !== s.id)
      setDeleteTarget({
        status: s,
        migrateToId: others[0]?.id ?? '',
        createNoStatus: false,
      })
      return
    }
    confirmRemove(s)
  }

  function confirmRemove(
    s: StatusDto,
    opts?: { migrateTo?: string; createNoStatus?: boolean }
  ) {
    del.mutate(
      {
        id: s.id,
        projectId: project.id,
        migrateTo: opts?.createNoStatus ? undefined : opts?.migrateTo,
        createNoStatus: opts?.createNoStatus,
      },
      {
        onSuccess: () => {
          setStatuses((ss) => ss.filter((x) => x.id !== s.id))
          setDeleteTarget(null)
          toast.success(tp('statusDeleted', { name: s.name }))
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  function confirmDeleteWithMigrate() {
    if (!deleteTarget) return
    const { status, migrateToId, createNoStatus } = deleteTarget
    if (!createNoStatus && !migrateToId) {
      toast.error(tp('selectMigrateStatus'))
      return
    }
    confirmRemove(status, { migrateTo: migrateToId, createNoStatus })
  }

  const migrateOptions = deleteTarget
    ? statuses.filter((s) => s.id !== deleteTarget.status.id)
    : []

  const deleteTaskCount = deleteTarget ? taskCountByStatus.get(deleteTarget.status.id) ?? 0 : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4" /> {tp('workflowTitle')}
          </DialogTitle>
          <DialogDescription>{tp('workflowDescription')}</DialogDescription>
        </DialogHeader>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="custom-scroll max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
              {statuses.map((s) => (
                <StatusSortableRow
                  key={s.id}
                  status={s}
                  taskCount={taskCountByStatus.get(s.id) ?? 0}
                  pendingId={pendingId}
                  onPendingId={setPendingId}
                  onCommitName={commitName}
                  onCommitColor={commitColor}
                  onCommitCategory={commitCategory}
                  onRemove={requestRemove}
                  deletePending={del.isPending}
                  canDelete={statuses.length > 1}
                  categoryLabel={categoryLabel}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* новый статус */}
        <div className="flex items-center gap-1.5 rounded-lg border border-dashed px-2 py-1.5">
          <Popover open={newColorOpen} onOpenChange={setNewColorOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-transparent transition-transform hover:scale-105"
                style={{ backgroundColor: newColor }}
                aria-label={tp('newStatusColorAria')}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Palette className="h-3.5 w-3.5 text-white drop-shadow" />
              </button>
            </PopoverTrigger>
            <PopoverContent manualClose className="w-auto p-2" align="start">
              <div className="grid grid-cols-5 gap-1.5">
                {STATUS_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110',
                      newColor === c ? 'border-foreground' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={td('colorAria', { color: c })}
                  >
                    {newColor === c && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Input
            ref={newInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addStatus()}
            placeholder={tp('newStatusPlaceholder')}
            className="h-8 flex-1 text-sm"
            aria-label={tp('newStatusNameAria')}
          />
          <Select value={String(newCategory)} onValueChange={(v) => setNewCategory(Number(v))}>
            <SelectTrigger className="h-8 w-[130px] shrink-0 text-xs" aria-label={tp('newStatusCategoryAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3].map((c) => (
                <SelectItem key={c} value={String(c)} className="text-sm">
                  {categoryLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={addStatus}
            disabled={!newName.trim() || create.isPending}
            aria-label={tp('addStatusAria')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {tp('statusCount')}{' '}
          <Badge variant="secondary" className="h-8 min-w-8 px-2 text-xs font-mono tabular-nums">
            {statuses.length}
          </Badge>
        </p>
      </DialogContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tp('deleteStatusTitle', { name: deleteTarget?.status.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>{tp('deleteStatusTasks', { count: deleteTaskCount })}</p>
                <div className="space-y-2">
                  <Label className="text-foreground">{tp('migrateTo')}</Label>
                  <Select
                    value={deleteTarget?.migrateToId ?? ''}
                    onValueChange={(v) =>
                      setDeleteTarget((t) => t ? { ...t, migrateToId: v, createNoStatus: false } : t)
                    }
                    disabled={deleteTarget?.createNoStatus || migrateOptions.length === 0}
                  >
                    <SelectTrigger className="h-9 w-full" aria-label={tp('migrateAria')}>
                      <SelectValue placeholder={tp('migratePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {migrateOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
                  <Checkbox
                    id="create-no-status"
                    checked={deleteTarget?.createNoStatus ?? false}
                    onCheckedChange={(checked) =>
                      setDeleteTarget((t) => t ? { ...t, createNoStatus: checked === true } : t)
                    }
                  />
                  <div className="space-y-1">
                    <Label htmlFor="create-no-status" className="cursor-pointer font-medium text-foreground">
                      {tp('createNoStatus', { label: noStatusLabel() })}
                    </Label>
                    <p className="text-xs">{tp('createNoStatusHint')}</p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={
                del.isPending
                || (!deleteTarget?.createNoStatus && !deleteTarget?.migrateToId)
              }
              onClick={(e) => {
                e.preventDefault()
                confirmDeleteWithMigrate()
              }}
            >
              {tp('deleteAndMigrate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}

function StatusSortableRow({
  status: s,
  taskCount,
  pendingId,
  onPendingId,
  onCommitName,
  onCommitColor,
  onCommitCategory,
  onRemove,
  deletePending,
  canDelete,
  categoryLabel,
}: {
  status: StatusDto
  taskCount: number
  pendingId: string | null
  onPendingId: (id: string | null) => void
  onCommitName: (s: StatusDto, value: string) => void
  onCommitColor: (s: StatusDto, color: string) => void
  onCommitCategory: (s: StatusDto, category: number) => void
  onRemove: (s: StatusDto) => void
  deletePending: boolean
  canDelete: boolean
  categoryLabel: (c: number) => string
}) {
  const tp = useTranslations('project')
  const td = useTranslations('dialogs')
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: s.id })

  const [colorOpen, setColorOpen] = useState(false)
  const hasTasks = taskCount > 0
  const deleteTitle = !canDelete
    ? tp('keepOneStatus')
    : hasTasks
      ? tp('deleteStatusWithTasks', { count: taskCount })
      : tp('deleteStatus')

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5',
        isDragging && 'z-10 opacity-60 shadow-md ring-2 ring-primary/20'
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
        aria-label={tp('dragStatusAria', { name: s.name })}
        title={tp('drag')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Popover open={colorOpen} onOpenChange={setColorOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-transparent transition-colors hover:border-foreground/20"
            style={{ backgroundColor: s.color }}
            aria-label={tp('statusColorAria', { name: s.name })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Palette className="h-3.5 w-3.5 text-white drop-shadow" />
          </button>
        </PopoverTrigger>
        <PopoverContent manualClose className="w-auto p-2" align="start">
          <div className="grid grid-cols-5 gap-1.5">
            {STATUS_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onCommitColor(s, c)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110',
                  s.color === c ? 'border-foreground' : 'border-transparent'
                )}
                style={{ backgroundColor: c }}
                aria-label={td('colorAria', { color: c })}
              >
                {s.color === c && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {pendingId === s.id ? (
        <Input
          key={`${s.id}-edit`}
          defaultValue={s.name}
          autoFocus
          onBlur={(e) => onCommitName(s, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onPendingId(null)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          className="h-8 flex-1 border-input bg-background px-1.5 text-sm focus-visible:border-input"
          aria-label={tp('editStatusNameAria', { name: s.name })}
        />
      ) : (
        <Input
          key={`${s.id}-view`}
          value={s.name}
          readOnly
          onFocus={() => onPendingId(s.id)}
          className="h-8 flex-1 border-transparent bg-transparent px-1.5 text-sm hover:border-input focus-visible:border-input"
          aria-label={tp('statusNameAria', { name: s.name })}
        />
      )}

      {hasTasks && (
        <Badge
          variant="secondary"
          className="h-8 shrink-0 min-w-8 px-2 text-xs font-mono tabular-nums"
        >
          {taskCount}
        </Badge>
      )}

      <Select value={String(s.category)} onValueChange={(v) => onCommitCategory(s, Number(v))}>
        <SelectTrigger className="h-8 w-[130px] shrink-0 text-xs" aria-label={tp('statusCategoryAria', { name: s.name })}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[0, 1, 2, 3].map((c) => (
            <SelectItem key={c} value={String(c)} className="text-sm">
              {categoryLabel(c)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(s)}
        disabled={deletePending || !canDelete}
        aria-label={tp('deleteStatusAria', { name: s.name })}
        title={deleteTitle}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
