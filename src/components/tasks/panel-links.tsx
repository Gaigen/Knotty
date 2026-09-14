'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ArrowLeftRight, ArrowDownCircle, Link2, Plus, Trash2, ExternalLink, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { StatusBadge, TypeIcon } from '@/components/shared/bits'
import {
  CtxBackdrop, CtxContainer, CtxItem, type CtxPos,
} from '@/components/shared/context-menu-helpers'
import { useCreateLink, useCreateGraphNode, useDeleteLink } from '@/lib/api'
import type { TaskFullDto } from '@/lib/types'

/**
 * Связи (ФТ-2.7): список с типом-бейджем и переходом, добавление по ключу.
 */
export function PanelLinks({ task, onOpenTask }: { task: TaskFullDto; onOpenTask: (id: string) => void }) {
  const t = useTranslations('panels.links')
  const qc = useQueryClient()
  const create = useCreateLink()
  const addToGraph = useCreateGraphNode()
  const del = useDeleteLink()
  const [newType, setNewType] = useState('blocks')
  const [newKey, setNewKey] = useState('')

  const outgoingBlocks = task.links.filter((l) => l.type === 'blocks' && l.dir === 'out')
  const incomingBlocks = task.links.filter((l) => l.type === 'blocks' && l.dir === 'in')
  const relates = task.links.filter((l) => l.type === 'relates')

  function submit() {
    const key = newKey.trim()
    if (!key) return
    create.mutate(
      { fromTaskId: task.id, toKey: key, type: newType, projectId: task.projectId },
      {
        onSuccess: (res) => {
          setNewKey('')
          toast.success(
            res.graphNodesAdded && res.graphNodesAdded > 0
              ? t('createdWithGraph', { count: res.graphNodesAdded })
              : t('created')
          )
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  return (
    <div className="space-y-5 p-4">
      <div className="rounded-xl border bg-muted/30 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" /> {t('addTitle')}
        </div>
        <div className="flex gap-1.5">
          <Select value={newType} onValueChange={setNewType}>
            <SelectTrigger className="h-9 w-[150px] text-sm" aria-label={t('linkTypeAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blocks">
                <span className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5" /> {t('blocks')}</span>
              </SelectItem>
              <SelectItem value="relates">
                <span className="flex items-center gap-2"><ArrowLeftRight className="h-3.5 w-3.5" /> {t('relates')}</span>
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={`${task.key.slice(0, task.key.indexOf('-'))}-12`}
            className="h-9 flex-1 font-mono text-sm"
            aria-label={t('taskKeyAria')}
          />
          <Button size="sm" className="h-9 gap-1" disabled={!newKey.trim() || create.isPending} onClick={submit}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {newType === 'blocks' ? t('blocksHint', { key: task.key }) : t('relatesHint')}
        </p>
        {!task.onGraph && (
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{t('notOnGraph')}</p>
        )}
      </div>

      <LinkSection
        title={t('sectionBlocks')}
        emptyText={t('emptyBlocks', { key: task.key })}
        items={outgoingBlocks}
        task={task}
        onOpenTask={onOpenTask}
        onDelete={(id) => del.mutate({ id, projectId: task.projectId }, { onError: (e) => toast.error(e.message) })}
        addToGraph={addToGraph}
        qc={qc}
      />

      <LinkSection
        title={t('sectionBlockedBy')}
        emptyText={t('emptyBlockedBy')}
        items={incomingBlocks}
        task={task}
        onOpenTask={onOpenTask}
        onDelete={(id) => del.mutate({ id, projectId: task.projectId }, { onError: (e) => toast.error(e.message) })}
        addToGraph={addToGraph}
        qc={qc}
        incoming
      />

      <LinkSection
        title={t('sectionRelated')}
        emptyText={t('emptyRelated')}
        items={relates}
        task={task}
        onOpenTask={onOpenTask}
        onDelete={(id) => del.mutate({ id, projectId: task.projectId }, { onError: (e) => toast.error(e.message) })}
        addToGraph={addToGraph}
        qc={qc}
        relates
      />
    </div>
  )
}

function LinkSection({
  title,
  emptyText,
  items,
  task,
  onOpenTask,
  onDelete,
  addToGraph,
  qc,
  incoming,
  relates,
}: {
  title: string
  emptyText: string
  items: TaskFullDto['links']
  task: TaskFullDto
  onOpenTask: (id: string) => void
  onDelete: (id: string) => void
  addToGraph: ReturnType<typeof useCreateGraphNode>
  qc: ReturnType<typeof useQueryClient>
  incoming?: boolean
  relates?: boolean
}) {
  const t = useTranslations('panels.links')
  const [ctxMenu, setCtxMenu] = useState<{ pos: CtxPos; linkId: string; taskId: string; taskKey: string } | null>(null)

  return (
    <section aria-label={title}>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {relates ? (
          <ArrowLeftRight className="h-3.5 w-3.5" />
        ) : incoming ? (
          <ArrowDownCircle className="h-3.5 w-3.5 text-red-500" />
        ) : (
          <ArrowRight className="h-3.5 w-3.5 text-amber-600" />
        )}
        {title}
        {items.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{items.length}</Badge>}
      </h3>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((l) => (
            <li
              key={l.linkId}
              className="group flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2"
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu({ pos: { x: e.clientX, y: e.clientY }, linkId: l.linkId, taskId: l.task.id, taskKey: l.task.key })
              }}
            >
              <TypeIcon type={l.task.type} className="h-4 w-4 shrink-0" />
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onOpenTask(l.task.id)}>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{l.task.key}</span>
                <span className="truncate text-sm">{l.task.title}</span>
                {!l.task.onGraph && (
                  <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px] text-muted-foreground">{t('notOnGraphBadge')}</Badge>
                )}
                <StatusBadge name={l.task.statusName} color={l.task.statusColor} className="ml-auto hidden max-w-[110px] shrink-0 sm:inline-flex" />
              </button>
              {!l.task.onGraph && (
                <button
                  type="button"
                  title={t('addToGraph')}
                  onClick={() =>
                    addToGraph.mutate(
                      { projectId: task.projectId, refType: 'task', refId: l.task.id },
                      {
                        onSuccess: () => {
                          toast.success(t('onGraph', { key: l.task.key }))
                          qc.invalidateQueries({ queryKey: ['task', task.id] })
                        },
                        onError: (e) => toast.error(e.message),
                      }
                    )
                  }
                  className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-teal-700 group-hover:opacity-100"
                  aria-label={t('addToGraphAria', { key: l.task.key })}
                >
                  <Network className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(l.linkId)}
                className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-destructive group-hover:opacity-100"
                aria-label={t('deleteLinkAria', { key: l.task.key })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {ctxMenu && (
        <>
          <CtxBackdrop onClose={() => setCtxMenu(null)} />
          <CtxContainer pos={ctxMenu.pos} minWidth={220}>
            <CtxItem
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              label={t('openTask', { key: ctxMenu.taskKey })}
              onClick={() => {
                const id = ctxMenu.taskId
                setCtxMenu(null)
                onOpenTask(id)
              }}
            />
            <CtxItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label={t('deleteLink')}
              danger
              onClick={() => {
                const id = ctxMenu.linkId
                setCtxMenu(null)
                onDelete(id)
              }}
            />
          </CtxContainer>
        </>
      )}
    </section>
  )
}
