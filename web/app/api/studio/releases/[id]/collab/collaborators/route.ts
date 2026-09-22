import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import {
  deleteCollaborator,
  upsertCollaborator,
} from '@/lib/studio/release-collab-server'

export const dynamic = 'force-dynamic'

/** POST /api/studio/releases/[id]/collab/collaborators — add or update */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const result = await upsertCollaborator({
    releaseId: params.id,
    id: body.id ? String(body.id) : undefined,
    name: String(body.name || ''),
    email: String(body.email || ''),
    role: body.role != null ? String(body.role) : undefined,
    notes: body.notes != null ? String(body.notes) : null,
  })

  if ('code' in result) return NextResponse.json(result, { status: 503 })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}

/** DELETE /api/studio/releases/[id]/collab/collaborators?id=… */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`collab-del:${session.user.id}`, 60, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const collaboratorId = request.nextUrl.searchParams.get('id')
  if (!collaboratorId) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  }

  const result = await deleteCollaborator(params.id, collaboratorId)
  if ('code' in result) return NextResponse.json(result, { status: 503 })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
