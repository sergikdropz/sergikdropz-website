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
 * POST /api/studio/soundexchange/batch-submit
 * Body: { trackIds: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { trackIds } = await request.json()
    if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
      return NextResponse.json({ error: 'trackIds array required' }, { status: 400 })
    }

    const uniqueIds = [...new Set(trackIds.map(String))].slice(0, 100)
    const supabase = createSupabaseServerClient()

    const { data: tracks, error: tracksError } = await supabase
      .from('distribution_tracks')
      .select('*')
      .in('id', uniqueIds)
      .not('isrc_full', 'is', null)

    if (tracksError) {
      return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 })
    }
    if (!tracks?.length) {
      return NextResponse.json({ error: 'No tracks with ISRCs found' }, { status: 400 })
    }

    const releaseIds = tracks
      .map((t) => t.release_id)
      .filter((id): id is string => Boolean(id))

    let releases: Array<{
      id: string
      title?: string | null
      release_date?: string | null
      genre?: string | null
      album_artist?: string | null
    }> = []
    if (releaseIds.length) {
      const { data: releasesData } = await supabase
        .from('distribution_releases')
        .select('id, title, release_date, genre, album_artist')
        .in('id', releaseIds)
      releases = releasesData || []
    }
    const releaseMap = new Map(releases.map((r) => [r.id, r]))

    const soundExchange = createSoundExchangeClient()
    const submissionData = tracks
      .map((track) => {
        const isrc = normalizeIsrcInput(track.isrc_full)
        if (!isrc) return null
        const release = track.release_id ? releaseMap.get(track.release_id) : null
        const contributors = Array.isArray(track.contributors) ? track.contributors : []
        return {
          track,
          payload: {
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
          },
        }
      })
      .filter(Boolean) as Array<{ track: (typeof tracks)[number]; payload: Parameters<typeof soundExchange.submitISRC>[0] }>

    const results = await soundExchange.batchSubmitISRCs(submissionData.map((row) => row.payload))
    const now = new Date().toISOString()
    const submissions = results.map((result, idx) => ({
      id: result.submissionId || `sx-batch-${Date.now()}-${idx}`,
      track_id: submissionData[idx].track.id,
      isrc: submissionData[idx].payload.isrc,
      status: result.success ? 'submitted' : 'error',
      submitted_at: now,
      response: { success: result.success, mode: result.mode },
      error: result.error || null,
    }))

    const { error: insertError } = await supabase.from('soundexchange_submissions').upsert(submissions, {
      onConflict: 'id',
    })

    await logActivity({
      actionType: 'batch_submit_soundexchange',
      resourceType: 'track',
      details: {
        count: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        mode: soundExchange.mode,
        persisted: !insertError,
      },
    })

    return NextResponse.json({
      success: true,
      mode: soundExchange.mode,
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      persisted: !insertError,
      persistError: insertError?.message || null,
      results,
    })
  } catch (error: unknown) {
    console.error('SoundExchange batch submission error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to batch submit to SoundExchange' },
      { status: 500 },
    )
  }
}
