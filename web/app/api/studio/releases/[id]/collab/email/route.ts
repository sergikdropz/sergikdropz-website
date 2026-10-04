import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { sendCollabHubEmail } from '@/lib/studio/release-collab-server'

export const dynamic = 'force-dynamic'

function siteOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }
  return request.nextUrl.origin
}

/** POST /api/studio/releases/[id]/collab/email — send hub email to collaborators (Gmail, etc.) */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`collab-email:${session.user.id}`, 25, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Email rate limit exceeded. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await request.json().catch(() => ({}))
  const promoLinks = Array.isArray(body.promoLinks)
    ? body.promoLinks
        .filter((row: unknown) => row && typeof row === 'object')
        .map((row: { label?: string; url?: string }) => ({
          label: String(row.label || 'Link'),
          url: String(row.url || ''),
        }))
        .filter((row: { url: string }) => row.url.startsWith('http'))
    : []

  const collaboratorIds = Array.isArray(body.collaboratorIds)
    ? body.collaboratorIds.map(String)
    : undefined

  const result = await sendCollabHubEmail({
    releaseId: params.id,
    body: String(body.body || ''),
    subject: body.subject != null ? String(body.subject) : undefined,
    authorName: String(body.authorName || session.user.email || 'SERGIK'),
    authorEmail: session.user.email || null,
    collaboratorIds,
    promoLinks,
    siteOrigin: siteOrigin(request),
  })

  if ('code' in result) return NextResponse.json(result, { status: 503 })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
