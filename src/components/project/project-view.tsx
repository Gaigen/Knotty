'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Boxes, Download, KanbanSquare, ListTodo, MoreHorizontal, Pencil, Plus, Share2, Star, Trash2, Network, Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProject, useUsers, copyToClipboard, useUpdateProject } from '@/lib/api'
import { cn } from '@/lib/utils'
import { rememberLastProject, projectTaskUrl, type ProjectTab } from '@/lib/nav'
import { prefKey, prefSet } from '@/lib/prefs'
import { isEditableTarget } from '@/lib/keyboard'
import { TasksView } from '@/components/tasks/tasks-view'
import { BoardView } from '@/components/board/board-view'
import { GraphView } from '@/components/graph/graph-view'
import { TaskPanel } from '@/components/tasks/task-panel'
import { CreateTaskModal } from '@/components/project/create-task-modal'
import { WorkflowDialog } from '@/components/project/workflow-dialog'
import { ProjectDialog } from '@/components/launcher/project-dialog'
import { DeleteProjectDialog } from '@/components/launcher/delete-project-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/bits'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import type { ProjectSummaryDto } from '@/lib/types'
import { EMPTY_FILTERS, type FiltersState } from '@/components/project/filters'

export function ProjectView({
  projectId,
  initialTab,
  taskId,
}: {
  projectId: string
  initialTab: ProjectTab
  taskId: string | null
}) {
  const router = useRouter()
  const { data: project, isLoading, error } = useProject(projectId)
  const { data: users = [] } = useUsers()
  const favMut = useUpdateProject()

  const [tab, setTab] = useState<ProjectTab>(initialTab)
  const [taskIdOpen, setTaskIdOpen] = useState<string | null>(taskId)
  const [createOpen, setCreateOpen] = useState(false)
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false)
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [filters, setFilters] = useState<FiltersState>({ ...EMPTY_FILTERS })
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    rememberLastProject(projectId)
  }, [projectId])

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab, projectId])

  useEffect(() => {
    setTaskIdOpen(taskId)
  }, [taskId])

  const navigate = useCallback(
    (nextTab: ProjectTab, nextTaskId: string | null) => {
      setTab(nextTab)
      prefSet(prefKey(`lastTab:${projectId}`), nextTab)
      router.replace(projectTaskUrl(projectId, nextTab, nextTaskId), { scroll: false })
    },
    [projectId, router]
  )

  function openTask(t: string) {
    setTaskIdOpen(t)
    router.replace(projectTaskUrl(projectId, tab, t), { scroll: false })
  }

  function closeTaskPanel() {
    setTaskIdOpen(null)
    router.replace(projectTaskUrl(projectId, tab, null), { scroll: false })
  }

  // Горячие клавиши (ФТ-2.10): N — создать, Esc — закрыть панель, / — фокус поиска,
  // 1/2/3 — переключение вкладок. e.code — одна и та же физическая клавиша на любой раскладке.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return
      if (e.code === 'Slash' && tab !== 'graph') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.code === 'KeyN') {
        e.preventDefault()
        setCreateOpen(true)
      } else if (e.code === 'Escape') {
        if (taskIdOpen) closeTaskPanel()
      } else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
        const nextTabs: ProjectTab[] = ['tasks', 'board', 'graph']
        const digit = e.code === 'Digit1' ? 0 : e.code === 'Digit2' ? 1 : 2
        const next = nextTabs[digit]
        if (next && next !== tab) {
          e.preventDefault()
          navigate(next, null)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
     
  }, [taskIdOpen, tab, projectId])

  const projectSummary: ProjectSummaryDto | null = useMemo(
    () =>
      project
        ? {
            id: project.id,
            key: project.key,
            name: project.name,
            description: project.description,
            color: project.color,
            isFavorite: project.isFavorite,
            counts: project.counts,
            updatedAt: project.updatedAt,
            createdAt: project.createdAt,
          }
        : null,
    [project]
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <div className="border-b bg-background px-6 py-4">
          <Skeleton className="h-8 w-72" />
        </div>
        <div className="p-6">
          <Skeleton className="mb-4 h-9 w-full" />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="mb-2 h-10 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md">
          <EmptyState
            icon={<Boxes className="h-10 w-10" />}
            title="Проект не найден"
            description="Возможно, он был удалён или ссылка устарела."
            action={<Button onClick={() => router.push('/')}>К списку проектов</Button>}
          />
        </div>
      </div>
    )
  }

  const isDesktopView = tab !== 'tasks'
  void isDesktopView

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-muted/30">
      {/* Шапка проекта */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="px-4 sm:px-6">
          <div className="flex items-center gap-3 py-2.5">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.push('/')} aria-label="К списку проектов">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[15px] font-semibold leading-tight">{project.name}</h1>
                <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">{project.key}</Badge>
                <button
                  type="button"
                  onClick={() => favMut.mutate({ id: project.id, isFavorite: !project.isFavorite })}
                  disabled={favMut.isPending}
                  className={cn(
                    'shrink-0 rounded-md p-1 transition-colors hover:bg-muted disabled:opacity-50',
                    project.isFavorite ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-400'
                  )}
                  aria-label={project.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                  aria-pressed={project.isFavorite}
                  title={project.isFavorite ? 'Убрать из избранного' : 'В избранное'}
                >
                  <Star className={cn('h-3.5 w-3.5', project.isFavorite && 'fill-amber-400')} />
                </button>
              </div>
              {project.description && <p className="hidden truncate text-xs text-muted-foreground md:block">{project.description}</p>}
            </div>

            <ThemeToggle />

            <Button size="sm" className="ml-auto shrink-0 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Задача</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Меню проекта">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditProjectOpen(true)}>
                  <Pencil className="h-4 w-4" /> Редактировать
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setWorkflowOpen(true)}>
                  <Workflow className="h-4 w-4" /> Настроить workflow…
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    const url = `${window.location.origin}/?project=${project.id}`
                    if (await copyToClipboard(url)) toast.success('Ссылка на проект скопирована')
                    else toast.error('Не удалось скопировать')
                  }}
                >
                  <Share2 className="h-4 w-4" /> Копировать ссылку
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open(`/api/projects/${project.id}/export`, '_blank')}>
                  <Download className="h-4 w-4" /> Экспорт JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open(`/api/projects/${project.id}/export/bundle`, '_blank')}>
                  <Download className="h-4 w-4" /> Экспорт ZIP (с файлами)
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteProjectOpen(true)}
                >
                  <Trash2 className="h-4 w-4" /> Удалить проект…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Вкладки — порядок UI: Задачи, Доска, Граф (п. 2).
              Сегмент-контрол + горячие клавиши 1/2/3 + счётчики */}
          <div className="pb-2">
            <div
              className="inline-flex items-center gap-1 rounded-lg bg-muted p-1"
              role="tablist"
              aria-label="Разделы проекта"
            >
            {(
              [
                ['tasks', 'Задачи', <ListTodo key="i" className="h-4 w-4" />, `${project.counts.total}`],
                ['board', 'Доска', <KanbanSquare key="i" className="h-4 w-4" />, `${project.counts.inProgress}`],
                ['graph', 'Граф', <Network key="i" className="h-4 w-4" />, null],
              ] as [ProjectTab, string, React.ReactNode, string | null][]
            ).map(([value, label, icon, count], idx) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => navigate(value, null)}
                title={`${label} (${idx + 1})`}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-all',
                  tab === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {icon}
                <span>{label}</span>
                {count !== null && (
                  <span
                    className={cn(
                      'min-w-[20px] rounded-full px-1.5 text-center text-[10px] font-semibold leading-4',
                      tab === value ? 'bg-muted text-muted-foreground' : 'bg-background/60 text-muted-foreground'
                    )}
                  >
                    {count}
                  </span>
                )}
                <kbd className="ml-0.5 hidden rounded border bg-background/80 px-1 font-mono text-[9px] font-medium text-muted-foreground sm:inline-flex sm:h-4 sm:min-w-4 sm:items-center sm:justify-center">
                  {idx + 1}
                </kbd>
              </button>
            ))}
          </div>
        </div>
        </div>
      </header>

      {/* Контент вкладки */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {tab === 'tasks' && (
          <TasksView
            project={project}
            users={users}
            filters={filters}
            onFiltersChange={setFilters}
            search={search}
            onSearchChange={setSearch}
            searchRef={searchRef}
            onOpenTask={openTask}
            activeTaskId={taskIdOpen}
            onCreateTask={() => setCreateOpen(true)}
          />
        )}
        {tab === 'board' && (
          <BoardView
            project={project}
            users={users}
            filters={filters}
            onFiltersChange={setFilters}
            search={search}
            onSearchChange={setSearch}
            searchRef={searchRef}
            onOpenTask={openTask}
            activeTaskId={taskIdOpen}
          />
        )}
        {tab === 'graph' && <GraphView project={project} users={users} onOpenTask={openTask} />}
      </main>

      {/* Панель задачи поверх вьюхи (ФТ-2.7, ФТ-4.8) */}
      {taskIdOpen && (
        <TaskPanel
          taskId={taskIdOpen}
          users={users}
          statuses={project.statuses}
          projectKey={project.key}
          onClose={closeTaskPanel}
          onOpenTask={openTask}
          onDeleted={() => closeTaskPanel()}
        />
      )}

      <CreateTaskModal
        projectId={project.id}
        statuses={project.statuses}
        users={users}
        autoGraph={project.autoGraph}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => openTask(id)}
      />

      <ProjectDialog open={editProjectOpen} onOpenChange={setEditProjectOpen} project={projectSummary} />
      <WorkflowDialog project={project} open={workflowOpen} onOpenChange={setWorkflowOpen} />
      <DeleteProjectDialog
        project={deleteProjectOpen ? projectSummary : null}
        onClose={() => setDeleteProjectOpen(false)}
        onDeleted={() => router.push('/')}
      />
    </div>
  )
}
