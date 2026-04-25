import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getArtist() {
  const filePath = join(process.cwd(), 'web', 'data', 'artist.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function saveArtist(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'artist.json')
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getArtist()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching artist data:', error)
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

    const artistData = await request.json()
    await saveArtist(artistData)

    return NextResponse.json({ success: true, artist: artistData })
  } catch (error: any) {
    console.error('Error saving artist data:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
