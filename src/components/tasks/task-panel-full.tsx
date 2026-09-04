'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, CalendarDays, Check, Copy, CopyPlus,
  ExternalLink, ListTree, Minimize2, MoreHorizontal, Plus, Trash2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskPanelTabLabel, TASK_PANEL_TAB_TRIGGER_CLASS, TASK_PANEL_TABS_LIST_CLASS } from '@/components/tasks/task-panel-tab-label'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { MarkdownEditor, MarkdownView } from '@/components/shared/markdown'
import { LabelChip, PriorityIcon, TypeIcon, UserAvatar } from '@/components/shared/bits'
import { ParentTaskPicker } from '@/components/tasks/parent-task-picker'
import { PanelComments } from '@/components/tasks/panel-comments'
import { PanelAttachments } from '@/components/tasks/panel-attachments'
import { PanelLinks } from '@/components/tasks/panel-links'
import { PanelHistory } from '@/components/tasks/panel-history'
import {
  copyToClipboard, useCreateTask, useDeleteTask, useTask, useTasks, useUpdateTask, useUploadAttachments,
} from '@/lib/api'
import { ALLOWED_CHILDREN, PRIORITIES, PRIORITY_LABELS_RU, TASK_TYPES, TYPE_LABELS_RU } from '@/lib/config'
import { formatDate, isOverdue, toDateInputValue } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StatusDto, TaskFullDto, UserDto } from '@/lib/types'

/**
 * Полноэкранный редактор задачи (ФТ-2.7).
 * Двухколоночная раскладка: слева — заголовок, описание, подзадачи,
 * переключаемые вкладки (Комментарии / Вложения / Связи / История);
 * справа — sidebar свойств (статус, исполнитель, приоритет, тип, срок,
 * родитель, метки). На мобильных — одна колонка со scroll'ом.
 *
 * Переключение в компактный режим — через onSwitchMode (кнопка Maximize2).
 */
export function TaskPanelFull({
  taskId,
  users,
  statuses,
  projectKey,
  onClose,
  onOpenTask,
  onDeleted,
  onSwitchMode,
}: {
  taskId: string
  users: UserDto[]
  statuses: StatusDto[]
  projectKey: string
  onClose: () => void
  onOpenTask: (id: string) => void
  onDeleted: () => void
  onSwitchMode: () => void
}) {
  void projectKey // зарезервировано для будущего использования (логи/ссылки)
  const { data: task, isLoading, error } = useTask(taskId)
  const update = useUpdateTask()
  const del = useDeleteTask()
  const qc = useQueryClient()

  const [tab, setTab] = useState('comments')
  const [titleDraft, setTitleDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  // Сброс вкладки и черновиков при смене задачи
  const [prevTaskId, setPrevTaskId] = useState(taskId)
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId)
    setTab('comments')
    setEditingTitle(false)
  }

  useEffect(() => {
    if (task && !editingTitle) setTitleDraft(task.title)
  }, [task, editingTitle])

  useEffect(() => {
    if (editingTitle) {
      titleRef.current?.focus()
      titleRef.current?.select()
    }
  }, [editingTitle])

  // Esc — закрыть редактор (если не в инпуте)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== 'Escape') return
      const t = e.target as HTMLElement | null
      const inField = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest('[role=combobox]') || t.closest('[role=dialog]'))
      // Не перехватываем Esc из Select/Popover/Command — они закрываются сами
      if (inField && t && !t.closest('body[data-editor-root]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const currentStatus = task ? statusById.get(task.statusId) : undefined
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const assignee = task?.assigneeId ? userById.get(task.assigneeId) ?? null : null
  const doneStatus = useMemo(
    () => [...statuses].filter((s) => s.category === 3).sort((a, b) => b.order - a.order)[0],
    [statuses]
  )
  const isDone = (currentStatus?.category ?? 0) === 3

  function patch(body: Record<string, unknown>, opts?: { silent?: boolean }) {
    return update.mutateAsync(
      { id: taskId, projectId: task?.projectId, ...body } as Parameters<typeof update.mutateAsync>[0]
    ).catch((e: Error) => {
      if (!opts?.silent) toast.error(e.message)
      throw e
    })
  }

  function saveTitle() {
    const t = titleDraft.trim()
    setEditingTitle(false)
    if (task && t && t !== task.title) {
      patch({ title: t }).catch(() => {})
    } else {
      setTitleDraft(task?.title ?? '')
    }
  }

  async function duplicate() {
    if (!task) return
    try {
      const res = await fetch(`/api/projects/${task.projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: task.type,
          title: `${task.title} (копия)`,
          description: task.description,
          statusId: task.statusId,
          assigneeId: task.assigneeId,
          priority: task.priority,
          dueDate: task.dueDate,
          labels: task.labels,
          parentId: task.parentId,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Не удалось дублировать')
      const created = await res.json()
      qc.invalidateQueries({ queryKey: ['tasks', task.projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', task.projectId] })
      toast.success(`Создана копия ${created.key}`)
      onOpenTask(created.id)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function copyKey() {
    if (!task) return
    if (await copyToClipboard(task.key)) toast.success('Ключ скопирован')
    else toast.error('Не удалось скопировать')
  }

  async function copyLink() {
    if (!task) return
    const url = `${window.location.origin}/?project=${task.projectId}&tab=tasks&task=${taskId}`
    if (await copyToClipboard(url)) toast.success('Ссылка скопирована')
    else toast.error('Не удалось скопировать')
  }

  function deleteTask() {
    if (!task) return
    if (!confirm(`Удалить задачу ${task.key}?\n\nПодзадачи открепятся, связи, вложения и комментарии удалятся.`)) return
    del.mutate(
      { id: task.id, projectId: task.projectId },
      { onSuccess: () => { toast.success('Задача удалена'); onDeleted() }, onError: (e) => toast.error(e.message) }
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background" data-editor-root>
        <div className="flex h-14 items-center justify-between border-b px-4">
          <span className="text-sm text-muted-foreground">Задача не найдена</span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть"><X className="h-4 w-4" /></Button>
        </div>
      </div>
    )
  }

  const loading = isLoading || !task

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" data-editor-root aria-label={`Редактор задачи ${task?.key ?? ''}`} role="dialog" aria-modal="true">
      {/* Шапка редактора */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Назад к списку">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {task ? (
          <>
            <TypeIcon type={task.type} className="h-4 w-4 shrink-0" />
            <span className="shrink-0 font-mono text-sm text-muted-foreground">{task.key}</span>
            <StatusBadgeInline status={currentStatus} />
          </>
        ) : (
          <span className="h-4 w-32 animate-pulse rounded bg-muted" />
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {doneStatus && task && (
            <Button
              size="sm"
              variant={isDone ? 'outline' : 'default'}
              className="h-8 gap-1.5 text-xs"
              disabled={update.isPending}
              onClick={() => patch({ statusId: doneStatus.id })}
            >
              <Check className="h-3.5 w-3.5" /> {isDone ? 'Готово ✓' : 'Готово'}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onSwitchMode}
            aria-label="Компактный режим"
            title="Компактный режим (узкая панель справа)"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Действия над задачей">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={duplicate}>
                <CopyPlus className="h-4 w-4" /> Дублировать
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyKey}>
                <Copy className="h-4 w-4" /> Копировать ключ
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyLink}>
                <ExternalLink className="h-4 w-4" /> Копировать ссылку
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={deleteTask}>
                <Trash2 className="h-4 w-4" /> Удалить задачу…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Закрыть редактор">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Тело редактора: левая колонка (заголовок + описание + подзадачи + вкладки) и правый sidebar свойств */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Левая колонка — основная область */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="custom-scroll flex-1 overflow-y-auto">
            {loading ? (
              <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
                <div className="h-9 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-32 w-full animate-pulse rounded bg-muted" />
                <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
                {/* Название — большое, инлайн-редактирование */}
                {editingTitle ? (
                  <textarea
                    ref={titleRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        saveTitle()
                      }
                      if (e.key === 'Escape') {
                        setTitleDraft(task?.title ?? '')
                        setEditingTitle(false)
                      }
                    }}
                    rows={2}
                    className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-2xl font-semibold leading-tight outline-none ring-ring focus:ring-2"
                    aria-label="Редактирование названия"
                  />
                ) : (
                  <h1
                    className="cursor-text rounded-lg px-3 py-2 text-2xl font-semibold leading-tight hover:bg-muted/50"
                    onClick={() => setEditingTitle(true)}
                    title="Кликните, чтобы переименовать"
                  >
                    {task.title}
                  </h1>
                )}

                {/* Описание (ФТ-2.7): Markdown, тулбар, вставка картинок */}
                <DescriptionBlock task={task} onPatch={patch} />

                {/* Подзадачи */}
                <SubtasksBlock task={task} statuses={statuses} onPatch={patch} onOpenTask={onOpenTask} />

                {/* Быстрые действия внизу: метки */}
                <LabelsBlock task={task} onPatch={patch} />
              </div>
            )}
          </div>

          {/* Вкладки под основным контентом — отдельная полоса */}
          {!loading && task && (
            <div className="flex min-h-0 shrink-0 flex-col border-t px-3 py-3 sm:px-4 lg:max-h-[min(46vh,28rem)]">
              <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
                <div className="shrink-0 rounded-lg bg-muted p-1">
                  <TabsList className={TASK_PANEL_TABS_LIST_CLASS}>
                    {(
                      [
                        ['comments', task.comments.length],
                        ['attachments', task.attachments.length],
                        ['links', task.links.length],
                        ['history', undefined],
                      ] as const
                    ).map(([v, count]) => (
                      <TabsTrigger key={v} value={v} className={TASK_PANEL_TAB_TRIGGER_CLASS}>
                        <TaskPanelTabLabel id={v} count={count || undefined} />
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                <div className="mt-3 min-h-0 flex-1 overflow-hidden">
                  {tab === 'comments' && <PanelComments task={task} onPatch={patch} />}
                  {tab === 'attachments' && <PanelAttachments task={task} onPatch={patch} />}
                  {tab === 'links' && <PanelLinks task={task} onOpenTask={onOpenTask} />}
                  {tab === 'history' && <PanelHistory task={task} />}
                </div>
              </Tabs>
            </div>
          )}
        </div>

        {/* Правая колонка — sidebar свойств */}
        {!loading && task && (
          <aside className="custom-scroll min-w-0 shrink-0 overflow-x-hidden overflow-y-auto border-t bg-muted/30 p-4 lg:w-[300px] lg:max-w-[300px] lg:border-l lg:border-t-0">
            <PropertySidebar
              task={task}
              users={users}
              statuses={statuses}
              onPatch={patch}
              onOpenTask={onOpenTask}
            />
          </aside>
        )}
      </div>

      {/* Индикатор сохранения */}
      {update.isPending && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2">
          <Badge variant="secondary" className="animate-pulse shadow-md">Сохранение…</Badge>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────── */
/*  Под-секции редактора (inline внутри task-panel.tsx)        */
/* ──────────────────────────────────────────────────────────── */

function StatusBadgeInline({ status }: { status?: StatusDto }) {
  if (!status) return null
  return (
    <span
      className="ml-1 hidden items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium sm:inline-flex"
      style={{ backgroundColor: `${status.color}1f`, color: status.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />
      {status.name}
    </span>
  )
}

/** Описание задачи: Markdown, просмотр/редактирование, вставка картинок */
function DescriptionBlock({ task, onPatch }: { task: TaskFullDto; onPatch: (b: Record<string, unknown>) => Promise<unknown> }) {
  const upload = useUploadAttachments()
  const [draft, setDraft] = useState(task.description)
  const [editing, setEditing] = useState(false)

  // сброс черновика при смене задачи
  const [prevTaskId, setPrevTaskId] = useState(task.id)
  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id)
    setDraft(task.description)
    setEditing(false)
  }
  // внешнее изменение подтягивается в черновик, пока не идёт редактирование
  const [prevServer, setPrevServer] = useState(task.description)
  if (task.description !== prevServer) {
    setPrevServer(task.description)
    if (!editing) setDraft(task.description)
  }

  async function insertImage(file: File) {
    try {
      const res = await upload.mutateAsync({ taskId: task.id, projectId: task.projectId, files: [file] })
      const att = res[0]
      if (att) {
        const md = `\n![${att.fileName}](attachment:${att.id})\n`
        setDraft((d) => d + md)
        setEditing(true)
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (editing) {
    return (
      <section className="mt-4">
        <MarkdownEditor
          value={draft}
          onChange={setDraft}
          minHeight={180}
          onUploadImage={insertImage}
        />
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            disabled={upload.isPending}
            onClick={async () => {
              await onPatch({ description: draft }).catch(() => {})
              setEditing(false)
            }}
          >
            Сохранить
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setDraft(task.description); setEditing(false) }}>
            Отмена
          </Button>
          <span className="ml-2 self-center text-[11px] text-muted-foreground">
            Markdown · Ctrl/⌘+Enter — сохранить
          </span>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-4">
      <div className="group flex items-center justify-between">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Описание</h3>
        <Button
          variant="ghost" size="sm" className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => setEditing(true)}
        >
          Изменить
        </Button>
      </div>
      {task.description.trim() ? (
        <MarkdownView source={task.description} />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full rounded-lg border border-dashed px-4 py-6 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          Добавьте описание задачи… <span className="text-xs">(Markdown)</span>
        </button>
      )}
    </section>
  )
}

/** Подзадачи: чекбоксы, прогресс, добавление */
function SubtasksBlock({
  task, statuses, onPatch, onOpenTask,
}: {
  task: TaskFullDto
  statuses: StatusDto[]
  onPatch: (b: Record<string, unknown>) => Promise<unknown>
  onOpenTask: (id: string) => void
}) {
  const qc = useQueryClient()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const [title, setTitle] = useState('')

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const doneChildren = task.children.filter((c) => (statusById.get(c.statusId)?.category ?? 0) === 3).length
  const defaultChildType = ALLOWED_CHILDREN[task.type]?.[0] ?? 'task'

  function patchParentChildren(nextChildren: TaskFullDto['children']) {
    qc.setQueryData<TaskFullDto>(['task', task.id], (old) => (old ? { ...old, children: nextChildren } : old))
  }

  function toggleDone(childId: string, childStatusId: string) {
    const s = statusById.get(childStatusId)
    const isDone = (s?.category ?? 0) === 3
    const target = isDone
      ? statuses.find((x) => x.category === 2) ?? statuses.find((x) => x.category === 1) ?? statuses[0]
      : [...statuses].filter((x) => x.category === 3).sort((a, b) => b.order - a.order)[0]
    if (!target) return
    const prevChildren = task.children
    patchParentChildren(prevChildren.map((c) => (c.id === childId ? { ...c, statusId: target.id } : c)))
    updateTask.mutate(
      { id: childId, projectId: task.projectId, statusId: target.id },
      {
        onError: (e) => {
          patchParentChildren(prevChildren)
          toast.error(e.message)
        },
      }
    )
  }

  function add() {
    const t = title.trim()
    if (!t) return
    createTask.mutate(
      {
        projectId: task.projectId,
        type: defaultChildType,
        title: t,
        parentId: task.id,
        assigneeId: task.assigneeId,
      },
      {
        onSuccess: (created) => {
          setTitle('')
          qc.setQueryData<TaskFullDto>(['task', task.id], (old) => {
            if (!old) return old
            if (old.children.some((c) => c.id === created.id)) return old
            return { ...old, children: [...old.children, created] }
          })
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  if (!ALLOWED_CHILDREN[task.type]?.length) return null

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ListTree className="h-3.5 w-3.5" /> Подзадачи
        </h3>
        {task.children.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {doneChildren}/{task.children.length}
            <span className="ml-1.5 inline-block h-1 w-20 overflow-hidden rounded-full bg-muted align-middle">
              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(doneChildren / task.children.length) * 100}%` }} />
            </span>
          </span>
        )}
      </div>

      {task.children.length > 0 && (
        <ul className="space-y-0.5">
          {task.children.map((c) => {
            const cs = statusById.get(c.statusId)
            const cDone = (cs?.category ?? 0) === 3
            return (
              <li key={c.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60">
                <button
                  type="button"
                  onClick={() => toggleDone(c.id, c.statusId)}
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                    cDone ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-muted-foreground/40 hover:border-foreground'
                  )}
                  aria-label={cDone ? `Вернуть ${c.key} в работу` : `Отметить ${c.key} выполненной`}
                >
                  {cDone && <Check className="h-3 w-3" />}
                </button>
                <TypeIcon type={c.type} className="h-3.5 w-3.5" />
                <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => onOpenTask(c.id)}>
                  <span className={cn('font-mono text-[11px] text-muted-foreground', cDone && 'line-through opacity-60')}>{c.key}</span>{' '}
                  <span className={cn(cDone && 'line-through opacity-60')}>{c.title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-1.5 flex items-center gap-1.5">
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add() }
          }}
          placeholder={`Добавить (${TYPE_LABELS_RU[defaultChildType].toLowerCase()}) — Enter`}
          className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/60"
          aria-label="Новая подзадача"
        />
        {createTask.isPending && <span className="text-xs text-muted-foreground">…</span>}
      </div>
    </section>
  )
}

/** Метки (inline редактирование) */
function LabelsBlock({ task, onPatch }: { task: TaskFullDto; onPatch: (b: Record<string, unknown>) => Promise<unknown> }) {
  const [input, setInput] = useState('')
  function add() {
    const l = input.trim()
    if (!l) return
    if (!task.labels.includes(l)) onPatch({ labels: [...task.labels, l] }).catch(() => {})
    setInput('')
  }
  return (
    <section className="mt-6">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Метки</h3>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-background p-1.5">
        {task.labels.map((l) => (
          <LabelChip key={l} label={l} onRemove={() => onPatch({ labels: task.labels.filter((x) => x !== l) }).catch(() => {})} />
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
          }}
          placeholder={task.labels.length === 0 ? 'frontend, design…' : ''}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground/60"
          aria-label="Новая метка"
        />
      </div>
    </section>
  )
}

/** Sidebar свойств задачи справа */
function PropertySidebar({
  task, users, statuses, onPatch, onOpenTask,
}: {
  task: TaskFullDto
  users: UserDto[]
  statuses: StatusDto[]
  onPatch: (b: Record<string, unknown>) => Promise<unknown>
  onOpenTask: (id: string) => void
}) {
  const { data: allTasks = [] } = useTasks(task.projectId)
  const currentStatus = statuses.find((s) => s.id === task.statusId)
  const assignee = task.assigneeId ? users.find((u) => u.id === task.assigneeId) ?? null : null

  const allowedParentTypes = useMemo(
    () => (Object.keys(ALLOWED_CHILDREN) as string[]).filter((pt) => ALLOWED_CHILDREN[pt].includes(task.type)),
    [task.type]
  )
  const parentCandidates = useMemo(
    () => allTasks.filter((t) => t.id !== task.id && allowedParentTypes.includes(t.type)),
    [allTasks, task.id, allowedParentTypes]
  )

  return (
    <div className="min-w-0 space-y-1">
      <SidebarRow label="Статус">
        <Select value={task.statusId} onValueChange={(v) => onPatch({ statusId: v })}>
          <SelectTrigger className="h-8 w-full text-sm" aria-label="Сменить статус">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SidebarRow>

      <SidebarRow label="Исполнитель">
        <Select value={task.assigneeId ?? 'none'} onValueChange={(v) => onPatch({ assigneeId: v === 'none' ? null : v })}>
          <SelectTrigger className="h-8 w-full text-sm" aria-label="Сменить исполнителя">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                <span className="flex items-center gap-2"><UserAvatar user={u} size={18} /> {u.name}</span>
              </SelectItem>
            ))}
            <SelectItem value="none">
              <span className="flex items-center gap-2"><UserAvatar user={null} size={18} /> Не назначен</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </SidebarRow>

      <SidebarRow label="Приоритет">
        <Select value={task.priority} onValueChange={(v) => onPatch({ priority: v })}>
          <SelectTrigger className="h-8 w-full text-sm" aria-label="Сменить приоритет">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                <span className="flex items-center gap-2"><PriorityIcon priority={p} /> {PRIORITY_LABELS_RU[p]}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SidebarRow>

      <SidebarRow label="Тип">
        <Select value={task.type} onValueChange={(v) => onPatch({ type: v })}>
          <SelectTrigger className="h-8 w-full text-sm" aria-label="Сменить тип">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                <span className="flex items-center gap-2"><TypeIcon type={t} className="h-3.5 w-3.5" /> {TYPE_LABELS_RU[t]}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SidebarRow>

      <SidebarRow label="Срок">
        <div className="space-y-1.5">
          <div className="relative">
            <CalendarDays className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={toDateInputValue(task.dueDate)}
              onChange={(e) => onPatch({ dueDate: e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null }).catch(() => {})}
              className="h-8 w-full pl-8 text-sm"
              aria-label="Срок задачи"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              ['Сегодня', 0],
              ['Завтра', 1],
              ['+7 дней', 7],
            ].map(([label, days]) => (
              <button
                key={label as string}
                type="button"
                className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  const d = new Date()
                  d.setDate(d.getDate() + (days as number))
                  onPatch({ dueDate: d.toISOString() }).catch(() => {})
                }}
              >
                {label as string}
              </button>
            ))}
            {task.dueDate && (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                onClick={() => onPatch({ dueDate: null }).catch(() => {})}
              >
                <X className="h-3 w-3" /> Очистить
              </button>
            )}
          </div>
          {task.dueDate && isOverdue(task.dueDate, currentStatus?.category ?? 0) && (
            <p className="text-[11px] font-medium text-red-600">просрочено ({formatDate(task.dueDate)})</p>
          )}
        </div>
      </SidebarRow>

      <SidebarRow label="Родитель">
        <ParentTaskPicker
          task={task}
          parentCandidates={parentCandidates}
          onPatch={onPatch}
          popoverClassName="w-[300px] p-0"
          showTypeHint
        />
      </SidebarRow>
    </div>
  )
}

function SidebarRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1 border-b py-2.5 last:border-b-0">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
