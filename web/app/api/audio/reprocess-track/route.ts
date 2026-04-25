import { NextRequest, NextResponse } from 'next/server'
import { reprocessExistingTrack, batchProcessTracks } from '@/utils/trackUploadPipeline'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/audio/reprocess-track
 * 
 * Re-run the full analysis pipeline on existing tracks.
 * Use this to regenerate Sonic DNA, update key signatures, etc.
 * 
 * Request body:
 * - trackId: Single track ID to reprocess
 * - trackIds: Array of track IDs for batch processing
 * 
 * Response: Updated track data with all analysis results
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { trackId, trackIds } = body

    if (!trackId && (!trackIds || trackIds.length === 0)) {
      return NextResponse.json(
        { error: 'trackId or trackIds required' },
        { status: 400 }
      )
    }

    // Single track processing
    if (trackId && !trackIds) {
      console.log(`[Reprocess] Starting for track: ${trackId}`)
      
      const result = await reprocessExistingTrack(trackId)

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Reprocessing failed' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        trackId: result.trackId,
        data: result.data
      })
    }

    // Batch processing
    if (trackIds && trackIds.length > 0) {
      console.log(`[Reprocess] Starting batch for ${trackIds.length} tracks`)
      
      const results = await batchProcessTracks(trackIds)
      
      const summary = {
        total: trackIds.length,
        success: 0,
        failed: 0,
        results: {} as Record<string, any>
      }

      results.forEach((result, id) => {
        if (result.success) {
          summary.success++
          summary.results[id] = { success: true, data: result.data }
        } else {
          summary.failed++
          summary.results[id] = { success: false, error: result.error }
        }
      })

      return NextResponse.json({
        success: summary.failed === 0,
        summary
      })
    }

  } catch (error: any) {
    console.error('[Reprocess] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Reprocessing failed' },
      { status: 500 }
    )
  }
}
