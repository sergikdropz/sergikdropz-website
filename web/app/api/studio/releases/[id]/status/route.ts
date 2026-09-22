import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { createRevelatorClient, getAggregatorHealth } from '@/lib/studio/distributor'
import { isDspStoreId } from '@/lib/studio/constants'
import { buildAggregatorStoreMatrix } from '@/lib/studio/revelator-store-map'
import { defaultVerificationForNewLink } from '@/lib/studio/dsp-verify'

/**
 * GET /api/studio/releases/[id]/status
 * Poll aggregator distribution status; upsert reported store URLs.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()
    const health = getAggregatorHealth()

    const { data: release, error: releaseError } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('id', params.id)
      .single()

    if (releaseError || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    if (!release.distributor_release_id) {
      return NextResponse.json({
        status: release.distributor_status || 'draft',
        stores: [],
        health,
        message: 'No distributor release id yet — run Distribute to stores first.',
      })
    }

    // Self-publish path has no Revelator polling.
    const distId = String(release.distributor_release_id || '')
    const isSelf =
      release.distribution_mode === 'self' ||
      (distId.startsWith('self-') && !distId.startsWith('dryrun-') && release.distribution_mode !== 'aggregator')
    if (isSelf && !distId.startsWith('dryrun-')) {
      return NextResponse.json({
        status: release.distributor_status || 'live',
        stores: [],
        health,
        mode: 'self',
        message: 'Self-published on SERGIK — use Connect / Verify for store pages.',
      })
    }

    const distributor = createRevelatorClient()
    if (!distributor) {
      return NextResponse.json(
        { error: 'Distributor API not configured', health },
        { status: 500 }
      )
    }

    const targetStores = Array.isArray(release.target_stores)
      ? (release.target_stores as string[])
      : []

    const status = await distributor.getStatus(release.distributor_release_id, {
      targetStores,
    })

    if (status.status !== release.distributor_status) {
      // DB check constraint: draft | submitted | delivered | live | error
      const persisted =
        status.status === 'live'
          ? 'live'
          : status.status === 'delivered'
            ? 'delivered'
            : status.status === 'error'
              ? 'error'
              : 'submitted'
      if (persisted !== release.distributor_status) {
        await supabase
          .from('distribution_releases')
          .update({ distributor_status: persisted })
          .eq('id', params.id)
      }
    }

    const existing = await supabase
      .from('distribution_store_links')
      .select('id, store, url')
      .eq('release_id', params.id)
    const byStore = new Map((existing.data || []).map((row) => [row.store, row]))

    const upserted: string[] = []
    if ((status.status === 'live' || status.status === 'delivered') && status.stores.length > 0) {
      for (const store of status.stores) {
        const storeId = String(store.name || '').trim()
        if (!isDspStoreId(storeId) || !store.url) continue
        const initial = defaultVerificationForNewLink({
          store: storeId,
          url: store.url,
          source: 'seed',
          platform: 'distributor',
        })
        const previous = byStore.get(storeId)
        if (!previous) {
          const { error } = await supabase.from('distribution_store_links').insert({
            id: `${params.id}-${storeId}`,
            release_id: params.id,
            store: storeId,
            url: store.url,
            verification_status: initial.verification_status,
            verification_detail: 'distributor_reported',
            verified_at: null,
          })
          if (!error) upserted.push(storeId)
        } else if (previous.url !== store.url) {
          const { error } = await supabase
            .from('distribution_store_links')
            .update({
              url: store.url,
              verification_status: initial.verification_status,
              verification_detail: 'distributor_reported',
              verified_at: null,
            })
            .eq('id', previous.id)
            .eq('release_id', params.id)
          if (!error) upserted.push(storeId)
        }
      }
    }

    return NextResponse.json({
      ...status,
      health,
      mode: 'aggregator',
      distributorReleaseId: release.distributor_release_id,
      upserted,
      storeMatrix: buildAggregatorStoreMatrix({
        targets: targetStores,
        deliveryStores: (status.stores || []).map((s) => ({
          name: s.name,
          status: s.status,
          url: s.url,
        })),
      }),
      canRedeliver: ['error', 'submitted', 'delivered'].includes(
        String(status.status || release.distributor_status || '')
      ),
    })
  } catch (error: unknown) {
    console.error('Error checking distribution status:', error)
    const message = error instanceof Error ? error.message : 'Failed to check status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
