import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getPurchasableTracks() {
  const filePath = join(process.cwd(), 'web', 'data', 'purchasable-tracks.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function savePurchasableTracks(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'purchasable-tracks.json')
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getPurchasableTracks()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching purchasable tracks:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const track = await request.json()
    const data = await getPurchasableTracks()

    const existingIndex = data.tracks.findIndex((t: any) => t.id === track.id)
    if (existingIndex >= 0) {
      data.tracks[existingIndex] = track
    } else {
      data.tracks.push(track)
    }

    await savePurchasableTracks(data)
    return NextResponse.json({ success: true, track })
  } catch (error: any) {
    console.error('Error saving track:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
