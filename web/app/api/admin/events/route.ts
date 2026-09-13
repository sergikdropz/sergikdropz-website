import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getEvents() {
  const filePath = join(process.cwd(), 'web', 'data', 'events.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function saveEvents(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'events.json')
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getEvents()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching events:', error)
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

    const event = await request.json()
    const data = await getEvents()

    const existingIndex = data.events.findIndex((e: any) => e.id === event.id)
    if (existingIndex >= 0) {
      data.events[existingIndex] = event
    } else {
      data.events.push(event)
    }

    await saveEvents(data)
    return NextResponse.json({ success: true, event })
  } catch (error: any) {
    console.error('Error saving event:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
