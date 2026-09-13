import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { assignISRC } from '@/lib/studio/isrc'
import { logActivity } from '@/lib/activity-log'

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
    const prefix = process.env.ISRC_PREFIX

    if (!prefix) {
      return NextResponse.json(
        { error: 'ISRC_PREFIX not configured. Please set ISRC_PREFIX environment variable.' },
        { status: 500 }
      )
    }

    if (!trackId) {
      return NextResponse.json(
        { error: 'trackId required' },
        { status: 400 }
      )
    }

    const assignment = await assignISRC(trackId, prefix)

    // Log the ISRC assignment
    await logActivity({
      actionType: 'assign_isrc',
      resourceType: 'track',
      resourceId: trackId,
      details: { isrc: assignment.isrc },
    })

    return NextResponse.json(assignment)
  } catch (error: any) {
    console.error('ISRC assignment error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to assign ISRC' },
      { status: 500 }
    )
  }
}
