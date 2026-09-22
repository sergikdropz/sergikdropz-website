import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { postStudioMessage } from '@/lib/studio/release-collab-server'

export const dynamic = 'force-dynamic'

function siteOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }
  return request.nextUrl.origin
}

/** POST /api/studio/releases/[id]/collab/messages */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`collab-msg:${session.user.id}`, 40, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Message rate limit exceeded. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await request.json().catch(() => ({}))
  const result = await postStudioMessage({
    releaseId: params.id,
    body: String(body.body || ''),
    authorName: String(body.authorName || session.user.email || 'SERGIK'),
    authorEmail: session.user.email || null,
    notify: Boolean(body.notify),
    siteOrigin: siteOrigin(request),
  })

  if ('code' in result) return NextResponse.json(result, { status: 503 })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
