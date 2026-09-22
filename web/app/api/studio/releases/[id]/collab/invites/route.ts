import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { createReviewInvite } from '@/lib/studio/release-collab-server'
import { logActivity } from '@/lib/activity-log'

export const dynamic = 'force-dynamic'

function siteOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }
  return request.nextUrl.origin
}

/** POST /api/studio/releases/[id]/collab/invites — magic-link review invite */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`collab-invite:${session.user.id}`, 30, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Invite rate limit exceeded. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await request.json().catch(() => ({}))
  const collaboratorId = String(body.collaboratorId || '')
  if (!collaboratorId) {
    return NextResponse.json({ error: 'collaboratorId is required' }, { status: 400 })
  }

  const result = await createReviewInvite({
    releaseId: params.id,
    collaboratorId,
    note: body.note != null ? String(body.note) : undefined,
    createdBy: session.user.id,
    siteOrigin: siteOrigin(request),
  })

  if ('code' in result) return NextResponse.json(result, { status: 503 })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

  await logActivity({
    actionType: 'release_collab_invite_sent',
    resourceType: 'distribution_release',
    resourceId: params.id,
    details: {
      collaboratorId,
      emailed: result.emailed,
      portalUrl: result.portalUrl,
    },
  }).catch(() => null)

  return NextResponse.json(result)
}
