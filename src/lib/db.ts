import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const PRISMA_LOG_LEVELS = new Set(['query', 'info', 'warn', 'error'])

function resolvePrismaLog(): Array<'query' | 'info' | 'warn' | 'error'> {
  const raw = process.env.PRISMA_LOG?.trim()
  if (raw) {
    const levels = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is 'query' | 'info' | 'warn' | 'error' => PRISMA_LOG_LEVELS.has(s))
    if (levels.length) return levels
  }
  return process.env.NODE_ENV === 'production'
    ? ['warn', 'error']
    : ['query', 'warn', 'error']
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: resolvePrismaLog(),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
