import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { isDspStoreId } from '@/lib/studio/constants'
import {
  orderVerifyResults,
  summarizeDspVerifyResults,
  verifyStoreLink,
  type DspVerifyResult,
} from '@/lib/studio/dsp-verify'
import { logActivity } from '@/lib/activity-log'

/**
 * POST /api/studio/releases/[id]/dsp-verify
 * Probe + catalog-rematch store links to prove the release is live.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const onlyStores = Array.isArray(body.stores)
      ? (body.stores as unknown[])
          .map((s) => String(s || '').trim())
          .filter(isDspStoreId)
      : null

    const supabase = createSupabaseServerClient()
    const { data: release, error } = await supabase
      .from('distribution_releases')
      .select('id, title, upc')
      .eq('id', params.id)
      .single()

    if (error || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const [{ data: tracks }, linksResult] = await Promise.all([
      supabase.from('distribution_tracks').select('isrc_full').eq('release_id', params.id),
      supabase
        .from('distribution_store_links')
        .select('id, store, url')
        .eq('release_id', params.id),
    ])

    const links = (linksResult.data || []).filter((row) => {
      if (!onlyStores) return true
      return onlyStores.includes(row.store as never)
    })

    if (!links.length) {
      return NextResponse.json({
        error: 'No store links to verify',
        live: 0,
        reachable: 0,
        artist_only: 0,
        b2b: 0,
        failed: 0,
        unverified: 0,
        total: 0,
        results: [],
      }, { status: 422 })
    }

    const isrcs = (tracks || []).map((t) => t.isrc_full)
    const results: DspVerifyResult[] = []
    let persistError: string | null = null

    for (const row of links) {
      const result = await verifyStoreLink({
        store: row.store,
        url: row.url,
        title: release.title,
        isrcs,
        upc: release.upc,
      })
      results.push(result)

      const { error: updateError } = await supabase
        .from('distribution_store_links')
        .update({
          verification_status: result.status,
          verification_detail: result.detail,
          verified_at: result.verified_at,
        })
        .eq('id', row.id)
        .eq('release_id', params.id)

      if (updateError && !persistError) {
        persistError = updateError.message
      }
    }

    const summary = summarizeDspVerifyResults(orderVerifyResults(results))

    await logActivity({
      actionType: 'verify_dsp_links',
      resourceType: 'release',
      resourceId: params.id,
      details: {
        live: summary.live,
        reachable: summary.reachable,
        artist_only: summary.artist_only,
        failed: summary.failed,
        b2b: summary.b2b,
        persistError,
      },
    })

    return NextResponse.json({
      ...summary,
      ...(persistError ? { persistWarning: persistError } : {}),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to verify DSP links'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
