import { NextRequest, NextResponse } from 'next/server'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { getMusicLibraryPublishVersion } from '@/lib/music-library-publish'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/music-library/catalog-version/stream
 * SSE push of catalog publish version (replaces client 12s polling on vault/admin).
 * Server uses service-role settings read — fans never need RLS on `settings`.
 */
export async function GET(request: NextRequest) {
  const gate = await getMusicVaultApiAccess(request)
  if (!gate.ok) return gate.response

  const encoder = new TextEncoder()
  let closed = false
  let timer: ReturnType<typeof setInterval> | null = null
  let lastVersion = 0

  const stream = new ReadableStream({
    async start(controller) {
      const send = (version: number) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ version })}\n\n`))
        } catch {
          closed = true
        }
      }

      try {
        lastVersion = await getMusicLibraryPublishVersion()
        send(lastVersion)
      } catch {
        send(0)
      }

      timer = setInterval(() => {
        void (async () => {
          if (closed) return
          try {
            const version = await getMusicLibraryPublishVersion()
            if (version && version !== lastVersion) {
              lastVersion = version
              send(version)
            } else {
              // keepalive comment so proxies don't idle-close
              controller.enqueue(encoder.encode(`: ping\n\n`))
            }
          } catch {
            /* ignore tick errors */
          }
        })()
      }, 5000)

      const abort = () => {
        closed = true
        if (timer) clearInterval(timer)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
      request.signal.addEventListener('abort', abort)
    },
    cancel() {
      closed = true
      if (timer) clearInterval(timer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
