import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import {
  evaluateStreamContinuity,
  mergeStreamContinuity,
  marketingCopyWithStreamContinuity,
  parseStreamContinuity,
  STREAM_CONTINUITY_PHASES,
  streamContinuityFromMarketingCopy,
  type StreamContinuityPhase,
  type StreamContinuitySource,
} from '@/lib/studio/stream-continuity'

/**
 * GET /api/studio/releases/[id]/stream-continuity
 * PATCH body: { phases?, source?, seed_url?, old_distributor?, notes?, markPhase? }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()
    const { data: release, error } = await supabase
      .from('distribution_releases')
      .select(
        'id, title, previously_released, previous_isrc, previous_upc, upc, distributor_status, marketing_copy',
      )
      .eq('id', params.id)
      .single()

    if (error || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const { data: tracks } = await supabase
      .from('distribution_tracks')
      .select('title, isrc_full, wav_url')
      .eq('release_id', params.id)

    const { count } = await supabase
      .from('distribution_store_links')
      .select('id', { count: 'exact', head: true })
      .eq('release_id', params.id)

    const continuity = streamContinuityFromMarketingCopy(
      (release.marketing_copy as Record<string, unknown>) || null,
    )

    const evaluation = evaluateStreamContinuity({
      previously_released: release.previously_released,
      previous_isrc: release.previous_isrc,
      previous_upc: release.previous_upc,
      upc: release.upc,
      store_link_count: count || 0,
      tracks: tracks || [],
      distributor_status: release.distributor_status,
      continuity,
    })

    return NextResponse.json({
      continuity,
      evaluation,
      phases: STREAM_CONTINUITY_PHASES,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load continuity'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const supabase = createSupabaseServerClient()
    const { data: release, error } = await supabase
      .from('distribution_releases')
      .select('id, marketing_copy, previously_released')
      .eq('id', params.id)
      .single()

    if (error || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const existingCopy = (release.marketing_copy as Record<string, unknown>) || {}
    const current = streamContinuityFromMarketingCopy(existingCopy)

    const phasePatch: Partial<Record<StreamContinuityPhase, boolean>> = {}
    if (body.phases && typeof body.phases === 'object') {
      for (const phase of STREAM_CONTINUITY_PHASES) {
        if (typeof body.phases[phase] === 'boolean') {
          phasePatch[phase] = body.phases[phase]
        }
      }
    }
    if (typeof body.markPhase === 'string' && STREAM_CONTINUITY_PHASES.includes(body.markPhase)) {
      phasePatch[body.markPhase as StreamContinuityPhase] = true
    }

    const source: StreamContinuitySource | undefined =
      body.source === 'distrokid' || body.source === 'store_url' || body.source === 'manual'
        ? body.source
        : undefined

    const next = mergeStreamContinuity(current, {
      source,
      seed_url: body.seed_url !== undefined ? body.seed_url : undefined,
      old_distributor: body.old_distributor !== undefined ? body.old_distributor : undefined,
      notes: body.notes !== undefined ? body.notes : undefined,
      phases: phasePatch,
    })

    // Ensure previously_released when using continuity checklist.
    const updates: Record<string, unknown> = {
      marketing_copy: marketingCopyWithStreamContinuity(existingCopy, next),
    }
    if (release.previously_released == null) {
      updates.previously_released = true
    }

    const { error: updateError } = await supabase
      .from('distribution_releases')
      .update(updates)
      .eq('id', params.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await logActivity({
      actionType: 'update_stream_continuity',
      resourceType: 'release',
      resourceId: params.id,
      details: { phases: next.phases, source: next.source },
    })

    const evaluation = evaluateStreamContinuity({
      previously_released: true,
      continuity: next,
      tracks: [],
    })

    return NextResponse.json({
      continuity: parseStreamContinuity(next),
      evaluation,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update continuity'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
