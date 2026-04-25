import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

const SCHEDULE_PATH = path.join(process.cwd(), 'data', 'release-schedule.json')

function readSchedule(): { schedule: any[] } {
  const raw = fs.readFileSync(SCHEDULE_PATH, 'utf-8')
  return JSON.parse(raw)
}

function writeSchedule(data: { schedule: any[] }) {
  fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(data, null, 2) + '\n')
}

/**
 * GET /api/studio/release-schedule
 * Return the full schedule
 */
export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = readSchedule()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error reading release schedule:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to read schedule' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/studio/release-schedule
 * Add a new scheduled release
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, type, release_date } = body

    if (!title || !type || !release_date) {
      return NextResponse.json(
        { error: 'title, type, and release_date are required' },
        { status: 400 }
      )
    }

    const data = readSchedule()

    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')

    const newRelease = {
      id,
      title,
      type,
      track_count: body.track_count || null,
      release_date,
      presave_date: body.presave_date || null,
      genre: body.genre || null,
      status: body.status || 'scheduled',
      artwork: body.artwork || null,
      smart_link: body.smart_link || null,
      description: body.description || null,
    }

    data.schedule.push(newRelease)
    writeSchedule(data)

    return NextResponse.json({ release: newRelease }, { status: 201 })
  } catch (error: any) {
    console.error('Error adding to release schedule:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add release' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/studio/release-schedule
 * Update a scheduled release by id (pass id in body)
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const data = readSchedule()
    const index = data.schedule.findIndex((r) => r.id === id)

    if (index === -1) {
      return NextResponse.json(
        { error: 'Scheduled release not found' },
        { status: 404 }
      )
    }

    data.schedule[index] = { ...data.schedule[index], ...updates }
    writeSchedule(data)

    return NextResponse.json({ release: data.schedule[index] })
  } catch (error: any) {
    console.error('Error updating release schedule:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update release' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/studio/release-schedule
 * Delete a scheduled release by id (pass id in body)
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const data = readSchedule()
    const index = data.schedule.findIndex((r) => r.id === id)

    if (index === -1) {
      return NextResponse.json(
        { error: 'Scheduled release not found' },
        { status: 404 }
      )
    }

    data.schedule.splice(index, 1)
    writeSchedule(data)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting from release schedule:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete release' },
      { status: 500 }
    )
  }
}
