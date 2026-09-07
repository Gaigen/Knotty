'use client'

import { useState } from 'react'
import { Handle, NodeResizer, NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight, Pencil, Trash2, BoxSelect } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useZoomBand } from '@/components/graph/use-zoom-band'

const RESIZER_LINE = { borderWidth: 0 }
const RESIZER_HANDLE = {
  width: 9,
  height: 9,
  borderRadius: 3,
  border: '2px solid #ffffff',
  boxShadow: '0 1px 3px rgba(0,0,0,.4)',
  background: '#0f766e',
  zIndex: 50,
}
const HANDLE_CLS =
  '!z-50 !h-3 !w-3 !rounded-full !border-2 !border-white !bg-teal-600 shadow-md pointer-events-auto'

export interface GroupNodeData extends Record<string, unknown> {
  title: string
  childCount: number
  collapsed?: boolean
  dimmed?: boolean
  onResize?: (id: string, w?: number, h?: number) => void
  onResizeStart?: (id: string) => void
  onRename?: (id: string, title: string) => void
  onToggleCollapse?: (id: string) => void
  onUngroup?: (id: string) => void
  onDeleteNode?: (nodeId: string, label: string) => void
}

export function GroupNodeCard({ data, selected, id }: NodeProps) {
  const d = data as GroupNodeData
  const band = useZoomBand()
  const far = band === 'far'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(d.title)

  return (
    <div
      className={cn(
        'relative flex h-full w-full min-w-[160px] flex-col rounded-xl border-2 border-dashed border-teal-600/50 bg-teal-500/5 shadow-sm transition-opacity',
        d.dimmed && 'opacity-25',
        selected && 'ring-2 ring-teal-500/50',
        d.collapsed && 'bg-teal-500/10'
      )}
    >
      <NodeToolbar isVisible={selected && !far} position={Position.Top} offset={10} className="nodrag nopan">
        <div className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-lg">
          <button
            type="button"
            title="Разгруппировать"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              d.onUngroup?.(id)
            }}
          >
            <BoxSelect className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Переименовать"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              setDraft(d.title)
              setEditing(true)
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          <button
            type="button"
            title="Удалить рамку (содержимое останется)"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              d.onDeleteNode?.(id, 'рамку (содержимое останется)')
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </NodeToolbar>

      <NodeResizer
        isVisible={selected && !far && !d.collapsed}
        minWidth={160}
        minHeight={48}
        color="#0f766e"
        lineStyle={RESIZER_LINE}
        lineClassName="hidden"
        handleStyle={RESIZER_HANDLE}
        onResizeStart={() => d.onResizeStart?.(id)}
        onResizeEnd={(_, params) => d.onResize?.(id, params.width, params.height)}
      />

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={!far}
        className={cn(HANDLE_CLS, far && '!opacity-0 !pointer-events-none')}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={!far}
        className={cn(HANDLE_CLS, far && '!opacity-0 !pointer-events-none')}
      />

      <div className="flex h-11 shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          className="nodrag nopan rounded p-0.5 text-teal-800 hover:bg-teal-600/10 dark:text-teal-200"
          title={d.collapsed ? 'Развернуть' : 'Свернуть'}
          onClick={(e) => {
            e.stopPropagation()
            d.onToggleCollapse?.(id)
          }}
        >
          {d.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {editing ? (
          <input
            className="nodrag nopan h-7 min-w-0 flex-1 rounded border bg-background px-1.5 text-xs font-medium outline-none"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false)
              const t = draft.trim() || 'Пачка'
              if (t !== d.title) d.onRename?.(id, t)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                setDraft(d.title)
                setEditing(false)
              }
              e.stopPropagation()
            }}
          />
        ) : (
          <button
            type="button"
            className="nodrag nopan min-w-0 flex-1 truncate text-left text-xs font-semibold text-teal-900 dark:text-teal-100"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setDraft(d.title)
              setEditing(true)
            }}
          >
            {far ? d.title : d.title || 'Пачка'}
          </button>
        )}
        <span className="shrink-0 rounded-full bg-teal-600/15 px-1.5 py-0.5 text-[10px] font-medium text-teal-800 dark:text-teal-200">
          {d.childCount}
        </span>
      </div>
    </div>
  )
}
