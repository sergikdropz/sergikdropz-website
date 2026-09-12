import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { resolveShareByToken, revokeShareLink } from '@/lib/shares/share-service'
import { resolvePublicOrigin } from '@/lib/shares/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

/**
 * GET /api/shares/[token]
 * Public: resolve a share link to collection + tracks (+ playback URLs).
 */
export async function GET(request: NextRequest, context: Ctx) {
  try {
    const { token: raw } = await context.params
    const token = decodeURIComponent(raw || '').trim()
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const bump = request.nextUrl.searchParams.get('play') === '1'
    const payload = await resolveShareByToken(token, {
      includePlaybackUrls: true,
      bumpPlayCount: bump,
      origin: resolvePublicOrigin(request.headers),
    })

    if (!payload) {
      return NextResponse.json({ error: 'Share not found or expired' }, { status: 404 })
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    })
  } catch (error: any) {
    if (error?.code === 'SHARE_TABLE_MISSING') {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 })
    }
    console.error('GET /api/shares/[token]:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to resolve share' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/shares/[token]
 * Admin: revoke a share link.
 */
export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token: raw } = await context.params
    const token = decodeURIComponent(raw || '').trim()
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const ok = await revokeShareLink(token)
    if (!ok) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    if (error?.code === 'SHARE_TABLE_MISSING') {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 })
    }
    console.error('DELETE /api/shares/[token]:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to revoke share' },
      { status: 500 },
    )
  }
}
