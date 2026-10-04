import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { assignISRC, resolveIsrcPrefix } from '@/lib/studio/isrc'
import { logActivity } from '@/lib/activity-log'
import { pushDistributionToVault } from '@/lib/studio/vault-writeback'
import { registerMintedIsrcsWithSxDirect } from '@/lib/studio/soundexchange-registry'

/**
 * POST /api/studio/isrc/assign
 * Assign ISRC to a track
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { trackId } = await request.json()
    const prefix = resolveIsrcPrefix()

    if (!trackId) {
      return NextResponse.json(
        { error: 'trackId required' },
        { status: 400 }
      )
    }

    const assignment = await assignISRC(trackId, prefix)

    try {
      const supabase = createSupabaseServerClient()
      const { data: distTrack } = await supabase
        .from('distribution_tracks')
        .select('id, release_id')
        .eq('id', trackId)
        .maybeSingle()
      if (distTrack?.release_id) {
        await pushDistributionToVault(supabase, {
          releaseId: distTrack.release_id,
          writeDates: false,
          bumpCatalog: false,
          trackIds: [trackId],
        })
      }
    } catch (err) {
      console.warn('[isrc/assign] vault write-back failed', err)
    }

    // Log the ISRC assignment
    const sxDirect = await registerMintedIsrcsWithSxDirect([trackId])

    await logActivity({
      actionType: 'assign_isrc',
      resourceType: 'track',
      resourceId: trackId,
      details: { isrc: assignment.isrc, sxDirect },
    })

    return NextResponse.json({ ...assignment, sxDirect })
  } catch (error: any) {
    console.error('ISRC assignment error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to assign ISRC' },
      { status: 500 }
    )
  }
}
