'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowRight, FolderKanban, MoreHorizontal, Pencil, Plus, Search, Star, Trash2, Boxes, Copy, ExternalLink, Users, LogOut, KeyRound, ShieldCheck, Plug,
} from 'lucide-react'
import { APP_NAME, APP_TAGLINE } from '@/lib/branding'
import { KnottyMark } from '@/components/shared/knotty-mark'
import { prefGet, prefKey } from '@/lib/prefs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProjects, useUpdateProject, useMe, logoutRequest } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { projectUrl, getLastProjectId } from '@/lib/nav'
import type { ProjectSummaryDto } from '@/lib/types'
import { EmptyState } from '@/components/shared/bits'
import { UserAvatar } from '@/components/shared/bits'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { ProjectDialog } from '@/components/launcher/project-dialog'
import { ImportProjectButton } from '@/components/launcher/import-project-button'
import { DeleteProjectDialog } from '@/components/launcher/delete-project-dialog'
import {
  CtxBackdrop, CtxContainer, CtxItem, CtxSeparator, type CtxPos,
} from '@/components/shared/context-menu-helpers'
import { copyToClipboard } from '@/lib/api'
import { ChangePasswordDialog } from '@/components/auth/change-password-dialog'
import { ApiTokensDialog } from '@/components/auth/api-tokens-dialog'

type SortMode = 'recent' | 'name' | 'count'

export function Launcher() {
  const router = useRouter()
  const qc = useQueryClient()
  const { data: projects = [], isLoading } = useProjects()
  const favMut = useUpdateProject()
  const { data: meData } = useMe()
  const me = meData?.user ?? null
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [apiTokensOpen, setApiTokensOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('recent')
  const [lastProjectId, setLastProjectId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ProjectSummaryDto | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummaryDto | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ pos: CtxPos; project: ProjectSummaryDto } | null>(null)

  useEffect(() => {
    // чтение localStorage — внешнее хранилище, допустимо в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastProjectId(getLastProjectId())
  }, [])

  const lastProject = useMemo(
    () => projects.find((p) => p.id === lastProjectId) ?? null,
    [projects, lastProjectId]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = projects
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      )
    }
    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    else if (sort === 'count') sorted.sort((a, b) => b.counts.total - a.counts.total)
    else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    // избранное — всегда сверху (ФТ-1.4/1.5)
    return sorted.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))
  }, [projects, search, sort])

  async function logout() {
    await logoutRequest()
    // полностью чистим кеш (сессия, проекты, задачи) — следующий пользователь
    // не должен видеть данные предыдущего
    qc.clear()
    router.replace('/login')
  }

  function openProject(p: ProjectSummaryDto) {
    let tab: 'tasks' | 'board' | 'graph' = 'tasks'
    try {
      const t = prefGet(prefKey(`lastTab:${p.id}`))
      if (t === 'tasks' || t === 'board' || t === 'graph') tab = t
    } catch {}
    router.push(projectUrl(p.id, tab))
  }

  function openProjectNewTab(p: ProjectSummaryDto) {
    let tab: 'tasks' | 'board' | 'graph' = 'tasks'
    try {
      const t = prefGet(prefKey(`lastTab:${p.id}`))
      if (t === 'tasks' || t === 'board' || t === 'graph') tab = t
    } catch {}
    window.open(projectUrl(p.id, tab), '_blank', 'noopener')
  }

  async function copyProjectKey(p: ProjectSummaryDto) {
    if (await copyToClipboard(p.key)) toast.success('Ключ скопирован')
    else toast.error('Не удалось скопировать')
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <KnottyMark className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">{APP_NAME}</h1>
              <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
            </div>
          </div>
          <div className="flex h-9 items-center gap-2">
            {me?.isAdmin && (
              <Button variant="ghost" size="icon" asChild aria-label="Пользователи" title="Пользователи">
                <Link href="/admin/users">
                  <Users className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <ThemeToggle />
            <ImportProjectButton onImported={(id) => router.push(projectUrl(id))} />
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Проект
            </Button>
            {me && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-1.5 pl-1.5 pr-3"
                    aria-label={`Аккаунт: ${me.name}`}
                  >
                    <UserAvatar user={me} size={24} />
                    <span className="hidden max-w-[140px] truncate sm:inline">{me.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="truncate text-sm font-medium">{me.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{me.email}</p>
                    {me.isAdmin && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                        <ShieldCheck className="h-3 w-3" /> администратор
                      </p>
                    )}
                  </div>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem onSelect={() => setChangePwOpen(true)} className="gap-2">
                    <KeyRound className="h-4 w-4" /> Сменить пароль
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setApiTokensOpen(true)} className="gap-2">
                    <Plug className="h-4 w-4" /> API-токены
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem onSelect={logout} className="gap-2 text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4" /> Выйти
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* ФТ-1.2 — «Продолжить работу» */}
        {lastProject && !search && (
          <section className="mb-8" aria-label="Продолжить работу">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Продолжить работу</h2>
            <button
              type="button"
              onClick={() => openProject(lastProject)}
              className="group flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md"
            >
              <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: lastProject.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{lastProject.name}</span>
                  <Badge variant="secondary" className="font-mono text-[11px]">{lastProject.key}</Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{lastProject.counts.total} задач</span>
                  <span aria-hidden>·</span>
                  <span>{lastProject.counts.inProgress} в работе</span>
                  <span aria-hidden>·</span>
                  <span>обновлён {timeAgo(lastProject.updatedAt)}</span>
                </div>
                {/* мини-прогрессбар по категориям статусов */}
                <div className="mt-2.5 flex h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted">
                  {lastProject.counts.total > 0 && (
                    <>
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${(lastProject.counts.done / lastProject.counts.total) * 100}%` }}
                        title={`Готово: ${lastProject.counts.done}`}
                      />
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${(lastProject.counts.inProgress / lastProject.counts.total) * 100}%` }}
                        title={`В работе: ${lastProject.counts.inProgress}`}
                      />
                      <div className="h-full bg-muted-foreground/25" style={{ width: '100%' }} title={`Осталось: ${lastProject.counts.total - lastProject.counts.done - lastProject.counts.inProgress}`} />
                    </>
                  )}
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          </section>
        )}

        {/* ФТ-1.3 поиск + ФТ-1.4 сортировка */}
        <section aria-label="Проекты">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию, ключу, описанию…"
                className="pl-9"
                aria-label="Поиск проектов"
              />
            </div>
            <div className="flex h-9 shrink-0 items-stretch gap-0.5 rounded-lg border bg-background p-1" role="group" aria-label="Сортировка">
              {(
                [
                  ['recent', 'Недавние'],
                  ['name', 'По названию'],
                  ['count', 'По числу задач'],
                ] as [SortMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSort(mode)}
                  className={cn(
                    'inline-flex items-center rounded-md px-3 text-sm font-medium transition-colors',
                    sort === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[72px] animate-pulse rounded-xl border bg-card" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            // ФТ-1.8 пустой список
            <EmptyState
              icon={<FolderKanban className="h-10 w-10" />}
              title="Пока нет ни одного проекта"
              description="Создайте первый проект — задачи, канбан и граф связей появятся внутри."
              action={
                <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Создать первый проект
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Search className="h-10 w-10" />}
              title="Ничего не найдено"
              description={`По запросу «${search}» проектов нет. Попробуйте изменить формулировку.`}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  onOpen={() => openProject(p)}
                  onEdit={() => setEditTarget(p)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setCtxMenu({ pos: { x: e.clientX, y: e.clientY }, project: p })
                  }}
                  onDelete={() => setDeleteTarget(p)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <ProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => router.push(projectUrl(id, 'tasks'))}
      />
      <ProjectDialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)} project={editTarget} />
      <ChangePasswordDialog open={changePwOpen} onOpenChange={setChangePwOpen} hasPassword />
      <ApiTokensDialog open={apiTokensOpen} onOpenChange={setApiTokensOpen} />
      <DeleteProjectDialog
        project={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          toast.success(`Проект «${deleteTarget?.name}» удалён`)
          setDeleteTarget(null)
        }}
      />

      {ctxMenu && (
        <>
          <CtxBackdrop onClose={() => setCtxMenu(null)} />
          <CtxContainer pos={ctxMenu.pos} minWidth={240}>
            <CtxItem
              icon={<ArrowRight className="h-3.5 w-3.5" />}
              label="Открыть"
              onClick={() => { const p = ctxMenu.project; setCtxMenu(null); openProject(p) }}
            />
            <CtxItem
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              label="Открыть в новой вкладке"
              onClick={() => { const p = ctxMenu.project; setCtxMenu(null); openProjectNewTab(p) }}
            />
            <CtxItem
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Редактировать…"
              onClick={() => { const p = ctxMenu.project; setCtxMenu(null); setEditTarget(p) }}
            />
            <CtxSeparator />
            <CtxItem
              icon={<Copy className="h-3.5 w-3.5" />}
              label="Копировать ключ"
              onClick={() => { const p = ctxMenu.project; copyProjectKey(p); setCtxMenu(null) }}
            />
            <CtxItem
              icon={<Star className={cn('h-3.5 w-3.5', ctxMenu.project.isFavorite && 'fill-amber-400 text-amber-400')} />}
              label={ctxMenu.project.isFavorite ? 'Убрать из избранного' : 'В избранное'}
              onClick={() => {
                const p = ctxMenu.project
                favMut.mutate({ id: p.id, isFavorite: !p.isFavorite })
                setCtxMenu(null)
              }}
            />
            <CtxSeparator />
            <CtxItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Удалить проект…"
              danger
              onClick={() => { const p = ctxMenu.project; setCtxMenu(null); setDeleteTarget(p) }}
            />
          </CtxContainer>
        </>
      )}
    </div>
  )
}

function ProjectRow({
  project,
  onOpen,
  onEdit,
  onDelete,
  onContextMenu,
}: {
  project: ProjectSummaryDto
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const fav = useUpdateProject()

  function toggleFavorite(e: React.MouseEvent) {
    e.stopPropagation()
    fav.mutate({ id: project.id, isFavorite: !project.isFavorite })
  }

  return (
    <div
      className="group flex cursor-pointer items-center gap-4 rounded-xl border bg-card p-4 transition-all hover:shadow-md"
      onClick={onOpen}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      aria-label={`Открыть проект ${project.name}`}
    >
      <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {project.isFavorite && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
          <span className="truncate font-medium">{project.name}</span>
          <Badge variant="secondary" className="font-mono text-[11px]">{project.key}</Badge>
        </div>
        {project.description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{project.description}</p>
        )}
      </div>
      <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
        <div className="flex items-center justify-end gap-3">
          <span>{project.counts.total} задач</span>
          <span aria-hidden>·</span>
          <span>{project.counts.inProgress} в работе</span>
        </div>
        <div className="mt-0.5">обновлён {timeAgo(project.updatedAt)}</div>
      </div>
      {/* ФТ-1.5 — звёздочка избранного на строке */}
      <button
        type="button"
        onClick={toggleFavorite}
        className={cn(
          'shrink-0 rounded-md p-1.5 transition-colors',
          project.isFavorite
            ? 'text-amber-400 opacity-100'
            : 'text-muted-foreground/50 opacity-0 hover:text-amber-400 group-hover:opacity-100 focus-visible:opacity-100'
        )}
        aria-label={project.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
        aria-pressed={project.isFavorite}
      >
        <Star className={cn('h-4 w-4', project.isFavorite && 'fill-amber-400')} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Меню проекта</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4" /> Редактировать
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" /> Удалить…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
