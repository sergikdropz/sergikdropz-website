import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../../../nurturing/supabase-service'
import fs from 'fs'
import path from 'path'

const SCHEDULE_PATH = path.join(process.cwd(), 'data', 'release-schedule.json')

function readSchedule(): { schedule: any[] } {
  const raw = fs.readFileSync(SCHEDULE_PATH, 'utf-8')
  return JSON.parse(raw)
}

/**
 * POST /api/studio/release-pipeline/smart-link
 * Auto-generates a release smart link for a scheduled release
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { release_id } = body

    if (!release_id) {
      return NextResponse.json({ error: 'release_id is required' }, { status: 400 })
    }

    // Look up release in schedule
    const { schedule } = readSchedule()
    const release = schedule.find((r) => r.id === release_id)

    if (!release) {
      return NextResponse.json({ error: 'Release not found in schedule' }, { status: 404 })
    }

    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    // Check if smart link already exists for this release
    const { data: existing } = await supabase
      .from('smartlinks')
      .select('id')
      .eq('release_id', release_id)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'A smart link already exists for this release' },
        { status: 409 }
      )
    }

    const slug = `presave-${release_id}`
    const destinationUrl =
      release.smart_link || `https://sergikdropz.com/music/${release_id}`

    const { data, error } = await supabase
      .from('smartlinks')
      .insert([
        {
          slug,
          title: `Pre-save: ${release.title}`,
          destination_url: destinationUrl,
          category: 'release',
          release_id,
          description: '',
          metadata: {},
          created_by: session.user?.id,
        },
      ])
      .select()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
      }
      console.error('Error creating smart link:', error)
      return NextResponse.json({ error: 'Failed to create smart link' }, { status: 500 })
    }

    return NextResponse.json(data[0], { status: 201 })
  } catch (error: any) {
    console.error('Error creating release smart link:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create release smart link' },
      { status: 500 }
    )
  }
}
