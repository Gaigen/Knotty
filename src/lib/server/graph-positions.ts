import { db } from '@/lib/db'

/** Позиции для новых нод: каскад ниже самого нижнего ряда */
export async function nextGraphPositions(projectId: string, count: number): Promise<{ x: number; y: number }[]> {
  const nodes = await db.graphNode.findMany({
    where: { projectId },
    select: { x: true, y: true },
  })
  const positions: { x: number; y: number }[] = []
  let baseY = 80
  let baseX = 80
  if (nodes.length > 0) {
    baseY = Math.max(...nodes.map((n) => n.y)) + 220
    baseX = 80 + (nodes.length % 5) * 270
  }
  for (let i = 0; i < count; i++) {
    positions.push({ x: baseX + (i % 5) * 270, y: baseY + Math.floor(i / 5) * 220 })
  }
  return positions
}
