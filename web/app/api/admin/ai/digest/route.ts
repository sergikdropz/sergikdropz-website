import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { fetchAdminAiDigestSnapshot } from '@/lib/ai/digest'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const digest = await fetchAdminAiDigestSnapshot()
    return NextResponse.json(digest)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
