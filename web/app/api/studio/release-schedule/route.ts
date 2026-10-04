import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import {
  readReleaseSchedule,
  writeReleaseSchedule,
  type ScheduleRelease,
  type ScheduleWriteResult,
} from '@/lib/studio/schedule-bridge'

const READONLY_SCHEDULE_ERROR =
  'This server cannot update the release calendar file. Create or edit the release in Studio so it is stored in the database.'

function readonlyScheduleResponse(written: ScheduleWriteResult) {
  if (written.persisted) return null
  return NextResponse.json({ error: READONLY_SCHEDULE_ERROR }, { status: 503 })
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

    const data = readReleaseSchedule()
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('Error reading release schedule:', error)
    const message = error instanceof Error ? error.message : 'Failed to read schedule'
    return NextResponse.json({ error: message }, { status: 500 })
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

    const data = readReleaseSchedule()

    const id = String(title)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')

    const newRelease: ScheduleRelease = {
      id,
      title,
      type,
      track_count: body.track_count || null,
      release_date,
      presave_date: body.presave_date || null,
      genre: body.genre || null,
      status: body.status || 'pending',
      artwork: body.artwork || null,
      smart_link: body.smart_link || null,
      description: body.description || null,
      source: 'schedule',
    }

    data.schedule.push(newRelease)
    const written = writeReleaseSchedule(data)
    const blocked = readonlyScheduleResponse(written)
    if (blocked) return blocked

    return NextResponse.json({ release: newRelease }, { status: 201 })
  } catch (error: unknown) {
    console.error('Error adding to release schedule:', error)
    const message = error instanceof Error ? error.message : 'Failed to add release'
    return NextResponse.json({ error: message }, { status: 500 })
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

    const data = readReleaseSchedule()
    const index = data.schedule.findIndex((r) => r.id === id)

    if (index === -1) {
      return NextResponse.json(
        { error: 'Scheduled release not found' },
        { status: 404 }
      )
    }

    data.schedule[index] = { ...data.schedule[index]!, ...updates }
    const written = writeReleaseSchedule(data)
    const blocked = readonlyScheduleResponse(written)
    if (blocked) return blocked

    return NextResponse.json({ release: data.schedule[index] })
  } catch (error: unknown) {
    console.error('Error updating release schedule:', error)
    const message = error instanceof Error ? error.message : 'Failed to update release'
    return NextResponse.json({ error: message }, { status: 500 })
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

    const data = readReleaseSchedule()
    const index = data.schedule.findIndex((r) => r.id === id)

    if (index === -1) {
      return NextResponse.json(
        { error: 'Scheduled release not found' },
        { status: 404 }
      )
    }

    data.schedule.splice(index, 1)
    const written = writeReleaseSchedule(data)
    const blocked = readonlyScheduleResponse(written)
    if (blocked) return blocked

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting from release schedule:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete release'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
