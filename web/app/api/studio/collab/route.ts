import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { getCollabOverview } from '@/lib/studio/release-collab-server'

export const dynamic = 'force-dynamic'

/** GET /api/studio/collab — overview of releases with collab activity */
export async function GET() {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await getCollabOverview()
  if ('code' in result) {
    return NextResponse.json(result, { status: 503 })
  }
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json(result)
}
