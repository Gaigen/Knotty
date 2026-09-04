'use client'

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  CalendarDays, Check, ListTree, Plus, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ParentTaskPicker } from '@/components/tasks/parent-task-picker'
import { MarkdownEditor, MarkdownView } from '@/components/shared/markdown'
import { LabelChip, TypeIcon } from '@/components/shared/bits'
import { useCreateTask, useTasks, useUpdateTask, useUploadAttachments } from '@/lib/api'
import { ALLOWED_CHILDREN, TYPE_LABELS_RU } from '@/lib/config'
import { formatDate, isOverdue, toDateInputValue } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { TaskFullDto, StatusDto, UserDto } from '@/lib/types'

interface DetailsProps {
  task: TaskFullDto
  statuses: StatusDto[]
  users: UserDto[]
  projectKey: string
  onPatch: (body: Record<string, unknown>) => Promise<unknown>
  onOpenTask: (id: string) => void
}

export function PanelDetails({ task, statuses, users: _users, onPatch, onOpenTask }: DetailsProps) {
  void _users
  const { data: allTasks = [] } = useTasks(task.projectId)
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const upload = useUploadAttachments()

  const [descDraft, setDescDraft] = useState(task.description)
  const [editingDesc, setEditingDesc] = useState(false)
  const [labelInput, setLabelInput] = useState('')
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const descRef = useRef<HTMLDivElement>(null)

  // сброс черновика описания при смене задачи — паттерн «правка при рендере» (без эффекта)
  const [prevTaskId, setPrevTaskId] = useState(task.id)
  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id)
    setDescDraft(task.description)
    setEditingDesc(false)
  }

  // внешнее изменение описания подтягивается в черновик, пока не идёт редактирование
  const [prevServerDesc, setPrevServerDesc] = useState(task.description)
  if (task.description !== prevServerDesc) {
    setPrevServerDesc(task.description)
    if (!editingDesc) setDescDraft(task.description)
  }

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const currentStatus = statusById.get(task.statusId)
  const doneStatus = [...statuses].filter((s) => s.category === 3).sort((a, b) => b.order - a.order)[0]

  // [v1.1] кандидаты в родители по допустимым типам (п. 4.1.1)
  // (лимит глубины снят — дерево любой вложенности)
  const parentCandidates = useMemo(() => {
    const allowedTypes = (Object.keys(ALLOWED_CHILDREN) as string[]).filter((pt) =>
      ALLOWED_CHILDREN[pt].includes(task.type)
    )
    return allTasks.filter((t) => t.id !== task.id && allowedTypes.includes(t.type))
  }, [allTasks, task.id, task.type])

  const doneChildren = task.children.filter((c) => (statusById.get(c.statusId)?.category ?? 0) === 3).length
  const defaultChildType = ALLOWED_CHILDREN[task.type]?.[0] ?? 'task'

  function addLabel() {
    const l = labelInput.trim()
    if (!l) return
    if (!task.labels.includes(l)) onPatch({ labels: [...task.labels, l] }).catch(() => {})
    setLabelInput('')
  }

  function toggleSubtaskDone(childId: string, childStatusId: string) {
    const s = statusById.get(childStatusId)
    const isDone = (s?.category ?? 0) === 3
    const target = isDone
      ? statuses.find((x) => x.category === 2) ?? statuses.find((x) => x.category === 1) ?? statuses[0]
      : doneStatus
    if (!target) return
    updateTask.mutate(
      { id: childId, projectId: task.projectId, statusId: target.id },
      { onError: (e) => toast.error(e.message) }
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
        onSuccess: () => setSubtaskTitle(''),
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
      {/* Описание (ФТ-2.7): просмотр/редактирование, тулбар, картинки-вложения */}
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
          <div ref={descRef}>
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

      {/* Поля: срок, родитель */}
      <section aria-label="Поля задачи" className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-y-3 text-sm">
        <span className="text-muted-foreground">Срок</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <CalendarDays className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={toDateInputValue(task.dueDate)}
              onChange={(e) => onPatch({ dueDate: e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null }).catch(() => {})}
              className="h-8 w-[150px] pl-8 text-sm"
              aria-label="Срок задачи"
            />
          </div>
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
          {isOverdue(task.dueDate, currentStatus?.category ?? 0) && (
            <span className="text-[11px] font-medium text-red-600">просрочено ({formatDate(task.dueDate)})</span>
          )}
        </div>

        <span className="text-muted-foreground">Родитель</span>
        <ParentTaskPicker task={task} parentCandidates={parentCandidates} onPatch={onPatch} />
      </section>

      {/* Метки (ФТ-2.7) */}
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
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addLabel()
              }
            }}
            placeholder={task.labels.length === 0 ? 'Enter — добавить' : ''}
            className="min-w-[110px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground/60"
            aria-label="Новая метка"
          />
        </div>
      </section>

      {/* Подзадачи: чекбокс-переход в «Готово», добавление, прогресс */}
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
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSubtask()
                }
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
