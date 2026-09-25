import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import {
  readPurchasableTracksFile,
  writePurchasableTracksFile,
} from '@/lib/shop/purchasable-data-file'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await readPurchasableTracksFile()
    data.tracks = data.tracks.filter((t) => t.id !== params.id)
    await writePurchasableTracksFile(data)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Error deleting track:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}
