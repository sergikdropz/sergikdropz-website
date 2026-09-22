import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  artistFromContributors,
  createSoundExchangeClient,
  normalizeIsrcInput,
} from '@/lib/studio/soundexchange'
import { US_ISRC_REGISTRANT } from '@/lib/studio/isrc-format'
import { logActivity } from '@/lib/activity-log'

/**
 * POST /api/studio/soundexchange/submit
 * Body: { trackId }
 * Records SoundExchange submission (local registry when remote API unset).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { trackId } = await request.json()
    if (!trackId) {
      return NextResponse.json({ error: 'trackId required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const { data: track, error: trackError } = await supabase
      .from('distribution_tracks')
      .select('*')
      .eq('id', trackId)
      .single()

    if (trackError || !track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    const isrc = normalizeIsrcInput(track.isrc_full)
    if (!isrc) {
      return NextResponse.json({ error: 'Track does not have a valid ISRC' }, { status: 400 })
    }

    let release: { title?: string | null; release_date?: string | null; genre?: string | null; album_artist?: string | null } | null =
      null
    if (track.release_id) {
      const { data: releaseData } = await supabase
        .from('distribution_releases')
        .select('title, release_date, genre, album_artist')
        .eq('id', track.release_id)
        .single()
      release = releaseData
    }

    const soundExchange = createSoundExchangeClient()
    const contributors = Array.isArray(track.contributors) ? track.contributors : []
    const submissionData = {
      isrc,
      title: track.title,
      artist:
        release?.album_artist ||
        artistFromContributors(contributors, US_ISRC_REGISTRANT.recordingArtist),
      duration: track.duration || undefined,
      releaseTitle: release?.title || undefined,
      releaseDate: release?.release_date || undefined,
      genre: release?.genre || undefined,
      explicit: Boolean(track.explicit),
      contributors: contributors.map((c: { name?: string; role?: string } | string) =>
        typeof c === 'string'
          ? { name: c, role: 'artist' }
          : { name: c.name || 'Unknown', role: c.role || 'artist' },
      ),
    }

    const result = await soundExchange.submitISRC(submissionData)
    const submissionId = result.submissionId || `sx-submission-${Date.now()}`
    const { error: insertError } = await supabase.from('soundexchange_submissions').upsert(
      {
        id: submissionId,
        track_id: trackId,
        isrc,
        status: result.success ? 'submitted' : 'error',
        submitted_at: new Date().toISOString(),
        response: result,
        error: result.success ? null : result.message || null,
      },
      { onConflict: 'id' },
    )

    if (insertError) {
      console.warn('Could not save SoundExchange submission record:', insertError.message)
    }

    await logActivity({
      actionType: 'submit_soundexchange',
      resourceType: 'track',
      resourceId: trackId,
      details: {
        isrc,
        success: result.success,
        submissionId: result.submissionId,
        mode: result.mode,
        persisted: !insertError,
      },
    })

    return NextResponse.json({
      success: result.success,
      submissionId: result.submissionId,
      message: result.message,
      mode: result.mode,
      persisted: !insertError,
    })
  } catch (error: unknown) {
    console.error('SoundExchange submission error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit to SoundExchange' },
      { status: 500 },
    )
  }
}
