'use client'

import { useTranslations } from 'next-intl'
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
  const t = useTranslations('graph')

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-2 block text-xs text-muted-foreground">{t('appearance.edgeShape')}</Label>
        <div className="grid grid-cols-3 gap-1">
          {GRAPH_EDGE_PATH_OPTIONS.map((id) => (
            <button
              key={id}
              type="button"
              className={cn(
                'rounded-md border px-2 py-1.5 text-xs transition-colors',
                prefs.edgePath === id
                  ? 'border-teal-600 bg-teal-600/10 font-medium text-teal-900 dark:text-teal-100'
                  : 'text-muted-foreground hover:bg-muted'
              )}
              onClick={() => onChange({ ...prefs, edgePath: id })}
            >
              {t(`edgePath.${id}`)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label className="mb-2 block text-xs text-muted-foreground">{t('appearance.arrows')}</Label>
        <div className="grid grid-cols-2 gap-1">
          {GRAPH_ARROW_STYLE_OPTIONS.map((id) => (
            <button
              key={id}
              type="button"
              className={cn(
                'rounded-md border px-2 py-1.5 text-xs transition-colors',
                prefs.arrowStyle === id
                  ? 'border-teal-600 bg-teal-600/10 font-medium text-teal-900 dark:text-teal-100'
                  : 'text-muted-foreground hover:bg-muted'
              )}
              onClick={() => onChange({ ...prefs, arrowStyle: id })}
            >
              {t(`arrowStyle.${id}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {t('appearance.hint')}
      </p>
    </div>
  )
}
