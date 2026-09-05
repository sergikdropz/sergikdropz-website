import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import { validateSelfDistribute } from '@/lib/studio/self-distribute'
import { logActivity } from '@/lib/activity-log'

/**
 * POST /api/studio/releases/[id]/go-live
 * Self-publish on SERGIK (no third-party aggregator required).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const force = Boolean(body?.force)

    const supabase = createSupabaseServerClient()

    const { data: release, error: releaseError } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('id', params.id)
      .single()

    if (releaseError || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const { data: tracks } = await supabase
      .from('distribution_tracks')
      .select('id, isrc_full')
      .eq('release_id', params.id)

    const trackList = tracks || []
    const readiness = await getSingleReleaseCopyrightReadiness(supabase, params.id)

    const validation = validateSelfDistribute({
      releaseId: params.id,
      title: release.title,
      upc: release.upc,
      readiness,
      trackCount: trackList.length,
      tracksWithIsrc: trackList.filter((t) => t.isrc_full).length,
      force,
    })

    if (!validation.ok) {
      return NextResponse.json(
        { error: 'Release not ready', blockers: validation.blockers },
        { status: 400 }
      )
    }

    const upc = release.upc?.trim() || validation.suggestedUpc

    const { data: updated, error: updateError } = await supabase
      .from('distribution_releases')
      .update({
        distributor_status: 'live',
        distribution_mode: 'self',
        distributor_release_id: `self-${params.id}`,
        upc: upc || null,
      })
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await logActivity({
      actionType: 'go_live_release',
      resourceType: 'release',
      resourceId: params.id,
      details: { mode: 'self', upc },
    })

    return NextResponse.json({ release: updated, upc })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to go live'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
