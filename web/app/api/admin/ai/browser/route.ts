import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { mintAdminBrowserBridgeTicket } from '@/lib/ai/admin-browser-bridge'
import {
  ADMIN_BROWSER_BRIDGE_TTL_SEC,
  ADMIN_BROWSER_LOCAL_ORIGIN,
} from '@/lib/ai/admin-browser-bridge-shared'
import { runAdminBrowserHttp } from '@/lib/ai/admin-browser-http'
import { checkRateLimitAsync } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
/** DistroKid fill downloads WAV masters + artwork; allow a longer serverless budget when hosted. */
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`admin-ai-browser:${session.user.id}`, 2400, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Browser rate limit exceeded. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string }
  if (body.action?.trim() === 'bridge') {
    const ticket = mintAdminBrowserBridgeTicket(session.user.id)
    if (!ticket) {
      return NextResponse.json(
        { ok: false, error: 'Admin browser bridge is not configured on this server.' },
        { status: 503 }
      )
    }
    return NextResponse.json({
      ok: true,
      ticket,
      localOrigin: ADMIN_BROWSER_LOCAL_ORIGIN,
      expiresIn: ADMIN_BROWSER_BRIDGE_TTL_SEC,
    })
  }

  const { snapshot, status } = await runAdminBrowserHttp(body)
  return NextResponse.json(snapshot, { status })
}
