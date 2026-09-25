import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import {
  readPurchasableTracksFile,
  writePurchasableTracksFile,
} from '@/lib/shop/purchasable-data-file'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await readPurchasableTracksFile()
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Error fetching purchasable tracks:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const track = await request.json()
    const data = await readPurchasableTracksFile()

    const existingIndex = data.tracks.findIndex((t) => t.id === track.id)
    if (existingIndex >= 0) {
      data.tracks[existingIndex] = track
    } else {
      data.tracks.push(track)
    }

    await writePurchasableTracksFile(data)
    return NextResponse.json({ success: true, track })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Error saving track:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}
