import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { createSoundExchangeClient } from '@/lib/studio/soundexchange'
import { logActivity } from '@/lib/activity-log'

/**
 * POST /api/studio/soundexchange/submit
 * Submit ISRC data to SoundExchange
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { trackId } = await request.json()

    if (!trackId) {
      return NextResponse.json(
        { error: 'trackId required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    // Get track with ISRC
    const { data: track, error: trackError } = await supabase
      .from('distribution_tracks')
      .select('*')
      .eq('id', trackId)
      .single()

    if (trackError || !track) {
      return NextResponse.json(
        { error: 'Track not found' },
        { status: 404 }
      )
    }

    if (!track.isrc_full) {
      return NextResponse.json(
        { error: 'Track does not have an ISRC assigned' },
        { status: 400 }
      )
    }

    // Get release if track is part of one
    let release = null
    if (track.release_id) {
      const { data: releaseData } = await supabase
        .from('distribution_releases')
        .select('*')
        .eq('id', track.release_id)
        .single()
      release = releaseData
    }

    // Create SoundExchange client
    const soundExchange = createSoundExchangeClient()
    if (!soundExchange) {
      return NextResponse.json(
        { 
          error: 'SoundExchange API not configured. Set SOUNDEXCHANGE_API_KEY or SOUNDEXCHANGE_ACCOUNT_ID environment variables.',
          configured: false,
        },
        { status: 500 }
      )
    }

    // Parse contributors from JSONB
    const contributors = Array.isArray(track.contributors) 
      ? track.contributors 
      : []

    // Prepare submission data
    const submissionData = {
      isrc: track.isrc_full,
      title: track.title,
      artist: 'SERGIK', // Default artist, could be from track metadata
      duration: track.duration || undefined,
      releaseTitle: release?.title || undefined,
      releaseDate: release?.release_date || undefined,
      genre: release?.genre || track.metadata?.genre || undefined,
      explicit: track.explicit || false,
      contributors: contributors.map((c: any) => ({
        name: c.name || c,
        role: c.role || 'artist',
      })),
    }

    // Submit to SoundExchange
    const result = await soundExchange.submitISRC(submissionData)

    // Store submission record (fire and forget)
    const submissionId = `sx-submission-${Date.now()}`
    const insertPromise = supabase
      .from('soundexchange_submissions')
      .insert({
        id: submissionId,
        track_id: trackId,
        isrc: track.isrc_full,
        status: result.success ? 'submitted' : 'error',
        submitted_at: new Date().toISOString(),
        response: result,
        error: result.success ? null : result.message,
      })
    
    // Handle promise (fire and forget)
    Promise.resolve(insertPromise).catch((err) => {
      // Table might not exist yet, that's okay
      console.warn('Could not save SoundExchange submission record:', err)
    })

    // Log activity
    await logActivity({
      actionType: 'submit_soundexchange',
      resourceType: 'track',
      resourceId: trackId,
      details: { 
        isrc: track.isrc_full,
        success: result.success,
        submissionId: result.submissionId,
      },
    })

    return NextResponse.json({
      success: result.success,
      submissionId: result.submissionId,
      message: result.message,
    })
  } catch (error: any) {
    console.error('SoundExchange submission error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to submit to SoundExchange' },
      { status: 500 }
    )
  }
}
