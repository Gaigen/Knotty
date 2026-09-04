import { db } from '@/lib/db'
import { getCurrentUser, jsonError } from '@/lib/server/context'
import { subscribeProject } from '@/lib/server/realtime'
import type { ProjectRealtimeMessage } from '@/lib/realtime-types'
import { ApiError } from '@/lib/server/validation'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** SSE-поток: push при любых изменениях в проекте */
export async function GET(req: Request, { params }: Params) {
  try {
    const { id: projectId } = await params
    await getCurrentUser()
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) throw new ApiError('Проект не найден', 404)

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        const send = (data: ProjectRealtimeMessage) => {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        send({ v: 1, at: Date.now(), projectId, hello: true })

        const unsub = subscribeProject(projectId, send)
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(enc.encode(': hb\n\n'))
          } catch {
            clearInterval(heartbeat)
          }
        }, 25_000)

        req.signal.addEventListener('abort', () => {
          clearInterval(heartbeat)
          unsub()
          try {
            controller.close()
          } catch {
            // уже закрыт
          }
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
