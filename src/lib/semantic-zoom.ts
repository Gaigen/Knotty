export type ZoomBand = 'far' | 'mid' | 'near'

const FAR_MID = 0.45
const MID_NEAR = 1.15
const HYSTERESIS = 0.02

export function zoomBand(zoom: number, prev?: ZoomBand): ZoomBand {
  const z = Math.round(zoom * 1000)
  const farMid = Math.round(FAR_MID * 1000)
  const midNear = Math.round(MID_NEAR * 1000)
  const h = Math.round(HYSTERESIS * 1000)

  if (prev === 'far') {
    if (z < farMid + h) return 'far'
  } else if (prev === 'near') {
    if (z > midNear - h) return 'near'
  } else if (prev === 'mid') {
    if (z < farMid - h) return 'far'
    if (z > midNear + h) return 'near'
    return 'mid'
  }
  if (z < farMid) return 'far'
  if (z > midNear) return 'near'
  return 'mid'
}
