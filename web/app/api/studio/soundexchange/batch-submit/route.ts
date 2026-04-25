import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { createSoundExchangeClient } from '@/lib/studio/soundexchange'
import { logActivity } from '@/lib/activity-log'

/**
 * POST /api/studio/soundexchange/batch-submit
 * Batch submit multiple ISRCs to SoundExchange
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { trackIds } = await request.json()

    if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
      return NextResponse.json(
        { error: 'trackIds array required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    // Get all tracks with ISRCs
    const { data: tracks, error: tracksError } = await supabase
      .from('distribution_tracks')
      .select('*')
      .in('id', trackIds)
      .not('isrc_full', 'is', null)

    if (tracksError) {
      return NextResponse.json(
        { error: 'Failed to fetch tracks' },
        { status: 500 }
      )
    }

    if (!tracks || tracks.length === 0) {
      return NextResponse.json(
        { error: 'No tracks with ISRCs found' },
        { status: 400 }
      )
    }

    // Get releases for tracks
    const releaseIds = tracks
      .map((t) => t.release_id)
      .filter((id): id is string => id !== null)

    let releases: any[] = []
    if (releaseIds.length > 0) {
      const { data: releasesData } = await supabase
        .from('distribution_releases')
        .select('*')
        .in('id', releaseIds)
      releases = releasesData || []
    }

    const releaseMap = new Map(releases.map((r) => [r.id, r]))

    // Create SoundExchange client
    const soundExchange = createSoundExchangeClient()
    if (!soundExchange) {
      return NextResponse.json(
        { 
          error: 'SoundExchange API not configured',
          configured: false,
        },
        { status: 500 }
      )
    }

    // Prepare submission data for all tracks
    const submissionData = tracks.map((track) => {
      const release = track.release_id ? releaseMap.get(track.release_id) : null
      const contributors = Array.isArray(track.contributors) 
        ? track.contributors 
        : []

      return {
        isrc: track.isrc_full!,
        title: track.title,
        artist: 'SERGIK',
        duration: track.duration || undefined,
        releaseTitle: release?.title || undefined,
        releaseDate: release?.release_date || undefined,
        genre: release?.genre || undefined,
        explicit: track.explicit || false,
        contributors: contributors.map((c: any) => ({
          name: c.name || c,
          role: c.role || 'artist',
        })),
      }
    })

    // Batch submit
    const results = await soundExchange.batchSubmitISRCs(submissionData)

    // Store submission records
    const submissions = results.map((result, idx) => ({
      id: `sx-batch-${Date.now()}-${idx}`,
      track_id: tracks[idx].id,
      isrc: tracks[idx].isrc_full!,
      status: result.success ? 'submitted' : 'error',
      submitted_at: new Date().toISOString(),
      response: { success: result.success },
      error: result.error || null,
    }))

    // Store submission records (fire and forget)
    const insertPromise = supabase
      .from('soundexchange_submissions')
      .insert(submissions)
    
    // Handle promise (fire and forget)
    Promise.resolve(insertPromise).catch((err) => {
      console.warn('Could not save SoundExchange submission records:', err)
    })

    // Log activity
    await logActivity({
      actionType: 'batch_submit_soundexchange',
      resourceType: 'track',
      details: {
        count: tracks.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    })

    return NextResponse.json({
      success: true,
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    })
  } catch (error: any) {
    console.error('SoundExchange batch submission error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to batch submit to SoundExchange' },
      { status: 500 }
    )
  }
}
