import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { isDspStoreId, ALL_DSP_STORE_IDS } from '@/lib/studio/constants'
import {
  connectReleaseToDsps,
  dspConnectHint,
  dspConnectProviders,
  buildDspCoverage,
  pickLookupSeeds,
  planFillMissingStoreLinks,
  type DspPersistSummary,
  type ResolvedDspLink,
} from '@/lib/studio/dsp-connect'
import { defaultVerificationForNewLink } from '@/lib/studio/dsp-verify'
import { assertDspProvidersComplete, dspProviderCatalog } from '@/lib/studio/dsp-providers'
import { logActivity } from '@/lib/activity-log'

function collectIsrcs(tracks: Array<{ isrc_full?: string | null }>): string[] {
  return tracks.map((track) => String(track.isrc_full || '').trim()).filter(Boolean)
}

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
        .select('store, url, verification_status')
        .eq('release_id', params.id),
    ])

    let storeLinks: Array<{ store: string; url: string; verification_status?: string | null }> =
      linksResult.data || []
    if (linksResult.error && /verification_status/i.test(String(linksResult.error.message || ''))) {
      const fallback = await supabase
        .from('distribution_store_links')
        .select('store, url')
        .eq('release_id', params.id)
      storeLinks = (fallback.data || []).map((link) => ({
        store: link.store,
        url: link.url,
        verification_status: null,
      }))
    }

    const seeds = pickLookupSeeds({
      upc: release.upc,
      isrcs: collectIsrcs(tracks || []),
      existingUrls: storeLinks.map((link) => link.url),
    })

    const completeness = assertDspProvidersComplete()
    const coverage = buildDspCoverage(
      storeLinks.map((link) => ({
        store: link.store,
        url: link.url,
        source: 'seed',
        verification_status:
          'verification_status' in link
            ? (link as { verification_status?: string | null }).verification_status
            : undefined,
      }))
    )

    return NextResponse.json({
      providers: dspConnectProviders(),
      catalog: dspProviderCatalog(),
      completeness,
      seeds,
      hint: dspConnectHint(seeds),
      linkedStores: (storeLinks || []).map((link) => link.store),
      coverage,
      targetStores: [...ALL_DSP_STORE_IDS],
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load DSP connect status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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
    const seedUrl = typeof body.seedUrl === 'string' ? body.seedUrl.trim() : ''
    const persist = body.persist !== false
    const updateTargets = body.updateTargets !== false
    const fillMissing = body.fillMissing === true

    const supabase = createSupabaseServerClient()
    const { data: release, error } = await supabase
      .from('distribution_releases')
      .select('id, title, upc, target_stores, album_artist')
      .eq('id', params.id)
      .single()

    if (error || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const [{ data: tracks }, existingLinksResult] = await Promise.all([
      supabase.from('distribution_tracks').select('isrc_full').eq('release_id', params.id),
      supabase.from('distribution_store_links').select('id, store, url').eq('release_id', params.id),
    ])
    let storeLinks = existingLinksResult.data || []

    const result = await connectReleaseToDsps({
      title: release.title,
      upc: release.upc,
      isrcs: collectIsrcs(tracks || []),
      seedUrl,
      existingUrls: storeLinks.map((link) => link.url),
    })

    if (!result.links.length && !fillMissing) {
      return NextResponse.json(
        {
          error: result.notes[0] || 'No DSP links found',
          ...result,
          persisted: emptyPersist(),
          targetStores: [...ALL_DSP_STORE_IDS],
        },
        { status: 422 }
      )
    }

    let persisted = persist
      ? await persistResolvedLinks(supabase, params.id, result.links, storeLinks)
      : emptyPersist()

    if (persist && (persisted.added.length || persisted.updated.length)) {
      const refreshed = await supabase
        .from('distribution_store_links')
        .select('id, store, url')
        .eq('release_id', params.id)
      storeLinks = refreshed.data || storeLinks
    }

    let fillLinks: ResolvedDspLink[] = []
    if (fillMissing && persist) {
      const siteBase = (
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXTAUTH_URL ||
        'https://sergikdropz.com'
      ).replace(/\/$/, '')
      fillLinks = planFillMissingStoreLinks({
        existingStores: storeLinks.map((l) => l.store),
        title: release.title,
        artist: release.album_artist || undefined,
        songLinkUrl: result.songLinkUrl || null,
        sergikMusicUrl: `${siteBase}/music/${encodeURIComponent(params.id)}`,
      })
      if (fillLinks.length) {
        const fillPersist = await persistResolvedLinks(supabase, params.id, fillLinks, storeLinks)
        persisted = {
          added: [...persisted.added, ...fillPersist.added],
          updated: [...persisted.updated, ...fillPersist.updated],
          unchanged: [...persisted.unchanged, ...fillPersist.unchanged],
        }
        result.notes.push(
          `Filled ${fillPersist.added.length} missing store(s) from SERGIK catalog / search / B2B hub.`
        )
      }
    }

    if (!result.links.length && !fillLinks.length && fillMissing) {
      return NextResponse.json(
        {
          error: 'Nothing to fill — all targeted stores already have links',
          ...result,
          persisted,
          targetStores: [...ALL_DSP_STORE_IDS],
        },
        { status: 200 }
      )
    }

    let targetStores = Array.isArray(release.target_stores)
      ? (release.target_stores as string[]).filter(isDspStoreId)
      : []

    if (persist && updateTargets) {
      // Always wire the full 33-store studio matrix as delivery targets.
      const resolved = [...ALL_DSP_STORE_IDS]
      if (resolved.join(',') !== targetStores.join(',')) {
        await supabase
          .from('distribution_releases')
          .update({ target_stores: resolved })
          .eq('id', params.id)
      }
      targetStores = resolved
    } else if (!targetStores.length) {
      targetStores = [...ALL_DSP_STORE_IDS]
    }

    if (persist && (persisted.added.length || persisted.updated.length)) {
      await logActivity({
        actionType: 'connect_dsp_links',
        resourceType: 'release',
        resourceId: params.id,
        details: {
          added: persisted.added,
          updated: persisted.updated,
          sources: [...result.links, ...fillLinks].map((link) => link.source),
          coverage: result.coverage,
          fillMissing,
        },
      })
    }

    const coverageLinks = [
      ...result.links,
      ...fillLinks,
      ...storeLinks.map((l) => ({
        store: l.store as ResolvedDspLink['store'],
        url: l.url,
        source: 'seed' as const,
      })),
    ]

    return NextResponse.json({
      ...result,
      links: result.links.length ? result.links : fillLinks,
      fillLinks,
      persisted,
      targetStores,
      coverage: buildDspCoverage(coverageLinks),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to connect DSP links'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function emptyPersist(): DspPersistSummary {
  return { added: [], updated: [], unchanged: [] }
}

async function persistResolvedLinks(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  releaseId: string,
  links: ResolvedDspLink[],
  existing: Array<{ id: string; store: string; url: string }>
): Promise<DspPersistSummary> {
  const summary = emptyPersist()
  const byStore = new Map(existing.map((row) => [row.store, row]))

  for (const link of links) {
    const previous = byStore.get(link.store)
    const initial = defaultVerificationForNewLink({
      store: link.store,
      url: link.url,
      source: link.source,
      platform: link.platform,
    })
    if (!previous) {
      const { error } = await supabase.from('distribution_store_links').insert({
        id: `${releaseId}-${link.store}`,
        release_id: releaseId,
        store: link.store,
        url: link.url,
        verification_status: initial.verification_status,
        verification_detail: initial.verification_detail,
        verified_at: null,
      })
      if (!error) summary.added.push(link.store)
      continue
    }
    if (previous.url === link.url) {
      summary.unchanged.push(link.store)
      continue
    }
    const { error } = await supabase
      .from('distribution_store_links')
      .update({
        url: link.url,
        verification_status: initial.verification_status,
        verification_detail: initial.verification_detail,
        verified_at: null,
      })
      .eq('id', previous.id)
      .eq('release_id', releaseId)
    if (!error) summary.updated.push(link.store)
  }

  return summary
}
