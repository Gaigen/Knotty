'use client'

import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { X } from 'lucide-react'
import { graphEdgeStrokeStyle, type GraphEdgeKind } from '@/lib/graph-edge-theme'

export interface KnottyEdgeData extends Record<string, unknown> {
  kind: GraphEdgeKind
  /** подпись типа (blocks/relates), показывается при hover/выделении */
  label?: string
  onDeleteEdge?: (id: string, kind: GraphEdgeKind) => void
}

/**
 * Единое ребро графа: цвет/стиль по типу, подпись и кнопка удаления появляются
 * при наведении или выделении. Рёбра иерархии (tree) не удаляются.
 */
export function KnottyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  markerStart,
  data,
  selected,
  style,
}: EdgeProps) {
  const d = data as KnottyEdgeData
  const [hover, setHover] = useState(false)
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const active = hover || selected
  const base = graphEdgeStrokeStyle(d.kind)
  const mergedStyle: React.CSSProperties = {
    ...base,
    ...(style ?? {}),
    strokeWidth: active ? (base.strokeWidth as number) + 0.5 : base.strokeWidth,
  }

  return (
    <g
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="nodrag nopan"
    >
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} markerStart={markerStart} style={mergedStyle} />
      <EdgeLabelRenderer>
        {active && d.kind !== 'tree' && (
          <button
            type="button"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan flex h-5 w-5 items-center justify-center rounded-full border bg-background shadow transition-colors hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              d.onDeleteEdge?.(id, d.kind)
            }}
            aria-label="Удалить связь"
            title="Удалить связь"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {active && d.label && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 16}px)`,
              pointerEvents: 'none',
            }}
            className="nodrag nopan rounded border bg-background/95 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
          >
            {d.label}
          </div>
        )}
      </EdgeLabelRenderer>
    </g>
  )
}
