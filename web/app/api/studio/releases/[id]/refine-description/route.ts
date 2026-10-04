import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { refineReleaseListeningJourney } from '@/lib/studio/refine-listening-journey-server'

/**
 * POST /api/studio/releases/[id]/refine-description
 * AI-polish Metadata listening journey (DSP description) with SergikAI + polymath stack.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const useAi = body?.useAi !== false
    const supabase = createSupabaseServerClient()
    const result = await refineReleaseListeningJourney(supabase, params.id, {
      draft: typeof body?.draft === 'string' ? body.draft : null,
      useAi,
      mode: body?.mode === 'draft' ? 'draft' : 'refine',
    })

    return NextResponse.json({
      text: result.text,
      source: result.source,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to refine description'
    const status = message === 'Release not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
