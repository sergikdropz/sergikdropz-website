import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import {
  postCollaboratorMessage,
  resolveCollabPortal,
  submitCollabReview,
} from '@/lib/studio/release-collab-server'

export const dynamic = 'force-dynamic'

/** GET /api/collab/[token] — public magic-link portal payload */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  const rl = await checkRateLimitAsync(
    `collab-portal:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon'}`,
    60,
    60_000,
  )
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const result = await resolveCollabPortal(params.token)
  if ('code' in result) return NextResponse.json(result, { status: 503 })
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 })
  }

  // Do not leak raw invite token internals beyond what's needed
  return NextResponse.json({
    release: result.release,
    collaborator: {
      name: result.collaborator.name,
      email: result.collaborator.email,
      role: result.collaborator.role,
    },
    messages: result.messages,
    review: result.review,
    tracks: result.tracks,
    expiresAt: result.invite.expires_at,
  })
}

/** POST /api/collab/[token] — collaborator message or review action */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  const rl = await checkRateLimitAsync(
    `collab-portal-write:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon'}`,
    30,
    60_000,
  )
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || 'message')

  if (action === 'review') {
    const status = String(body.status || '')
    if (status !== 'approved' && status !== 'changes_requested') {
      return NextResponse.json(
        { error: 'status must be approved or changes_requested' },
        { status: 400 },
      )
    }
    const result = await submitCollabReview({
      token: params.token,
      status,
      note: body.note != null ? String(body.note) : undefined,
    })
    if ('code' in result) return NextResponse.json(result, { status: 503 })
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 })
    }
    return NextResponse.json(result)
  }

  const result = await postCollaboratorMessage({
    token: params.token,
    body: String(body.body || ''),
  })
  if ('code' in result) return NextResponse.json(result, { status: 503 })
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 })
  }
  return NextResponse.json(result)
}
