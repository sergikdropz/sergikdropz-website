import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { metaConnectionStatus } from '@/lib/meta/connection'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const status = await metaConnectionStatus()
  return NextResponse.json(status)
}
