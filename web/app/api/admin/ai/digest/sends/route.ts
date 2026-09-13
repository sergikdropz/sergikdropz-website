import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { listRecentAdminAiDigestSends } from '@/lib/ai/digest-send-log'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limitRaw = request.nextUrl.searchParams.get('limit')
    const limit = Math.min(50, Math.max(1, parseInt(limitRaw || '20', 10) || 20))
    const sends = await listRecentAdminAiDigestSends(limit)

    return NextResponse.json({ sends })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
