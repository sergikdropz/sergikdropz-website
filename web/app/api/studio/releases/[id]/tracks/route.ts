import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

/**
 * GET /api/studio/releases/[id]/tracks?available=true
 * Tracks not linked to any release (for picker).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const available = searchParams.get('available') === 'true'

    const supabase = createSupabaseServerClient()

    if (!available) {
      const { data, error } = await supabase
        .from('distribution_tracks')
        .select('*')
        .eq('release_id', params.id)
        .order('created_at', { ascending: true })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ tracks: data || [] })
    }

    const { data, error } = await supabase
      .from('distribution_tracks')
      .select('id, title, isrc_full, wav_url, version, release_id, created_at')
      .is('release_id', null)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ tracks: data || [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tracks'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/studio/releases/[id]/tracks
 * Attach unassigned tracks to this release. Body: { trackIds: string[] }
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

    const body = await request.json()
    const trackIds = Array.isArray(body.trackIds) ? body.trackIds.map(String) : []
    if (trackIds.length === 0) {
      return NextResponse.json({ error: 'trackIds array is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    const { data: release, error: releaseError } = await supabase
      .from('distribution_releases')
      .select('id, title')
      .eq('id', params.id)
      .single()

    if (releaseError || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const { data: tracks, error: tracksError } = await supabase
      .from('distribution_tracks')
      .select('id, title, release_id')
      .in('id', trackIds)

    if (tracksError) {
      return NextResponse.json({ error: tracksError.message }, { status: 500 })
    }

    const found = new Map((tracks || []).map((t) => [t.id, t]))
    const results: Array<{ track_id: string; status: 'ok' | 'error'; message?: string }> = []

    for (const trackId of trackIds) {
      const track = found.get(trackId)
      if (!track) {
        results.push({ track_id: trackId, status: 'error', message: 'Track not found' })
        continue
      }
      if (track.release_id && track.release_id !== params.id) {
        results.push({
          track_id: trackId,
          status: 'error',
          message: `Already on another release`,
        })
        continue
      }
      if (track.release_id === params.id) {
        results.push({ track_id: trackId, status: 'ok' })
        continue
      }

      const { error: updateError } = await supabase
        .from('distribution_tracks')
        .update({ release_id: params.id })
        .eq('id', trackId)

      if (updateError) {
        results.push({ track_id: trackId, status: 'error', message: updateError.message })
      } else {
        results.push({ track_id: trackId, status: 'ok' })
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length
    await logActivity({
      actionType: 'attach_tracks_to_release',
      resourceType: 'release',
      resourceId: params.id,
      details: { trackIds, successful: ok },
    })

    return NextResponse.json({
      total: results.length,
      successful: ok,
      failed: results.length - ok,
      results,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to attach tracks'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/studio/releases/[id]/tracks?trackId=...
 * Remove track from release (does not delete the track).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const trackId = searchParams.get('trackId')
    if (!trackId) {
      return NextResponse.json({ error: 'trackId is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    const { data: track, error: fetchError } = await supabase
      .from('distribution_tracks')
      .select('id, release_id')
      .eq('id', trackId)
      .single()

    if (fetchError || !track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    if (track.release_id !== params.id) {
      return NextResponse.json({ error: 'Track is not on this release' }, { status: 400 })
    }

    const { error } = await supabase
      .from('distribution_tracks')
      .update({ release_id: null })
      .eq('id', trackId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await logActivity({
      actionType: 'detach_track_from_release',
      resourceType: 'release',
      resourceId: params.id,
      details: { trackId },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove track'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
