'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  ArrowRight, FolderKanban, MoreHorizontal, Pencil, Plus, Search, Star, Trash2, Boxes, Copy, ExternalLink, Users,
} from 'lucide-react'
import { APP_NAME } from '@/lib/branding'
import { Link, useRouter } from '@/i18n/navigation'
import { useFormatters } from '@/lib/i18n/use-formatters'
import { KnottyMark } from '@/components/shared/knotty-mark'
import { prefGet, prefKey } from '@/lib/prefs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProjects, useUpdateProject, useMe } from '@/lib/api'
import { cn } from '@/lib/utils'
import { projectUrl, getLastProjectId } from '@/lib/nav'
import type { ProjectSummaryDto } from '@/lib/types'
import { EmptyState } from '@/components/shared/bits'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { AccountMenu } from '@/components/auth/account-menu'
import { ProjectDialog } from '@/components/launcher/project-dialog'
import { ImportProjectButton } from '@/components/launcher/import-project-button'
import { DeleteProjectDialog } from '@/components/launcher/delete-project-dialog'
import {
  CtxBackdrop, CtxContainer, CtxItem, CtxSeparator, type CtxPos,
} from '@/components/shared/context-menu-helpers'
import { copyToClipboard } from '@/lib/api'

type SortMode = 'recent' | 'name' | 'count'

export function Launcher() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('launcher')
  const tb = useTranslations('branding')
  const tc = useTranslations('common')
  const { timeAgo } = useFormatters()
  const { data: projects = [], isLoading } = useProjects()
  const favMut = useUpdateProject()
  const { data: meData } = useMe()
  const me = meData?.user ?? null
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
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, locale))
    else if (sort === 'count') sorted.sort((a, b) => b.counts.total - a.counts.total)
    else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    // избранное — всегда сверху (ФТ-1.4/1.5)
    return sorted.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))
  }, [projects, search, sort])

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
    if (await copyToClipboard(p.key)) toast.success(t('keyCopied'))
    else toast.error(t('copyFailed'))
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
              <p className="text-xs text-muted-foreground">{tb('tagline')}</p>
            </div>
          </div>
          <div className="flex h-9 items-center gap-2">
            {me?.isAdmin && (
              <Button variant="ghost" size="icon" asChild aria-label={t('users')} title={t('users')}>
                <Link href="/admin/users">
                  <Users className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <ThemeToggle />
            <ImportProjectButton onImported={(id) => router.push(projectUrl(id))} />
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> {tc('project')}
            </Button>
            {me && <AccountMenu user={me} />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* ФТ-1.2 — «Продолжить работу» */}
        {lastProject && !search && (
          <section className="mb-8" aria-label={t('continueWork')}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t('continueWork')}</h2>
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
                  <span>{lastProject.counts.total} {tc('tasks')}</span>
                  <span aria-hidden>·</span>
                  <span>{lastProject.counts.inProgress} {tc('inProgress')}</span>
                  <span aria-hidden>·</span>
                  <span>{tc('updated', { time: timeAgo(lastProject.updatedAt) })}</span>
                </div>
                {/* мини-прогрессбар по категориям статусов */}
                <div className="mt-2.5 flex h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted">
                  {lastProject.counts.total > 0 && (
                    <>
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${(lastProject.counts.done / lastProject.counts.total) * 100}%` }}
                        title={tc('done', { count: lastProject.counts.done })}
                      />
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${(lastProject.counts.inProgress / lastProject.counts.total) * 100}%` }}
                        title={`${lastProject.counts.inProgress} ${tc('inProgress')}`}
                      />
                      <div className="h-full bg-muted-foreground/25" style={{ width: '100%' }} title={tc('remaining', { count: lastProject.counts.total - lastProject.counts.done - lastProject.counts.inProgress })} />
                    </>
                  )}
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          </section>
        )}

        {/* ФТ-1.3 поиск + ФТ-1.4 сортировка */}
        <section aria-label={t('projects')}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="pl-9"
                aria-label={t('searchAria')}
              />
            </div>
            <div className="flex h-9 shrink-0 items-stretch gap-0.5 rounded-lg border bg-background p-1" role="group" aria-label={t('sortAria')}>
              {(
                [
                  ['recent', t('sortRecent')],
                  ['name', t('sortName')],
                  ['count', t('sortCount')],
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
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={
                <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" /> {t('emptyAction')}
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Search className="h-10 w-10" />}
              title={t('notFoundTitle')}
              description={t('notFoundDescription', { query: search })}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  timeAgo={timeAgo}
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
      <DeleteProjectDialog
        project={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          toast.success(t('projectDeleted', { name: deleteTarget?.name ?? '' }))
          setDeleteTarget(null)
        }}
      />

      {ctxMenu && (
        <>
          <CtxBackdrop onClose={() => setCtxMenu(null)} />
          <CtxContainer pos={ctxMenu.pos} minWidth={240}>
            <CtxItem
              icon={<ArrowRight className="h-3.5 w-3.5" />}
              label={t('open')}
              onClick={() => { const p = ctxMenu.project; setCtxMenu(null); openProject(p) }}
            />
            <CtxItem
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              label={t('openNewTab')}
              onClick={() => { const p = ctxMenu.project; setCtxMenu(null); openProjectNewTab(p) }}
            />
            <CtxItem
              icon={<Pencil className="h-3.5 w-3.5" />}
              label={t('editProject')}
              onClick={() => { const p = ctxMenu.project; setCtxMenu(null); setEditTarget(p) }}
            />
            <CtxSeparator />
            <CtxItem
              icon={<Copy className="h-3.5 w-3.5" />}
              label={t('copyKey')}
              onClick={() => { const p = ctxMenu.project; copyProjectKey(p); setCtxMenu(null) }}
            />
            <CtxItem
              icon={<Star className={cn('h-3.5 w-3.5', ctxMenu.project.isFavorite && 'fill-amber-400 text-amber-400')} />}
              label={ctxMenu.project.isFavorite ? t('removeFavorite') : t('addFavorite')}
              onClick={() => {
                const p = ctxMenu.project
                favMut.mutate({ id: p.id, isFavorite: !p.isFavorite })
                setCtxMenu(null)
              }}
            />
            <CtxSeparator />
            <CtxItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label={t('deleteProject')}
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
  timeAgo,
  onOpen,
  onEdit,
  onDelete,
  onContextMenu,
}: {
  project: ProjectSummaryDto
  timeAgo: (iso: string | null | undefined) => string
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const t = useTranslations('launcher')
  const tc = useTranslations('common')
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
      aria-label={t('openProjectAria', { name: project.name })}
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
          <span>{project.counts.total} {tc('tasks')}</span>
          <span aria-hidden>·</span>
          <span>{project.counts.inProgress} {tc('inProgress')}</span>
        </div>
        <div className="mt-0.5">{tc('updated', { time: timeAgo(project.updatedAt) })}</div>
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
        aria-label={project.isFavorite ? t('removeFavoriteAria') : t('addFavoriteAria')}
        aria-pressed={project.isFavorite}
      >
        <Star className={cn('h-4 w-4', project.isFavorite && 'fill-amber-400')} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">{t('projectMenu')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4" /> {tc('edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" /> {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
