import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { createRevelatorClient } from '@/lib/studio/distributor'
import { logActivity } from '@/lib/activity-log'

/**
 * POST /api/studio/releases/[id]/distribute
 * Submit release to distributor
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

    const supabase = createSupabaseServerClient()

    // Get release with tracks
    const { data: release, error: releaseError } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('id', params.id)
      .single()

    if (releaseError || !release) {
      return NextResponse.json(
        { error: 'Release not found' },
        { status: 404 }
      )
    }

    // Get tracks for this release
    const { data: tracks, error: tracksError } = await supabase
      .from('distribution_tracks')
      .select('*')
      .eq('release_id', params.id)

    if (tracksError) {
      return NextResponse.json(
        { error: 'Failed to fetch tracks' },
        { status: 500 }
      )
    }

    // Validate release
    if (!tracks || tracks.length === 0) {
      return NextResponse.json(
        { error: 'Release must have at least one track' },
        { status: 400 }
      )
    }

    // Validate all tracks have ISRCs
    const tracksWithoutISRC = tracks.filter((t) => !t.isrc_full)
    if (tracksWithoutISRC.length > 0) {
      return NextResponse.json(
        { error: `Tracks missing ISRCs: ${tracksWithoutISRC.map((t) => t.title).join(', ')}` },
        { status: 400 }
      )
    }

    // Create distributor client
    const distributor = createRevelatorClient()
    if (!distributor) {
      return NextResponse.json(
        { error: 'Distributor API not configured' },
        { status: 500 }
      )
    }

    // Prepare release for distribution
    const distributionRelease = {
      releaseId: release.id,
      title: release.title,
      type: release.type as 'single' | 'ep' | 'album',
      releaseDate: release.release_date || new Date().toISOString().split('T')[0],
      tracks: tracks.map((track) => ({
        title: track.title,
        isrc: track.isrc_full!,
        wavUrl: track.wav_url,
        artworkUrl: track.artwork_url || undefined,
        explicit: track.explicit || false,
      })),
    }

    // Submit to distributor
    const result = await distributor.submitRelease(distributionRelease)

    // Update release status
    const { error: updateError } = await supabase
      .from('distribution_releases')
      .update({
        distributor_status: 'submitted',
        distributor_release_id: result.releaseId,
      })
      .eq('id', params.id)

    if (updateError) {
      console.error('Error updating release status:', updateError)
    }

    // Log activity
    await logActivity({
      actionType: 'distribute_release',
      resourceType: 'release',
      resourceId: params.id,
      details: { distributorReleaseId: result.releaseId },
    })

    return NextResponse.json({
      success: true,
      distributorReleaseId: result.releaseId,
    })
  } catch (error: any) {
    console.error('Error distributing release:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to distribute release' },
      { status: 500 }
    )
  }
}
