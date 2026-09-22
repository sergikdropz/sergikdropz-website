import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { importDistroKidCatalogToStudio } from '@/lib/studio/distrokid-import-server'
import { upsertScheduleFromDistribution } from '@/lib/studio/schedule-bridge'

/**
 * POST /api/studio/releases/from-distrokid
 * Body: { catalog: DistroKidCatalogExport, dryRun?, fillEmptyOnly?, matchVault? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    if (body.catalog == null) {
      return NextResponse.json({ error: 'catalog is required' }, { status: 400 })
    }

    const dryRun = Boolean(body.dryRun)
    const supabase = createSupabaseServerClient()
    const result = await importDistroKidCatalogToStudio(supabase, {
      catalog: body.catalog,
      dryRun,
      fillEmptyOnly: body.fillEmptyOnly !== false,
      matchVault: body.matchVault !== false,
    })

    if (!dryRun) {
      for (const row of result.releases) {
        if (!row.release_id || row.status === 'error') continue
        const { data: release } = await supabase
          .from('distribution_releases')
          .select('id, title, type, release_date, artwork_url, genre, description, distributor_status')
          .eq('id', row.release_id)
          .maybeSingle()
        if (release) upsertScheduleFromDistribution(release)
      }

      await logActivity({
        actionType: 'import_distrokid_catalog',
        resourceType: 'release',
        resourceId: result.releases[0]?.release_id || 'distrokid-batch',
        details: {
          created: result.created,
          updated: result.updated,
          releaseCount: result.releases.length,
          albumuuids: result.releases.map((r) => r.albumuuid),
        },
      })
    }

    return NextResponse.json(result, { status: dryRun ? 200 : 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'DistroKid import failed'
    console.error('POST /api/studio/releases/from-distrokid:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
