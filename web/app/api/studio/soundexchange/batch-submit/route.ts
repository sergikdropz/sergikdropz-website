import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { registerTracksWithSoundExchange } from '@/lib/studio/soundexchange-registry'
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

    const result = await registerTracksWithSoundExchange(trackIds, { source: 'manual' })
    if (!result.total) {
      return NextResponse.json({ error: 'No tracks with ISRCs found' }, { status: 400 })
    }

    await logActivity({
      actionType: 'batch_submit_soundexchange',
      resourceType: 'track',
      details: {
        count: result.total,
        successful: result.successful,
        failed: result.failed,
        skipped: result.skipped,
        mode: result.mode,
        desk: 'SX Direct',
        persisted: result.persisted,
      },
    })

    return NextResponse.json({
      success: true,
      mode: result.mode,
      deskUrl: result.deskUrl,
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      skipped: result.skipped,
      persisted: result.persisted,
      persistError: result.persistError,
      results: result.results,
    })
  } catch (error: unknown) {
    console.error('SoundExchange batch submission error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to batch submit to SoundExchange' },
      { status: 500 },
    )
  }
}
