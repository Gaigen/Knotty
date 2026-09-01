import { MarkerType, type EdgeMarker } from '@xyflow/react'
import type { CSSProperties } from 'react'

/** Размер стрелки в px — не зависит от толщины линии (userSpaceOnUse) */
export const GRAPH_ARROW_MARKER_PX = 7

export const GRAPH_EDGE_THEME = {
  blocks: {
    color: '#d97706',
    strokeWidth: 1.5,
    dashed: false,
    arrowEnd: true,
    label: 'Блокирует',
  },
  relates: {
    color: '#a1a1aa',
    strokeWidth: 1.5,
    dashed: true,
    dasharray: '6 3',
    arrowEnd: true,
    label: 'Связана с',
  },
  tree: {
    color: '#d4d4d8',
    strokeWidth: 1.5,
    dashed: false,
    arrowEnd: true,
    label: 'Иерархия',
  },
  canvas: {
    color: '#0d9488',
    strokeWidth: 1.5,
    dashed: false,
    arrowEnd: false,
    label: 'Визуальная',
  },
} as const

export type GraphEdgeKind = keyof typeof GRAPH_EDGE_THEME

export function graphEdgeStrokeStyle(kind: GraphEdgeKind): CSSProperties {
  const t = GRAPH_EDGE_THEME[kind]
  return {
    stroke: t.color,
    strokeWidth: t.strokeWidth,
    ...(t.dasharray ? { strokeDasharray: t.dasharray } : {}),
  }
}

function smallArrow(color: string): EdgeMarker {
  return {
    type: MarkerType.ArrowClosed,
    color,
    width: GRAPH_ARROW_MARKER_PX,
    height: GRAPH_ARROW_MARKER_PX,
    markerUnits: 'userSpaceOnUse',
  }
}

/** Стрелка только на target. Визуальные связи — без стрелки. */
export function graphEdgeMarkers(kind: GraphEdgeKind): {
  markerStart?: EdgeMarker
  markerEnd?: EdgeMarker
} {
  if (!GRAPH_EDGE_THEME[kind].arrowEnd) {
    return { markerStart: undefined, markerEnd: undefined }
  }
  return {
    markerStart: undefined,
    markerEnd: smallArrow(GRAPH_EDGE_THEME[kind].color),
  }
}

export const GRAPH_EDGE_LEGEND = (['tree', 'blocks', 'relates', 'canvas'] as GraphEdgeKind[]).map((kind) => ({
  kind,
  ...GRAPH_EDGE_THEME[kind],
}))
