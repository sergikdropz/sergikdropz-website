import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../../nurturing/supabase-service'
import { listMergedPipelineReleases } from '@/lib/studio/schedule-bridge'

/**
 * GET /api/studio/release-pipeline
 * Scheduled (JSON) + distribution releases, enriched with campaign / smart link status.
 */
export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const baseReleases = await listMergedPipelineReleases(supabase)
    const releaseIds = baseReleases.map((r) => r.id)

    const [campaignsResult, smartLinksResult] = await Promise.all([
      releaseIds.length
        ? supabase
            .from('campaigns')
            .select('id, name, status, release_id')
            .in('release_id', releaseIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; status: string; release_id: string }> }),
      releaseIds.length
        ? supabase
            .from('smartlinks')
            .select('id, slug, total_clicks, release_id')
            .in('release_id', releaseIds)
        : Promise.resolve({ data: [] as Array<{ id: string; slug: string; total_clicks: number; release_id: string }> }),
    ])

    const campaignsByRelease: Record<string, { id: string; name: string; status: string }> = {}
    for (const c of campaignsResult.data || []) {
      if (c.release_id) campaignsByRelease[c.release_id] = c
    }

    const smartLinksByRelease: Record<
      string,
      { id: string; slug: string; total_clicks: number }
    > = {}
    for (const s of smartLinksResult.data || []) {
      if (s.release_id) {
        smartLinksByRelease[s.release_id] = {
          id: s.id,
          slug: s.slug,
          total_clicks: s.total_clicks || 0,
        }
      }
    }

    const releases = baseReleases.map((release) => ({
      ...release,
      campaign: campaignsByRelease[release.id]
        ? {
            id: campaignsByRelease[release.id]!.id,
            name: campaignsByRelease[release.id]!.name,
            status: campaignsByRelease[release.id]!.status,
          }
        : null,
      smart_link_data: smartLinksByRelease[release.id] || null,
    }))

    return NextResponse.json({ releases })
  } catch (error: unknown) {
    console.error('Error fetching release pipeline:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch release pipeline'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
