'use client'

import { useStore } from '@xyflow/react'
import type { AlignmentGuide } from '@/lib/graph-guides'

const selector = (s: { transform: [number, number, number] }) => s.transform

/** SVG-направляющие в flow-space (масштабируются вместе с viewport). */
export function GraphAlignmentGuides({ guides }: { guides: AlignmentGuide[] }) {
  const transform = useStore(selector)
  const [tx, ty, zoom] = transform

  if (guides.length === 0) return null

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5] overflow-visible"
      style={{ width: '100%', height: '100%' }}
    >
      <g transform={`translate(${tx}, ${ty}) scale(${zoom})`}>
        {guides.map((g, i) =>
          g.type === 'vertical' ? (
            <line
              key={`v-${i}`}
              x1={g.pos}
              y1={g.from}
              x2={g.pos}
              y2={g.to}
              stroke="#14b8a6"
              strokeWidth={1 / zoom}
              strokeOpacity={0.85}
            />
          ) : (
            <line
              key={`h-${i}`}
              x1={g.from}
              y1={g.pos}
              x2={g.to}
              y2={g.pos}
              stroke="#14b8a6"
              strokeWidth={1 / zoom}
              strokeOpacity={0.85}
            />
          )
        )}
      </g>
    </svg>
  )
}
