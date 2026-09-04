'use client'

import { GRAPH_ARROW_MARKER_PX, GRAPH_EDGE_LEGEND } from '@/lib/graph-edge-theme'
import { cn } from '@/lib/utils'

/** Стрелка в легенде — тот же размер, что на канвасе */
const LEGEND_ARROW_W = GRAPH_ARROW_MARKER_PX
const LEGEND_ARROW_H = GRAPH_ARROW_MARKER_PX * 0.55

export function GraphEdgeLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1.5', className)}>
      {GRAPH_EDGE_LEGEND.map((item) => (
        <span key={item.kind} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
          <svg width="32" height="10" viewBox="0 0 32 10" aria-hidden className="shrink-0">
            <line
              x1="2"
              y1="5"
              x2={item.arrowEnd ? 24 : 28}
              y2="5"
              stroke={item.color}
              strokeWidth={item.strokeWidth}
              strokeDasharray={item.dasharray}
            />
            {item.arrowEnd && (
              <polygon
                points={`28,5 ${28 - LEGEND_ARROW_W},${5 - LEGEND_ARROW_H / 2} ${28 - LEGEND_ARROW_W},${5 + LEGEND_ARROW_H / 2}`}
                fill={item.color}
              />
            )}
          </svg>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  )
}
