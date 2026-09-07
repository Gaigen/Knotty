'use client'

import { Label } from '@/components/ui/label'
import {
  GRAPH_ARROW_STYLE_OPTIONS,
  GRAPH_EDGE_PATH_OPTIONS,
  type GraphDisplayPrefs,
} from '@/lib/graph-display-prefs'
import { cn } from '@/lib/utils'

export function GraphAppearancePopover({
  prefs,
  onChange,
}: {
  prefs: GraphDisplayPrefs
  onChange: (next: GraphDisplayPrefs) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-2 block text-xs text-muted-foreground">Форма линий</Label>
        <div className="grid grid-cols-3 gap-1">
          {GRAPH_EDGE_PATH_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={cn(
                'rounded-md border px-2 py-1.5 text-xs transition-colors',
                prefs.edgePath === opt.id
                  ? 'border-teal-600 bg-teal-600/10 font-medium text-teal-900 dark:text-teal-100'
                  : 'text-muted-foreground hover:bg-muted'
              )}
              onClick={() => onChange({ ...prefs, edgePath: opt.id })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label className="mb-2 block text-xs text-muted-foreground">Стрелки</Label>
        <div className="grid grid-cols-2 gap-1">
          {GRAPH_ARROW_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={cn(
                'rounded-md border px-2 py-1.5 text-xs transition-colors',
                prefs.arrowStyle === opt.id
                  ? 'border-teal-600 bg-teal-600/10 font-medium text-teal-900 dark:text-teal-100'
                  : 'text-muted-foreground hover:bg-muted'
              )}
              onClick={() => onChange({ ...prefs, arrowStyle: opt.id })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Настройки вида сохраняются локально для этого проекта. Цвет рамки — в панели выбранной пачки.
      </p>
    </div>
  )
}
