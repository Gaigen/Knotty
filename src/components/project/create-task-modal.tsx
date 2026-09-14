'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
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
import { useCreateTask, useMe, useTasks, useUpdateProject } from '@/lib/api'
import { parentTypesForChild, PRIORITIES, TASK_TYPES } from '@/lib/config'
import { useEnumLabels } from '@/lib/i18n/use-enum-labels'
import { useFormatters } from '@/lib/i18n/use-formatters'
import { cn } from '@/lib/utils'
import { LabelChip, TypeIcon, UserAvatar } from '@/components/shared/bits'
import { MarkdownEditor } from '@/components/shared/markdown'
import type { StatusDto, UserDto } from '@/lib/types'

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
  autoGraph: boolean
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (taskId: string) => void
}) {
  const t = useTranslations('tasks.create')
  const tp = useTranslations('taskPanel')
  const { typeLabel, priorityLabel } = useEnumLabels()
  const { toDateInputValue } = useFormatters()
  const { data: allTasks = [] } = useTasks(projectId)
  const { data: meData } = useMe()
  const create = useCreateTask()
  const updateProject = useUpdateProject()

  const me = meData?.user ?? null
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
  const [addToGraph, setAddToGraph] = useState(autoGraph)
  const [prevSession, setPrevSession] = useState('closed')
  const session = open ? 'open' : 'closed'
  if (session !== prevSession) {
    setPrevSession(session)
    if (open) {
      setType('task')
      setTitle('')
      setDescription('')
      setStatusId(statuses[0]?.id ?? '')
      setAssigneeId('me')
      setPriority('mid')
      setDueDate('')
      setLabels([])
      setLabelInput('')
      setParentId('')
      setAddToGraph(autoGraph)
    }
  }

  const parentCandidates = useMemo(() => {
    const allowedTypes = parentTypesForChild(type)
    return allTasks.filter((pt) => allowedTypes.includes(pt.type))
  }, [allTasks, type])

  const quickDays: ReadonlyArray<[string, number]> = [
    [tp('today'), 0],
    [tp('tomorrow'), 1],
    [tp('plus7Days'), 7],
  ]

  function addLabel() {
    const l = labelInput.trim()
    if (l && !labels.includes(l)) setLabels([...labels, l].slice(0, 20))
    setLabelInput('')
  }

  function submit() {
    if (!title.trim()) {
      toast.error(t('titleRequired'))
      return
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
          if (addToGraph !== autoGraph) {
            updateProject.mutate({ id: projectId, autoGraph: addToGraph })
          }
          toast.success(t('success', { key: task.key }))
          onOpenChange(false)
          onCreated(task.id)
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const parentTask = allTasks.find((pt) => pt.id === parentId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto custom-scroll sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-2">
            <Label>{t('type')}</Label>
            <div className="flex gap-1 rounded-lg border p-1" role="group" aria-label={t('typeAria')}>
              {TASK_TYPES.map((taskType) => (
                <button
                  key={taskType}
                  type="button"
                  onClick={() => {
                    setType(taskType)
                    setParentId('')
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                    type === taskType ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-pressed={type === taskType}
                >
                  <TypeIcon type={taskType} className={cn('h-4 w-4', type === taskType && 'text-primary-foreground')} />
                  {typeLabel(taskType)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="task-title">{t('titleLabel')}</Label>
            <Input
              id="task-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit()}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t('descriptionLabel')}</Label>
            <MarkdownEditor value={description} onChange={setDescription} minHeight={110} placeholder={t('descriptionPlaceholder')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>{t('status')}</Label>
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
              <Label>{t('priority')}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{priorityLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>{t('assignee')}</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">
                    <span className="flex items-center gap-2">
                      <UserCircle2 className="h-4 w-4 text-teal-700" />
                      {t('assignToMe', { suffix: me ? ` (${me.name})` : '' })}
                    </span>
                  </SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="flex items-center gap-2"><UserAvatar user={u} size={18} /> {u.name}</span>
                    </SelectItem>
                  ))}
                  <SelectItem value="none">{t('unassigned')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-due">{t('dueDate')}</Label>
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
                {quickDays.map(([label, days]) => (
                  <button
                    key={label}
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
                    onClick={() => {
                      const d = new Date()
                      d.setDate(d.getDate() + days)
                      setDueDate(toDateInputValue(d.toISOString()))
                    }}
                  >
                    {label}
                  </button>
                ))}
                {dueDate && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                    onClick={() => setDueDate('')}
                  >
                    <X className="h-3 w-3" /> {tp('clear')}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="task-labels">{t('labels')}</Label>
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
                placeholder={labels.length === 0 ? t('labelsPlaceholder') : ''}
                className="min-w-[100px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t('parent')}</Label>
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
                    <span className="text-muted-foreground">{t('noParent')}</span>
                  )}
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start">
                <Command>
                  <CommandInput placeholder={t('parentSearch')} />
                  <CommandList>
                    <CommandEmpty>{t('noParentCandidates')}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="no-parent" onSelect={() => { setParentId(''); setParentOpen(false) }}>
                        <Check className={cn('h-4 w-4', !parentId && 'opacity-100', parentId && 'opacity-0')} />
                        {t('noParent')}
                      </CommandItem>
                      {parentCandidates.map((pt) => (
                        <CommandItem
                          key={pt.id}
                          value={`${pt.key} ${pt.title}`}
                          onSelect={() => {
                            setParentId(pt.id)
                            setParentOpen(false)
                          }}
                        >
                          <Check className={cn('h-4 w-4', parentId === pt.id ? 'opacity-100' : 'opacity-0')} />
                          <TypeIcon type={pt.type} className="h-3.5 w-3.5" />
                          <span className="font-mono text-xs text-muted-foreground">{pt.key}</span>
                          <span className="truncate">{pt.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              {t('parentHint', { type: typeLabel(type) })}
            </p>
          </div>

          <label
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 text-sm"
            title={t('addToGraphTitle')}
          >
            <Checkbox
              checked={addToGraph}
              onCheckedChange={(v) => setAddToGraph(!!v)}
              aria-label={t('addToGraphAria')}
            />
            <Network className="h-4 w-4 text-teal-700" />
            <span className="font-medium">{t('addToGraph')}</span>
            <span className="text-xs text-muted-foreground">{t('addToGraphHint')}</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button onClick={submit} disabled={create.isPending || !title.trim()}>
            {create.isPending ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
