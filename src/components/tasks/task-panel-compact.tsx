'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Check, Copy, CopyPlus,
  ExternalLink, ListTree, Maximize2, MoreHorizontal, Plus, Trash2, X,
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
import { MarkdownEditor, MarkdownView } from '@/components/shared/markdown'
import { LabelChip, PriorityIcon, TypeIcon, UserAvatar } from '@/components/shared/bits'
import { ParentTaskPicker } from '@/components/tasks/parent-task-picker'
import { PanelComments } from '@/components/tasks/panel-comments'
import { PanelAttachments } from '@/components/tasks/panel-attachments'
import { PanelLinks } from '@/components/tasks/panel-links'
import { PanelHistory } from '@/components/tasks/panel-history'
import { DueDateField } from '@/components/tasks/due-date-field'
import {
  copyToClipboard, useCreateTask, useDeleteTask, useTask, useTasks, useUpdateTask, useUploadAttachments,
} from '@/lib/api'
import { ALLOWED_CHILDREN, PRIORITIES, PRIORITY_LABELS_RU, TASK_TYPES, TYPE_LABELS_RU } from '@/lib/config'
import { isOverdue } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StatusDto, TaskFullDto, UserDto } from '@/lib/types'

/**
 * Компактная панель задачи справа (~480px), как в Jira/Linear.
 * Шапка с быстрыми бейджами (статус/исполнитель/приоритет/тип),
 * ниже — переключаемые вкладки: Детали / Комментарии / Вложения / Связи / История.
 * На мобильных разворачивается на весь экран (w-full).
 *
 * Переключение в полноэкранный режим — через onSwitchMode (кнопка Maximize2 в шапке).
 */
export function TaskPanelCompact({
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
  void projectKey
  const { data: task, isLoading, error } = useTask(taskId)
  const update = useUpdateTask()
  const del = useDeleteTask()
  const qc = useQueryClient()

  const [tab, setTab] = useState('details')
  const [titleDraft, setTitleDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  // Сброс вкладки и черновиков при смене задачи
  const [prevTaskId, setPrevTaskId] = useState(taskId)
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId)
    setTab('details')
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
      <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-background shadow-2xl sm:w-[480px]" aria-label="Панель задачи">
        <div className="flex items-center justify-between border-b p-4">
          <span className="text-sm text-muted-foreground">Задача не найдена</span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть"><X className="h-4 w-4" /></Button>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-background shadow-2xl sm:w-[480px]"
      aria-label={`Панель задачи ${task?.key ?? ''}`}
      data-editor-root
    >
      {/* Шапка: тип, ключ, быстрые действия */}
      <div className="border-b px-4 pb-2 pt-3">
        <div className="flex items-start gap-2">
          {task ? <TypeIcon type={task.type} className="mt-0.5 h-5 w-5" /> : <div className="h-5 w-5 animate-pulse rounded bg-muted" />}
          <span className="mt-0.5 font-mono text-sm text-muted-foreground">{task?.key ?? '…'}</span>
          <div className="ml-auto flex items-center gap-1">
            {doneStatus && task && (
              <Button
                size="sm"
                variant={isDone ? 'outline' : 'default'}
                className="h-7 gap-1 text-xs"
                disabled={update.isPending}
                onClick={() => patch({ statusId: doneStatus.id })}
              >
                <Check className="h-3.5 w-3.5" /> {isDone ? 'Готово ✓' : 'Готово'}
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onSwitchMode}
              aria-label="Полноэкранный режим"
              title="Полноэкранный режим (двухколоночный редактор)"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Действия над задачей">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={deleteTask}
                >
                  <Trash2 className="h-4 w-4" /> Удалить…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Закрыть панель">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Название — инлайн-редактирование */}
        {editingTitle ? (
          <textarea
            ref={titleRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTitle() }
              if (e.key === 'Escape') { setTitleDraft(task?.title ?? ''); setEditingTitle(false) }
            }}
            rows={2}
            className="mt-1 w-full resize-none rounded-md border bg-background px-2 py-1.5 text-base font-semibold outline-none ring-ring focus:ring-1"
            aria-label="Редактирование названия"
          />
        ) : (
          <h2
            className="mt-1 cursor-text rounded-md px-2 py-1.5 text-base font-semibold leading-snug hover:bg-muted/60"
            onClick={() => task && setEditingTitle(true)}
            title="Кликните, чтобы переименовать"
          >
            {task?.title ?? <span className="inline-block h-5 w-3/4 animate-pulse rounded bg-muted" />}
          </h2>
        )}

        {/* быстрые бейджи: статус / исполнитель / приоритет / тип */}
        {task && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Select value={task.statusId} onValueChange={(v) => patch({ statusId: v })}>
              <SelectTrigger
                className="h-7 w-auto gap-1.5 border-none px-2 text-xs font-medium shadow-none"
                style={{ backgroundColor: `${currentStatus?.color}1f`, color: currentStatus?.color }}
                aria-label="Сменить статус"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: currentStatus?.color }} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={task.assigneeId ?? 'none'} onValueChange={(v) => patch({ assigneeId: v === 'none' ? null : v })}>
              <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-muted px-2 text-xs shadow-none" aria-label="Сменить исполнителя">
                <UserAvatar user={assignee} size={16} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id} className="text-sm">
                    <span className="flex items-center gap-2"><UserAvatar user={u} size={18} /> {u.name}</span>
                  </SelectItem>
                ))}
                <SelectItem value="none" className="text-sm">
                  <span className="flex items-center gap-2"><UserAvatar user={null} size={18} /> Не назначен</span>
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={task.priority} onValueChange={(v) => patch({ priority: v })}>
              <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-muted px-2 text-xs shadow-none" aria-label="Сменить приоритет">
                <PriorityIcon priority={task.priority} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p} className="text-sm">
                    <span className="flex items-center gap-2"><PriorityIcon priority={p} /> {PRIORITY_LABELS_RU[p]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={task.type} onValueChange={(v) => patch({ type: v })}>
              <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-muted px-2 text-xs shadow-none" aria-label="Сменить тип">
                <TypeIcon type={task.type} className="h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-sm">
                    <span className="flex items-center gap-2"><TypeIcon type={t} className="h-3.5 w-3.5" /> {TYPE_LABELS_RU[t]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Вкладки */}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b px-2 py-2">
          <div className="rounded-lg bg-muted p-1">
            <TabsList className={TASK_PANEL_TABS_LIST_CLASS}>
              {(
                [
                  ['details', undefined],
                  ['comments', task?.comments.length],
                  ['attachments', task?.attachments.length],
                  ['links', task?.links.length],
                  ['history', undefined],
                ] as const
              ).map(([v, count]) => (
                <TabsTrigger key={v} value={v} className={TASK_PANEL_TAB_TRIGGER_CLASS}>
                  <TaskPanelTabLabel id={v} count={count || undefined} />
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <div className={cn('custom-scroll min-h-0 flex-1 overflow-y-auto', isLoading && 'p-4')}>
          {isLoading || !task ? (
            <div className="space-y-3 p-4">
              <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-24 w-full animate-pulse rounded bg-muted" />
              <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <>
              {tab === 'details' && (
                <PanelDetailsCompact task={task} statuses={statuses} users={users} onPatch={patch} onOpenTask={onOpenTask} />
              )}
              {tab === 'comments' && <PanelComments task={task} onPatch={patch} />}
              {tab === 'attachments' && <PanelAttachments task={task} onPatch={patch} />}
              {tab === 'links' && <PanelLinks task={task} onOpenTask={onOpenTask} />}
              {tab === 'history' && <PanelHistory task={task} />}
            </>
          )}
        </div>
      </Tabs>

      {/* индикатор сохранения */}
      {update.isPending && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
          <Badge variant="secondary" className="animate-pulse">Сохранение…</Badge>
        </div>
      )}
    </aside>
  )
}

/* ──────────────────────────────────────────────────────────── */
/*  Compact «Детали» — одна вертикаль с описанием,            */
/*  сроком, родителем, метками и подзадачами                    */
/* ──────────────────────────────────────────────────────────── */

function PanelDetailsCompact({
  task, statuses, users, onPatch, onOpenTask,
}: {
  task: TaskFullDto
  statuses: StatusDto[]
  users: UserDto[]
  onPatch: (body: Record<string, unknown>) => Promise<unknown>
  onOpenTask: (id: string) => void
}) {
  void users
  const qc = useQueryClient()
  const upload = useUploadAttachments()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const { data: allTasks = [] } = useTasks(task.projectId)

  const [descDraft, setDescDraft] = useState(task.description)
  const [editingDesc, setEditingDesc] = useState(false)
  const [labelInput, setLabelInput] = useState('')
  const [subtaskTitle, setSubtaskTitle] = useState('')

  const [prevTaskId, setPrevTaskId] = useState(task.id)
  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id)
    setDescDraft(task.description)
    setEditingDesc(false)
  }
  const [prevServerDesc, setPrevServerDesc] = useState(task.description)
  if (task.description !== prevServerDesc) {
    setPrevServerDesc(task.description)
    if (!editingDesc) setDescDraft(task.description)
  }

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const currentStatus = statusById.get(task.statusId)
  const doneStatus = [...statuses].filter((s) => s.category === 3).sort((a, b) => b.order - a.order)[0]

  const allowedParentTypes = (Object.keys(ALLOWED_CHILDREN) as string[]).filter((pt) =>
    ALLOWED_CHILDREN[pt].includes(task.type)
  )
  const parentCandidates = allTasks.filter((t) => t.id !== task.id && allowedParentTypes.includes(t.type))

  const doneChildren = task.children.filter((c) => (statusById.get(c.statusId)?.category ?? 0) === 3).length
  const defaultChildType = ALLOWED_CHILDREN[task.type]?.[0] ?? 'task'

  function addLabel() {
    const l = labelInput.trim()
    if (!l) return
    if (!task.labels.includes(l)) onPatch({ labels: [...task.labels, l] }).catch(() => {})
    setLabelInput('')
  }

  function patchParentChildren(nextChildren: TaskFullDto['children']) {
    qc.setQueryData<TaskFullDto>(['task', task.id], (old) => (old ? { ...old, children: nextChildren } : old))
  }

  function toggleSubtaskDone(childId: string, childStatusId: string) {
    const s = statusById.get(childStatusId)
    const isDone = (s?.category ?? 0) === 3
    const target = isDone
      ? statuses.find((x) => x.category === 2) ?? statuses.find((x) => x.category === 1) ?? statuses[0]
      : doneStatus
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

  function addSubtask() {
    const title = subtaskTitle.trim()
    if (!title) return
    createTask.mutate(
      {
        projectId: task.projectId,
        type: defaultChildType,
        title,
        parentId: task.id,
        assigneeId: task.assigneeId,
      },
      {
        onSuccess: (created) => {
          setSubtaskTitle('')
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

  async function insertImageIntoDescription(file: File) {
    try {
      const res = await upload.mutateAsync({ taskId: task.id, projectId: task.projectId, files: [file] })
      const att = res[0]
      if (att) {
        const md = `\n![${att.fileName}](attachment:${att.id})\n`
        setDescDraft((d) => d + md)
        setEditingDesc(true)
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-5 p-4">
      {/* Описание */}
      <section aria-label="Описание">
        {editingDesc ? (
          <div className="space-y-2">
            <MarkdownEditor
              value={descDraft}
              onChange={setDescDraft}
              minHeight={160}
              onUploadImage={insertImageIntoDescription}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  await onPatch({ description: descDraft }).catch(() => {})
                  setEditingDesc(false)
                }}
                disabled={upload.isPending}
              >
                Сохранить
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setDescDraft(task.description); setEditingDesc(false) }}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="group flex items-center justify-between">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Описание</h3>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setEditingDesc(true)}>
                Изменить
              </Button>
            </div>
            <MarkdownView source={task.description} />
          </div>
        )}
      </section>

      {/* Срок + Родитель */}
      <section aria-label="Поля задачи" className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-y-3 text-sm">
        <span className="text-muted-foreground">Срок</span>
        <DueDateField
          dueDate={task.dueDate}
          onDueDateChange={(iso) => onPatch({ dueDate: iso }).catch(() => {})}
          triggerClassName="w-full max-w-[200px]"
          overdue={isOverdue(task.dueDate, currentStatus?.category ?? 0)}
        />

        <span className="text-muted-foreground">Родитель</span>
        <ParentTaskPicker task={task} parentCandidates={parentCandidates} onPatch={onPatch} />
      </section>

      {/* Метки */}
      <section aria-label="Метки">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Метки</h3>
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border p-1.5">
          {task.labels.map((l) => (
            <LabelChip key={l} label={l} onRemove={() => onPatch({ labels: task.labels.filter((x) => x !== l) }).catch(() => {})} />
          ))}
          <input
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabel() }
            }}
            placeholder={task.labels.length === 0 ? 'Enter — добавить' : ''}
            className="min-w-[110px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground/60"
            aria-label="Новая метка"
          />
        </div>
      </section>

      {/* Подзадачи */}
      <section aria-label="Подзадачи">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ListTree className="h-3.5 w-3.5" /> Подзадачи
          </h3>
          {task.children.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {doneChildren}/{task.children.length}
              <span className="ml-1.5 inline-block h-1 w-16 overflow-hidden rounded-full bg-muted align-middle">
                <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(doneChildren / task.children.length) * 100}%` }} />
              </span>
            </span>
          )}
        </div>
        <ul className="space-y-0.5">
          {task.children.map((c) => {
            const cs = statusById.get(c.statusId)
            const cDone = (cs?.category ?? 0) === 3
            return (
              <li key={c.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60">
                <button
                  type="button"
                  onClick={() => toggleSubtaskDone(c.id, c.statusId)}
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
        {ALLOWED_CHILDREN[task.type]?.length ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addSubtask() }
              }}
              placeholder={`Добавить (${TYPE_LABELS_RU[defaultChildType].toLowerCase()}) — Enter`}
              className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/60"
              aria-label="Новая подзадача"
            />
            {createTask.isPending && <span className="text-xs text-muted-foreground">…</span>}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Тип «{TYPE_LABELS_RU[task.type]}» не может иметь подзадач</p>
        )}
      </section>
    </div>
  )
}
