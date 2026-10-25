import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { findReleaseIdForFolder, mintPromoShareLink } from '@/lib/studio/promo-share-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/studio/social-promo/share
 * Body: { releaseId } or { folderId }. Reuses the studio Share button link.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const releaseId = typeof body.releaseId === 'string' ? body.releaseId.trim() : ''
    const folderId = typeof body.folderId === 'string' ? body.folderId.trim() : ''
    if (!releaseId && !folderId) {
      return NextResponse.json({ error: 'Release or folder is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const resolved = releaseId || (await findReleaseIdForFolder(supabase, folderId))
    if (!resolved) {
      return NextResponse.json(
        { error: 'No studio release is linked to this folder yet' },
        { status: 404 },
      )
    }

    const minted = await mintPromoShareLink(supabase, resolved)
    if (!minted.ok) {
      return NextResponse.json({ error: minted.error }, { status: minted.status })
    }
    return NextResponse.json({
      token: minted.token,
      path: minted.path,
      plan: minted.plan,
      summary: minted.summary,
      releaseId: resolved,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not create the collaborator link'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
