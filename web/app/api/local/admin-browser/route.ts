import { NextRequest, NextResponse } from 'next/server'
import {
  adminBrowserLocalCorsHeaders,
  verifyAdminBrowserBridgeTicket,
} from '@/lib/ai/admin-browser-bridge'
import { runAdminBrowserHttp } from '@/lib/ai/admin-browser-http'
import { checkRateLimitAsync } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function withCors(request: NextRequest, response: NextResponse) {
  const headers = adminBrowserLocalCorsHeaders(request.headers.get('origin'))
  if (!headers) return response
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
  return response
}

export async function OPTIONS(request: NextRequest) {
  if (process.env.VERCEL) return new NextResponse(null, { status: 404 })
  const headers = adminBrowserLocalCorsHeaders(request.headers.get('origin'))
  if (!headers) return new NextResponse(null, { status: 403 })
  return new NextResponse(null, { status: 204, headers })
}

/**
 * Chrome for the Admin browser lives on this Mac. The live site sends a
 * short-lived admin pass here; Vercel never launches the browser.
 */
export async function POST(request: NextRequest) {
  if (process.env.VERCEL) {
    return withCors(
      request,
      NextResponse.json(
        { ok: false, enabled: false, error: 'The admin browser runs on the Mac that is hosting this dev server.' },
        { status: 404 }
      )
    )
  }

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const verified = verifyAdminBrowserBridgeTicket(token)
  if (!verified.ok) {
    return withCors(
      request,
      NextResponse.json(
        {
          ok: false,
          enabled: true,
          running: false,
          youDrive: true,
          url: '',
          title: '',
          error: 'This Mac rejected the browser pass. Reload the live admin page while the dev server is running.',
          width: 960,
          height: 640,
        },
        { status: 401 }
      )
    )
  }

  const rl = await checkRateLimitAsync(`admin-browser-local:${verified.sub}`, 2400, 60_000)
  if (!rl.ok) {
    return withCors(
      request,
      NextResponse.json(
        { error: 'Browser rate limit exceeded. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    )
  }

  const body = await request.json().catch(() => ({}))
  const { snapshot, status } = await runAdminBrowserHttp(body)
  return withCors(request, NextResponse.json(snapshot, { status }))
}
