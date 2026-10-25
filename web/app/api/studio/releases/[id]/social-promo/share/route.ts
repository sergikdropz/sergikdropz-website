import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { mintPromoShareLink } from '@/lib/studio/promo-share-server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/studio/releases/[id]/social-promo/share
 * Reuse or mint the collaborator link for this promo schedule.
 */
export async function POST(_request: NextRequest, context: Ctx) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const minted = await mintPromoShareLink(createSupabaseServerClient(), id)
    if (!minted.ok) {
      return NextResponse.json({ error: minted.error }, { status: minted.status })
    }
    return NextResponse.json({
      token: minted.token,
      path: minted.path,
      plan: minted.plan,
      summary: minted.summary,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not create the collaborator link'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
