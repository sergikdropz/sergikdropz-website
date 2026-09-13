import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { adminShareBundle } from '@/lib/shares/share-service'
import { resolvePublicOrigin, type ShareKind, type ShareVisibility } from '@/lib/shares/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/shares
 * Admin: create or reuse an active share link for a track or folder.
 * Body: { kind: 'track'|'folder', targetId: string, visibility?: 'public'|'unlisted' }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const kind = body.kind as ShareKind
    const targetId = String(body.targetId || body.target_id || '').trim()
    const visibility = body.visibility as ShareVisibility | undefined

    if (kind !== 'track' && kind !== 'folder') {
      return NextResponse.json({ error: 'kind must be track or folder' }, { status: 400 })
    }
    if (!targetId) {
      return NextResponse.json({ error: 'targetId is required' }, { status: 400 })
    }
    if (visibility && visibility !== 'public' && visibility !== 'unlisted') {
      return NextResponse.json({ error: 'visibility must be public or unlisted' }, { status: 400 })
    }

    const origin = resolvePublicOrigin(request.headers)
    const payload = await adminShareBundle(kind, targetId, {
      visibility,
      createdBy: session.user?.email || session.user?.id || null,
      origin,
    })

    return NextResponse.json(payload)
  } catch (error: any) {
    const code = error?.code
    if (code === 'SHARE_TABLE_MISSING') {
      return NextResponse.json(
        { error: error.message, code },
        { status: 503 },
      )
    }
    if (code === 'SHARE_EMPTY') {
      return NextResponse.json({ error: error.message, code }, { status: 400 })
    }
    console.error('POST /api/shares:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create share link' },
      { status: 500 },
    )
  }
}
