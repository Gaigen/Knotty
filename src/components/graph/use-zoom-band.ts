'use client'

import { useStore } from '@xyflow/react'
import { zoomBand, type ZoomBand } from '@/lib/semantic-zoom'

let lastBand: ZoomBand = 'mid'

/** Пояс зума: ререндер ноды только при смене far/mid/near */
export function useZoomBand(): ZoomBand {
  return useStore((s) => {
    const next = zoomBand(s.transform[2], lastBand)
    lastBand = next
    return next
  })
}
