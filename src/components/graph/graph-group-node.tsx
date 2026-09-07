'use client'

import { useState } from 'react'
import { Handle, NodeResizer, NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight, Pencil, Trash2, BoxSelect, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useZoomBand } from '@/components/graph/use-zoom-band'
import { GROUP_COLOR_PRESETS, groupColorStyles, normalizeGroupColor } from '@/lib/graph-group-color'

const RESIZER_LINE = { borderWidth: 0 }

export interface GroupNodeData extends Record<string, unknown> {
  title: string
  childCount: number
  color?: string | null
  collapsed?: boolean
  dimmed?: boolean
  onResize?: (id: string, w?: number, h?: number) => void
  onResizeStart?: (id: string) => void
  onRename?: (id: string, title: string) => void
  onColorChange?: (id: string, color: string) => void
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
  const [colorOpen, setColorOpen] = useState(false)
  const accent = normalizeGroupColor(d.color)
  const palette = groupColorStyles(accent)
  const resizerHandle = {
    width: 9,
    height: 9,
    borderRadius: 3,
    border: '2px solid #ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,.4)',
    background: palette.resizerColor,
    zIndex: 50,
  }
  const handleCls =
    '!z-50 !h-3 !w-3 !rounded-full !border-2 !border-white shadow-md pointer-events-auto'

  return (
    <div
      className={cn(
        'relative flex h-full w-full min-w-[160px] flex-col rounded-xl border-2 border-dashed shadow-sm transition-opacity',
        d.dimmed && 'opacity-25',
        selected && 'ring-2',
        d.collapsed && ''
      )}
      style={{
        borderColor: palette.borderColor,
        backgroundColor: d.collapsed ? palette.backgroundCollapsed : palette.backgroundColor,
        ...(selected ? { boxShadow: `0 0 0 2px ${palette.ringColor}` } : {}),
      }}
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
          <button
            type="button"
            title="Цвет рамки"
            className={cn(
              'rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground',
              colorOpen && 'bg-muted text-foreground'
            )}
            onClick={(e) => {
              e.stopPropagation()
              setColorOpen((v) => !v)
            }}
          >
            <Palette className="h-3.5 w-3.5" />
          </button>
          {colorOpen && (
            <div className="flex items-center gap-1 px-0.5">
              {GROUP_COLOR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.label}
                  className={cn(
                    'h-4 w-4 rounded-full border-2 transition-transform hover:scale-110',
                    accent === p.hex ? 'border-foreground' : 'border-transparent'
                  )}
                  style={{ backgroundColor: p.hex }}
                  onClick={(e) => {
                    e.stopPropagation()
                    d.onColorChange?.(id, p.hex)
                    setColorOpen(false)
                  }}
                />
              ))}
              <label
                className="relative ml-0.5 flex h-4 w-4 cursor-pointer overflow-hidden rounded-full border border-border"
                title="Свой цвет"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="absolute inset-0 bg-gradient-to-br from-red-500 via-green-500 to-blue-500 opacity-80" />
                <input
                  type="color"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  value={accent}
                  onChange={(e) => {
                    d.onColorChange?.(id, e.target.value)
                    setColorOpen(false)
                  }}
                />
              </label>
            </div>
          )}
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
        color={palette.resizerColor}
        lineStyle={RESIZER_LINE}
        lineClassName="hidden"
        handleStyle={resizerHandle}
        onResizeStart={() => d.onResizeStart?.(id)}
        onResizeEnd={(_, params) => d.onResize?.(id, params.width, params.height)}
      />

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={!far}
        className={cn(handleCls, far && '!opacity-0 !pointer-events-none')}
        style={{ background: palette.handleBg }}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={!far}
        className={cn(handleCls, far && '!opacity-0 !pointer-events-none')}
        style={{ background: palette.handleBg }}
      />

      <div className="flex h-11 shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          className="nodrag nopan rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: palette.headerText }}
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
            className="nodrag nopan min-w-0 flex-1 truncate text-left text-xs font-semibold"
            style={{ color: palette.headerText }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setDraft(d.title)
              setEditing(true)
            }}
          >
            {far ? d.title : d.title || 'Пачка'}
          </button>
        )}
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: palette.badgeBg, color: palette.headerText }}
        >
          {d.childCount}
        </span>
      </div>
    </div>
  )
}
