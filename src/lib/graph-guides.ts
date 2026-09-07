export interface GuideBox {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface AlignmentGuide {
  type: 'vertical' | 'horizontal'
  /** координата линии в flow-space */
  pos: number
  from: number
  to: number
}

export interface AlignmentSnapResult {
  dx: number
  dy: number
  guides: AlignmentGuide[]
}

const DEFAULT_THRESHOLD = 5

function edges(b: GuideBox) {
  return {
    left: b.x,
    right: b.x + b.w,
    top: b.y,
    bottom: b.y + b.h,
    cx: b.x + b.w / 2,
    cy: b.y + b.h / 2,
  }
}

function unionBox(boxes: GuideBox[]): GuideBox {
  if (boxes.length === 0) return { id: '', x: 0, y: 0, w: 0, h: 0 }
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const b of boxes) {
    left = Math.min(left, b.x)
    top = Math.min(top, b.y)
    right = Math.max(right, b.x + b.w)
    bottom = Math.max(bottom, b.y + b.h)
  }
  return { id: '__union__', x: left, y: top, w: right - left, h: bottom - top }
}

/** Выравнивание union bbox перетаскиваемых нод к другим нодам. */
export function computeAlignmentSnap(
  moving: GuideBox[],
  others: GuideBox[],
  threshold = DEFAULT_THRESHOLD
): AlignmentSnapResult {
  if (moving.length === 0 || others.length === 0) {
    return { dx: 0, dy: 0, guides: [] }
  }

  const m = edges(unionBox(moving))
  let bestDx = 0
  let bestDy = 0
  let bestDistX = threshold + 1
  let bestDistY = threshold + 1
  const guides: AlignmentGuide[] = []

  for (const o of others) {
    const t = edges(o)

    const xPairs: { dist: number; delta: number; pos: number }[] = [
      { dist: Math.abs(m.left - t.left), delta: t.left - m.left, pos: t.left },
      { dist: Math.abs(m.right - t.right), delta: t.right - m.right, pos: t.right },
      { dist: Math.abs(m.cx - t.cx), delta: t.cx - m.cx, pos: t.cx },
      { dist: Math.abs(m.left - t.right), delta: t.right - m.left, pos: t.right },
      { dist: Math.abs(m.right - t.left), delta: t.left - m.right, pos: t.left },
    ]
    for (const p of xPairs) {
      if (p.dist <= threshold && p.dist < bestDistX) {
        bestDistX = p.dist
        bestDx = p.delta
      }
    }

    const yPairs: { dist: number; delta: number; pos: number }[] = [
      { dist: Math.abs(m.top - t.top), delta: t.top - m.top, pos: t.top },
      { dist: Math.abs(m.bottom - t.bottom), delta: t.bottom - m.bottom, pos: t.bottom },
      { dist: Math.abs(m.cy - t.cy), delta: t.cy - m.cy, pos: t.cy },
      { dist: Math.abs(m.top - t.bottom), delta: t.bottom - m.top, pos: t.bottom },
      { dist: Math.abs(m.bottom - t.top), delta: t.top - m.bottom, pos: t.top },
    ]
    for (const p of yPairs) {
      if (p.dist <= threshold && p.dist < bestDistY) {
        bestDistY = p.dist
        bestDy = p.delta
      }
    }
  }

  const moved = unionBox(moving)
  const afterX = { ...moved, x: moved.x + bestDx }
  const afterY = { ...moved, y: moved.y + bestDy }
  const ma = edges(afterX)
  const may = edges(afterY)

  if (bestDistX <= threshold) {
    for (const o of others) {
      const t = edges(o)
      if (
        Math.abs(ma.left - t.left) <= 0.5 ||
        Math.abs(ma.right - t.right) <= 0.5 ||
        Math.abs(ma.cx - t.cx) <= 0.5 ||
        Math.abs(ma.left - t.right) <= 0.5 ||
        Math.abs(ma.right - t.left) <= 0.5
      ) {
        const pos =
          Math.abs(ma.left - t.left) <= 0.5
            ? t.left
            : Math.abs(ma.right - t.right) <= 0.5
              ? t.right
              : Math.abs(ma.cx - t.cx) <= 0.5
                ? t.cx
                : Math.abs(ma.left - t.right) <= 0.5
                  ? t.right
                  : t.left
        guides.push({
          type: 'vertical',
          pos,
          from: Math.min(ma.top, ma.bottom, t.top, t.bottom) - 8,
          to: Math.max(ma.top, ma.bottom, t.top, t.bottom) + 8,
        })
        break
      }
    }
  }

  if (bestDistY <= threshold) {
    for (const o of others) {
      const t = edges(o)
      if (
        Math.abs(may.top - t.top) <= 0.5 ||
        Math.abs(may.bottom - t.bottom) <= 0.5 ||
        Math.abs(may.cy - t.cy) <= 0.5 ||
        Math.abs(may.top - t.bottom) <= 0.5 ||
        Math.abs(may.bottom - t.top) <= 0.5
      ) {
        const pos =
          Math.abs(may.top - t.top) <= 0.5
            ? t.top
            : Math.abs(may.bottom - t.bottom) <= 0.5
              ? t.bottom
              : Math.abs(may.cy - t.cy) <= 0.5
                ? t.cy
                : Math.abs(may.top - t.bottom) <= 0.5
                  ? t.bottom
                  : t.top
        guides.push({
          type: 'horizontal',
          pos,
          from: Math.min(may.left, may.right, t.left, t.right) - 8,
          to: Math.max(may.left, may.right, t.left, t.right) + 8,
        })
        break
      }
    }
  }

  return {
    dx: bestDistX <= threshold ? bestDx : 0,
    dy: bestDistY <= threshold ? bestDy : 0,
    guides,
  }
}
