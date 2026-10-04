import { NextRequest, NextResponse } from 'next/server'
import { publishReleaseToMeta } from '@/lib/meta/publish-release'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function authorized(request: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || process.env.INSTAGRAM_CRON_SECRET || '').trim()
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * Publishes promo slots marked Assets ready whose time has arrived.
 * Call every 15 minutes:
 * POST /api/cron/meta-promo
 * Authorization: Bearer $CRON_SECRET
 */
async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('distribution_releases')
    .select('id')
    .not('social_promo', 'is', null)
    .limit(40)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const published: Array<{ id: string; ok: number; failed: number }> = []
  for (const row of data || []) {
    const result = await publishReleaseToMeta({ releaseId: row.id, mode: 'due' })
    if (!result.ok) {
      published.push({ id: row.id, ok: 0, failed: 1 })
      continue
    }
    const loud = result.results.filter((item) => !item.quiet)
    published.push({
      id: row.id,
      ok: loud.filter((item) => item.ok).length,
      failed: loud.filter((item) => !item.ok).length,
    })
  }

  return NextResponse.json({
    releases: published.length,
    posted: published.reduce((sum, row) => sum + row.ok, 0),
    failed: published.reduce((sum, row) => sum + row.failed, 0),
  })
}

export async function POST(request: NextRequest) {
  return run(request)
}

export async function GET(request: NextRequest) {
  return run(request)
}
