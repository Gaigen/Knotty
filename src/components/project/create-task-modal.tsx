'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarDays, Check, ChevronsUpDown, Network, UserCircle2, X } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Checkbox } from '@/components/ui/checkbox'
import { useCreateTask, useTasks, useUpdateProject } from '@/lib/api'
import { ALLOWED_CHILDREN, PRIORITIES, PRIORITY_LABELS_RU, TASK_TYPES, TYPE_LABELS_RU } from '@/lib/config'
import { toDateInputValue } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LabelChip, TypeIcon, UserAvatar } from '@/components/shared/bits'
import { MarkdownEditor } from '@/components/shared/markdown'
import type { ProjectDetailDto, StatusDto, TaskRowDto, UserDto } from '@/lib/types'

/** Создание задачи (ФТ-2.8) */
export function CreateTaskModal({
  projectId,
  statuses,
  users,
  autoGraph,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string
  statuses: StatusDto[]
  users: UserDto[]
  /** умолчание галочки «Добавить на граф»; выбор пользователя запоминается */
  autoGraph: boolean
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (taskId: string) => void
}) {
  const { data: allTasks = [] } = useTasks(projectId)
  const create = useCreateTask()
  const updateProject = useUpdateProject()

  const me = users[0]
  const [type, setType] = useState<string>('task')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [statusId, setStatusId] = useState<string>(statuses[0]?.id ?? '')
  const [assigneeId, setAssigneeId] = useState<string>('me')
  const [priority, setPriority] = useState<string>('mid')
  const [dueDate, setDueDate] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const [parentOpen, setParentOpen] = useState(false)
  // галочка «Добавить на граф» (ФТ-3.3): умолчание — настройка проекта, выбор запоминается
  const [addToGraph, setAddToGraph] = useState(autoGraph)
  // сброс полей при открытии — паттерн «правка при рендере» (без эффекта)
  const [prevSession, setPrevSession] = useState('closed')
  const session = open ? 'open' : 'closed'
  if (session !== prevSession) {
    setPrevSession(session)
    if (open) {
      setType('task')
      setTitle('')
      setDescription('')
      setStatusId(statuses[0]?.id ?? '')
      setAssigneeId('me') // умолчание «назначить мне» (ФТ-2.8)
      setPriority('mid')
      setDueDate('')
      setLabels([])
      setLabelInput('')
      setParentId('')
      setAddToGraph(autoGraph)
    }
  }

  // [v1.1] кандидаты в родители: допустимые типы по п. 4.1.1
  // (лимит глубины снят — дерево любой вложенности)
  const parentCandidates = useMemo(() => {
    const allowedTypes = (Object.keys(ALLOWED_CHILDREN) as string[]).filter((pt) =>
      ALLOWED_CHILDREN[pt].includes(type)
    )
    return allTasks.filter((t) => allowedTypes.includes(t.type))
  }, [allTasks, type])

  function addLabel() {
    const l = labelInput.trim()
    if (l && !labels.includes(l)) setLabels([...labels, l].slice(0, 20))
    setLabelInput('')
  }

  function submit() {
    if (!title.trim()) {
      toast.error('Введите название задачи')
      return
    }
    // выбор галочки становится умолчанием для следующих задач (настройка проекта)
    if (addToGraph !== autoGraph) {
      updateProject.mutate({ id: projectId, autoGraph: addToGraph })
    }
    create.mutate(
      {
        projectId,
        type,
        title: title.trim(),
        description,
        statusId,
        assigneeId: assigneeId === 'me' ? me?.id ?? null : assigneeId === 'none' ? null : assigneeId,
        priority,
        dueDate: dueDate ? new Date(dueDate + 'T12:00:00').toISOString() : null,
        labels,
        parentId: parentId || null,
        addToGraph,
      },
      {
        onSuccess: (task) => {
          toast.success(`Задача ${task.key} создана`)
          onOpenChange(false)
          onCreated(task.id)
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const parentTask = allTasks.find((t) => t.id === parentId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto custom-scroll sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
          <DialogDescription>После создания откроется панель задачи.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          {/* тип — сегмент-кнопки */}
          <div className="grid gap-2">
            <Label>Тип</Label>
            <div className="flex gap-1 rounded-lg border p-1" role="group" aria-label="Тип задачи">
              {TASK_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t)
                    setParentId('') // при смене типа родитель может стать недопустимым
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                    type === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-pressed={type === t}
                >
                  <TypeIcon type={t} className={cn('h-4 w-4', type === t && 'text-primary-foreground')} />
                  {TYPE_LABELS_RU[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="task-title">Название *</Label>
            <Input
              id="task-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Кратко, что нужно сделать"
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit()}
            />
          </div>

          <div className="grid gap-2">
            <Label>Описание</Label>
            <MarkdownEditor value={description} onChange={setDescription} minHeight={110} placeholder="Markdown поддерживается…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Статус</Label>
              <Select value={statusId} onValueChange={setStatusId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
            </div>
            <div className="grid gap-2">
              <Label>Приоритет</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{PRIORITY_LABELS_RU[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* исполнитель */}
            <div className="grid gap-2">
              <Label>Исполнитель</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">
                    <span className="flex items-center gap-2">
                      <UserCircle2 className="h-4 w-4 text-teal-700" /> Назначить мне{me ? ` (${me.name})` : ''}
                    </span>
                  </SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="flex items-center gap-2"><UserAvatar user={u} size={18} /> {u.name}</span>
                    </SelectItem>
                  ))}
                  <SelectItem value="none">Не назначен</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* срок с быстрыми значениями */}
            <div className="grid gap-2">
              <Label htmlFor="task-due">Срок</Label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <CalendarDays className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="task-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="h-9 pl-8 text-sm"
                  />
                </div>
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
                      setDueDate(toDateInputValue(d.toISOString()))
                    }}
                  >
                    {label as string}
                  </button>
                ))}
                {dueDate && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                    onClick={() => setDueDate('')}
                  >
                    <X className="h-3 w-3" /> Очистить
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* метки */}
          <div className="grid gap-2">
            <Label htmlFor="task-labels">Метки</Label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border p-1.5">
              {labels.map((l) => (
                <LabelChip key={l} label={l} onRemove={() => setLabels(labels.filter((x) => x !== l))} />
              ))}
              <input
                id="task-labels"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addLabel()
                  }
                }}
                placeholder={labels.length === 0 ? 'frontend, design…' : ''}
                className="min-w-[100px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          {/* родитель — поиск по допустимым типам ([v1.1] п. 4.1.1) */}
          <div className="grid gap-2">
            <Label>Родитель</Label>
            <Popover open={parentOpen} onOpenChange={setParentOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal">
                  {parentTask ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <TypeIcon type={parentTask.type} className="h-3.5 w-3.5" />
                      <span className="font-mono text-xs text-muted-foreground">{parentTask.key}</span>
                      <span className="truncate">{parentTask.title}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Без родителя</span>
                  )}
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Поиск задачи-родителя…" />
                  <CommandList>
                    <CommandEmpty>Нет подходящих задач</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="no-parent" onSelect={() => { setParentId(''); setParentOpen(false) }}>
                        <Check className={cn('h-4 w-4', !parentId && 'opacity-100', parentId && 'opacity-0')} />
                        Без родителя
                      </CommandItem>
                      {parentCandidates.map((t) => (
                        <CommandItem
                          key={t.id}
                          value={`${t.key} ${t.title}`}
                          onSelect={() => {
                            setParentId(t.id)
                            setParentOpen(false)
                          }}
                        >
                          <Check className={cn('h-4 w-4', parentId === t.id ? 'opacity-100' : 'opacity-0')} />
                          <TypeIcon type={t.type} className="h-3.5 w-3.5" />
                          <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                          <span className="truncate">{t.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Показаны только задачи, которые могут быть родителем для типа «{TYPE_LABELS_RU[type]}» (п. 4.1.1 ТЗ)
            </p>
          </div>

          {/* автодобавление на граф (ФТ-3.3): выбор запоминается как умолчание */}
          <label
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 text-sm"
            title="Задача сразу появится нодой на канвасе графа"
          >
            <Checkbox
              checked={addToGraph}
              onCheckedChange={(v) => setAddToGraph(!!v)}
              aria-label="Добавить на граф"
            />
            <Network className="h-4 w-4 text-teal-700" />
            <span className="font-medium">Добавить на граф</span>
            <span className="text-xs text-muted-foreground">— выбор запомнится для следующих задач</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={submit} disabled={create.isPending || !title.trim()}>
            {create.isPending ? 'Создаём…' : 'Создать задачу'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
