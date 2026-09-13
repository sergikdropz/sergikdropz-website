import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getVenues() {
  const filePath = join(process.cwd(), 'web', 'data', 'venues.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function saveVenues(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'venues.json')
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getVenues()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching venues:', error)
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

    const venue = await request.json()
    const data = await getVenues()

    const existingIndex = data.venues.findIndex((v: any) => v.id === venue.id)
    if (existingIndex >= 0) {
      data.venues[existingIndex] = venue
    } else {
      data.venues.push(venue)
    }

    await saveVenues(data)
    return NextResponse.json({ success: true, venue })
  } catch (error: any) {
    console.error('Error saving venue:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
