import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { importReleaseFromStoreUrl } from '@/lib/studio/store-url-import-server'
import { upsertScheduleFromDistribution } from '@/lib/studio/schedule-bridge'

/**
 * POST /api/studio/releases/from-store-url
 * Body: { seedUrl: string, dryRun?, fillEmptyOnly?, matchVault? }
 * LANDR-style Spotify/Apple URL → previously_released draft (ISRC/UPC when available).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const seedUrl = typeof body.seedUrl === 'string' ? body.seedUrl.trim() : ''
    if (!seedUrl) {
      return NextResponse.json({ error: 'seedUrl is required' }, { status: 400 })
    }

    const dryRun = Boolean(body.dryRun)
    const supabase = createSupabaseServerClient()
    const result = await importReleaseFromStoreUrl(supabase, {
      seedUrl,
      dryRun,
      fillEmptyOnly: body.fillEmptyOnly !== false,
      matchVault: body.matchVault !== false,
    })

    if (!dryRun && result.release_id && result.status !== 'error') {
      const { data: release } = await supabase
        .from('distribution_releases')
        .select('id, title, type, release_date, artwork_url, genre, description, distributor_status')
        .eq('id', result.release_id)
        .maybeSingle()
      if (release) upsertScheduleFromDistribution(release)

      await logActivity({
        actionType: 'import_store_url_release',
        resourceType: 'release',
        resourceId: result.release_id,
        details: {
          seedUrl,
          status: result.status,
          trackCount: result.tracks.length,
          upc: result.draft.upc,
        },
      })
    }

    return NextResponse.json(result, { status: dryRun ? 200 : result.status === 'error' ? 400 : 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Store URL import failed'
    console.error('POST /api/studio/releases/from-store-url:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
