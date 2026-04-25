import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../../../nurturing/supabase-service'
import { RELEASE_CAMPAIGN_TEMPLATE } from '@/lib/campaign-builder'
import fs from 'fs'
import path from 'path'

const SCHEDULE_PATH = path.join(process.cwd(), 'data', 'release-schedule.json')

function readSchedule(): { schedule: any[] } {
  const raw = fs.readFileSync(SCHEDULE_PATH, 'utf-8')
  return JSON.parse(raw)
}

/**
 * POST /api/studio/release-pipeline/campaign
 * Auto-generates a release campaign for a scheduled release
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

    // Check if campaign already exists for this release
    const { data: existing } = await supabase
      .from('campaigns')
      .select('id')
      .eq('release_id', release_id)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'A campaign already exists for this release' },
        { status: 409 }
      )
    }

    // Create campaign using template structure
    const campaignName = `${release.title} - Release Campaign`

    const { data, error } = await supabase
      .from('campaigns')
      .insert([
        {
          name: campaignName,
          release_id,
          description: RELEASE_CAMPAIGN_TEMPLATE.description,
          scheduled_send_at: release.release_date,
          status: 'draft',
          created_by: session.user?.id,
        },
      ])
      .select()

    if (error) {
      console.error('Error creating campaign:', error)
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
    }

    return NextResponse.json(data[0], { status: 201 })
  } catch (error: any) {
    console.error('Error creating release campaign:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create release campaign' },
      { status: 500 }
    )
  }
}
