import { db } from '@/lib/db'

/** Healthcheck для мониторинга/uptime-сервисов. Публичный, без авторизации. */
export async function GET() {
  const started = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return Response.json({
      status: 'ok',
      db: 'ok',
      uptimeSec: Math.round(process.uptime()),
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    })
  } catch {
    return Response.json({ status: 'error', db: 'error' }, { status: 503 })
  }
}
