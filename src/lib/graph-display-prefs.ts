import { prefGet, prefKey, prefSet } from '@/lib/prefs'

export type GraphEdgePathStyle = 'bezier' | 'smoothstep' | 'straight'
export type GraphArrowStyle = 'closed' | 'open'

export interface GraphDisplayPrefs {
  edgePath: GraphEdgePathStyle
  arrowStyle: GraphArrowStyle
}

export const DEFAULT_GRAPH_DISPLAY_PREFS: GraphDisplayPrefs = {
  edgePath: 'bezier',
  arrowStyle: 'closed',
}

const PATH_STYLES = new Set<GraphEdgePathStyle>(['bezier', 'smoothstep', 'straight'])

export function loadGraphDisplayPrefs(projectId: string): GraphDisplayPrefs {
  try {
    const raw = prefGet(prefKey(`graphDisplay:${projectId}`))
    if (!raw) return DEFAULT_GRAPH_DISPLAY_PREFS
    const p = JSON.parse(raw) as Partial<GraphDisplayPrefs>
    return {
      edgePath: p.edgePath && PATH_STYLES.has(p.edgePath) ? p.edgePath : 'bezier',
      arrowStyle: p.arrowStyle === 'open' ? 'open' : 'closed',
    }
  } catch {
    return DEFAULT_GRAPH_DISPLAY_PREFS
  }
}

export function saveGraphDisplayPrefs(projectId: string, prefs: GraphDisplayPrefs): void {
  prefSet(prefKey(`graphDisplay:${projectId}`), JSON.stringify(prefs))
}

export const GRAPH_EDGE_PATH_OPTIONS: GraphEdgePathStyle[] = ['bezier', 'smoothstep', 'straight']

export const GRAPH_ARROW_STYLE_OPTIONS: GraphArrowStyle[] = ['closed', 'open']
