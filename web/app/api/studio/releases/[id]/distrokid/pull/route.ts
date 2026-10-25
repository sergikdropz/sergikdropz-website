import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { DistrokidPullError, pullDistrokidIsrcsForRelease } from '@/lib/studio/pull-distrokid-isrcs-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/studio/releases/[id]/distrokid/pull
 * Read ISRCs from the DistroKid album page and write them onto this release.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await pullDistrokidIsrcsForRelease(params.id, { dryRun: false })
    return NextResponse.json(result)
  } catch (error) {
    const status = error instanceof DistrokidPullError ? error.status : 500
    const message = error instanceof Error ? error.message : 'DistroKid pull failed'
    return NextResponse.json({ error: message }, { status })
  }
}
