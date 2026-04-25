import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../../nurturing/supabase-service'
import fs from 'fs'
import path from 'path'

const SCHEDULE_PATH = path.join(process.cwd(), 'data', 'release-schedule.json')

function readSchedule(): { schedule: any[] } {
  const raw = fs.readFileSync(SCHEDULE_PATH, 'utf-8')
  return JSON.parse(raw)
}

/**
 * GET /api/studio/release-pipeline
 * Returns each scheduled release enriched with its marketing status
 * (linked campaign and smart link from Supabase)
 */
export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { schedule } = readSchedule()

    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    // Fetch all campaigns and smart links that have a release_id
    const releaseIds = schedule.map((r) => r.id)

    const [campaignsResult, smartLinksResult] = await Promise.all([
      supabase
        .from('campaigns')
        .select('id, name, status, release_id')
        .in('release_id', releaseIds),
      supabase
        .from('smartlinks')
        .select('id, slug, total_clicks, release_id')
        .in('release_id', releaseIds),
    ])

    const campaignsByRelease: Record<string, any> = {}
    if (campaignsResult.data) {
      for (const c of campaignsResult.data) {
        if (c.release_id) campaignsByRelease[c.release_id] = c
      }
    }

    const smartLinksByRelease: Record<string, any> = {}
    if (smartLinksResult.data) {
      for (const s of smartLinksResult.data) {
        if (s.release_id) smartLinksByRelease[s.release_id] = s
      }
    }

    const releases = schedule.map((release) => ({
      ...release,
      campaign: campaignsByRelease[release.id]
        ? {
            id: campaignsByRelease[release.id].id,
            name: campaignsByRelease[release.id].name,
            status: campaignsByRelease[release.id].status,
          }
        : null,
      smart_link_data: smartLinksByRelease[release.id]
        ? {
            id: smartLinksByRelease[release.id].id,
            slug: smartLinksByRelease[release.id].slug,
            total_clicks: smartLinksByRelease[release.id].total_clicks || 0,
          }
        : null,
    }))

    return NextResponse.json({ releases })
  } catch (error: any) {
    console.error('Error fetching release pipeline:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch release pipeline' },
      { status: 500 }
    )
  }
}
