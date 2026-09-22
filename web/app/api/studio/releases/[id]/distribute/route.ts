import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  createRevelatorClient,
  getAggregatorHealth,
  validateSwitchDistributionPayload,
} from '@/lib/studio/distributor'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import { validateSelfDistribute } from '@/lib/studio/self-distribute'
import { generateInternalUpc } from '@/lib/studio/upc'
import { logActivity } from '@/lib/activity-log'
import { isDspStoreId, ALL_DSP_STORE_IDS } from '@/lib/studio/constants'
import { ensureDspReadyCover, probeArtworkUrl, type ArtworkProbe } from '@/lib/studio/artwork-dsp'
import { buildAggregatorStoreMatrix } from '@/lib/studio/revelator-store-map'
import {
  finalizePreflight,
  marketingCopyWithRevelatorRights,
  mergeProbeIntoPreflight,
  parseRevelatorDeliveryRights,
  resolveArtworkDspUrl,
  runRevelatorPreflight,
  summarizeMastersReadiness,
  type ArtworkProbeSummary,
  type RevelatorDeliveryRights,
} from '@/lib/studio/revelator-preflight'
import {
  marketingCopyWithStreamContinuity,
  mergeStreamContinuity,
  streamContinuityFromMarketingCopy,
} from '@/lib/studio/stream-continuity'

/**
 * POST /api/studio/releases/[id]/distribute
 * Self = SERGIK live; aggregator = Revelator (dry-run or live)
 */

async function toProbeSummary(
  url: string | null | undefined
): Promise<ArtworkProbeSummary | null> {
  const cleaned = String(url || '').trim()
  if (!cleaned) return null
  try {
    const probe: ArtworkProbe = await probeArtworkUrl(cleaned)
    return {
      url: cleaned,
      width: probe.width,
      height: probe.height,
      bytes: probe.bytes,
      format: probe.format,
      ok: probe.ok,
      issues: probe.issues,
    }
  } catch (err) {
    return {
      url: cleaned,
      width: 0,
      height: 0,
      bytes: 0,
      ok: false,
      issues: [],
      error: err instanceof Error ? err.message : String(err),
    }
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

    const supabase = createSupabaseServerClient()

    const { data: release, error: releaseError } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('id', params.id)
      .single()

    if (releaseError || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const { data: tracks, error: tracksError } = await supabase
      .from('distribution_tracks')
      .select('*')
      .eq('release_id', params.id)

    if (tracksError) {
      return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 })
    }

    if (!tracks || tracks.length === 0) {
      return NextResponse.json({ error: 'Release must have at least one track' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const mode = body?.mode === 'aggregator' ? 'aggregator' : 'self'
    const force = Boolean(body?.force)
    const rightsPatch =
      body?.rights && typeof body.rights === 'object'
        ? (body.rights as Partial<RevelatorDeliveryRights>)
        : null

    const stampContinuity = (extraCopy?: Record<string, unknown>) => {
      const existingCopy = {
        ...((release.marketing_copy as Record<string, unknown>) || {}),
        ...(extraCopy || {}),
      }
      if (!release.previously_released) return existingCopy
      const continuity = streamContinuityFromMarketingCopy(existingCopy)
      return marketingCopyWithStreamContinuity(
        existingCopy,
        mergeStreamContinuity(continuity, {
          source: continuity?.source || 'manual',
          phases: { submitted_new: true, overlap_live: true },
        })
      )
    }

    if (mode === 'self') {
      const tracksWithoutISRC = tracks.filter((t) => !t.isrc_full)
      if (tracksWithoutISRC.length > 0) {
        return NextResponse.json(
          { error: `Tracks missing ISRCs: ${tracksWithoutISRC.map((t) => t.title).join(', ')}` },
          { status: 400 }
        )
      }
      if (release.previously_released) {
        const tracksWithoutWav = tracks.filter((t) => !String(t.wav_url || '').trim())
        if (tracksWithoutWav.length > 0) {
          return NextResponse.json(
            {
              error:
                'Previously released titles need the exact original master WAV on every track before redistribute.',
              blockers: tracksWithoutWav.map((t) => t.title),
            },
            { status: 400 }
          )
        }
      }
      const readiness = await getSingleReleaseCopyrightReadiness(supabase, params.id)
      const validation = validateSelfDistribute({
        releaseId: params.id,
        title: release.title,
        upc: release.upc,
        readiness,
        trackCount: tracks.length,
        tracksWithIsrc: tracks.filter((t) => t.isrc_full).length,
        force,
      })
      if (!validation.ok) {
        return NextResponse.json(
          { error: 'Release not ready for self launch', blockers: validation.blockers },
          { status: 400 }
        )
      }
      const upc = release.upc?.trim() || validation.suggestedUpc || generateInternalUpc()
      const { error: selfError } = await supabase
        .from('distribution_releases')
        .update({
          distributor_status: 'live',
          distribution_mode: 'self',
          distributor_release_id: `self-${params.id}`,
          upc,
          marketing_copy: stampContinuity(),
        })
        .eq('id', params.id)
      if (selfError) {
        return NextResponse.json({ error: selfError.message }, { status: 500 })
      }
      await logActivity({
        actionType: 'go_live_release',
        resourceType: 'release',
        resourceId: params.id,
        details: { mode: 'self', upc, streamContinuity: Boolean(release.previously_released) },
      })
      return NextResponse.json({
        success: true,
        mode: 'self',
        distributorReleaseId: `self-${params.id}`,
        upc,
        dualLiveExpected: Boolean(release.previously_released),
      })
    }

    // --- Aggregator ---
    let marketingCopy = (release.marketing_copy as Record<string, unknown>) || {}
    if (rightsPatch) {
      marketingCopy = marketingCopyWithRevelatorRights(marketingCopy, rightsPatch)
      await supabase
        .from('distribution_releases')
        .update({ marketing_copy: marketingCopy })
        .eq('id', params.id)
    }

    if (body?.rightsOnly === true) {
      return NextResponse.json({
        success: true,
        rightsOnly: true,
        rights: parseRevelatorDeliveryRights(marketingCopy),
        health: getAggregatorHealth(),
      })
    }

    // Auto-ensure DSP-ready cover in release-covers/ (never mutates site artwork_url).
    const siteArt = String(release.artwork_url || '').trim()
    let artworkDspUrl = resolveArtworkDspUrl({
      artwork_dsp_url: release.artwork_dsp_url,
      artwork_url: release.artwork_url,
      marketing_copy: marketingCopy,
    })
    if (siteArt) {
      try {
        const ensured = await ensureDspReadyCover({
          releaseId: params.id,
          sourceUrl: siteArt,
          existingDspUrl: artworkDspUrl,
          force: Boolean(body?.forceArtwork),
          supabase,
        })
        artworkDspUrl = ensured.url
        const nested = (marketingCopy.revelator_delivery as Record<string, unknown>) || {}
        marketingCopy = {
          ...marketingCopy,
          artwork_dsp_url: ensured.url,
          revelator_delivery: {
            ...nested,
            artwork_dsp_url: ensured.url,
            artwork_dsp_width: ensured.width,
            artwork_dsp_height: ensured.height,
            artwork_dsp_bytes: ensured.bytes,
            artwork_dsp_path: ensured.path,
          },
        }
        const artUpdates: Record<string, unknown> = { marketing_copy: marketingCopy }
        artUpdates.artwork_dsp_url = ensured.url
        let { error: artErr } = await supabase
          .from('distribution_releases')
          .update(artUpdates)
          .eq('id', params.id)
        if (artErr && /artwork_dsp_url/i.test(artErr.message)) {
          ;({ error: artErr } = await supabase
            .from('distribution_releases')
            .update({ marketing_copy: marketingCopy })
            .eq('id', params.id))
        }
        if (artErr) console.warn('[distribute] dsp cover persist failed', artErr.message)
      } catch (artError) {
        console.warn('[distribute] dsp cover ensure failed', artError)
        // Preflight will surface artwork-dsp-missing / format blockers.
      }
    }

    const targetStores = Array.isArray(release.target_stores)
      ? (release.target_stores as string[]).filter(isDspStoreId)
      : [...ALL_DSP_STORE_IDS]

    const preflightRelease = {
      id: release.id,
      title: release.title,
      upc: release.upc,
      artwork_url: release.artwork_url,
      artwork_dsp_url: artworkDspUrl,
      genre: release.genre,
      subgenre: release.subgenre,
      album_artist: release.album_artist,
      previously_released: release.previously_released,
      previous_upc: release.previous_upc,
      marketing_copy: marketingCopy,
      target_stores: targetStores,
      tracks: tracks.map((t) => ({
        id: t.id,
        title: t.title,
        isrc: t.isrc_full,
        wav_url: t.wav_url,
        duration_seconds: t.duration ?? t.duration_seconds,
        explicit: t.explicit,
      })),
    }

    let preflight = finalizePreflight(runRevelatorPreflight(preflightRelease), force)

    if (!preflight.ok) {
      return NextResponse.json(
        {
          error: 'Release not ready for aggregator delivery',
          blockers: preflight.blockers,
          warnings: preflight.warnings,
          preflight,
          health: getAggregatorHealth(),
        },
        { status: 400 }
      )
    }

    const health = getAggregatorHealth()
    const distributor = createRevelatorClient()
    if (!distributor) {
      return NextResponse.json(
        {
          error:
            'Aggregator API unavailable. Set REVELATOR_API_KEY + REVELATOR_PARTNER_USER_ID, or unset REVELATOR_REQUIRE_LIVE.',
          health,
          preflight,
        },
        { status: 500 }
      )
    }

    // Optionally refresh store overrides from live lookup
    let storeOverrides: Partial<Record<string, number>> | undefined
    if (!distributor.dryRun) {
      try {
        const looked = await distributor.lookupStores()
        storeOverrides = {}
        for (const row of looked) {
          if (row.studioStore && row.isActive !== false) {
            storeOverrides[row.studioStore] = row.distributorStoreId
          }
        }
        preflight = finalizePreflight(
          runRevelatorPreflight(
            {
              ...preflightRelease,
              target_stores: preflight.effectiveTargets,
              marketing_copy: marketingCopy,
              artwork_dsp_url: artworkDspUrl,
            },
            { storeOverrides: storeOverrides as never }
          ),
          force
        )
      } catch (err) {
        console.warn('[distribute] store lookup failed', err)
      }
    }

    const coverForAggregator = artworkDspUrl || release.artwork_url
    const distributionRelease = {
      releaseId: release.id,
      title: release.title,
      type: release.type as 'single' | 'ep' | 'album',
      releaseDate: release.release_date || new Date().toISOString().split('T')[0],
      upc: release.upc,
      artworkUrl: coverForAggregator,
      albumArtist: release.album_artist || release.label_name || 'SERGIK',
      targetStores: preflight.effectiveTargets,
      tracks: tracks.map((track) => ({
        title: track.title,
        isrc: track.isrc_full!,
        wavUrl: String(track.wav_url || '').trim(),
        artworkUrl: coverForAggregator || track.artwork_url || undefined,
        explicit: track.explicit || false,
      })),
    }

    const switchCheck = validateSwitchDistributionPayload(distributionRelease)
    if (!switchCheck.ok && !force) {
      return NextResponse.json(
        { error: 'Release not ready for aggregator delivery', blockers: switchCheck.blockers },
        { status: 400 }
      )
    }

    const result = await distributor.submitRelease(distributionRelease)

    const nextStatus = 'submitted'
    const { error: updateError } = await supabase
      .from('distribution_releases')
      .update({
        distributor_status: nextStatus,
        distribution_mode: 'aggregator',
        distributor_release_id: result.releaseId,
        marketing_copy: stampContinuity(marketingCopy),
      })
      .eq('id', params.id)

    if (updateError) {
      return NextResponse.json(
        {
          error: `Distributed (${result.releaseId}) but failed to save status: ${updateError.message}`,
          distributorReleaseId: result.releaseId,
          dryRun: result.dryRun,
        },
        { status: 500 }
      )
    }

    await logActivity({
      actionType: 'distribute_release',
      resourceType: 'release',
      resourceId: params.id,
      details: {
        mode: 'aggregator',
        distributorReleaseId: result.releaseId,
        dryRun: result.dryRun,
        queuedStoreIds: result.queuedStoreIds,
        queuedStores: result.queuedStores,
        unsupported: result.unsupported,
        rights: parseRevelatorDeliveryRights(marketingCopy),
        force,
      },
    })

    return NextResponse.json({
      success: true,
      mode: 'aggregator',
      distributorReleaseId: result.releaseId,
      dryRun: result.dryRun,
      status: nextStatus,
      queuedStoreIds: result.queuedStoreIds,
      queuedStores: result.queuedStores,
      unsupported: result.unsupported,
      message: result.message,
      health,
      preflight,
      warnings: preflight.warnings,
    })
  } catch (error: unknown) {
    console.error('Error distributing release:', error)
    const message = error instanceof Error ? error.message : 'Failed to distribute release'
    return NextResponse.json({ error: message }, { status: 500 })
  }
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
    const health = getAggregatorHealth()

    const { data: release } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('id', params.id)
      .single()

    if (!release) {
      return NextResponse.json({ health })
    }

    const { data: tracks } = await supabase
      .from('distribution_tracks')
      .select('id, title, isrc_full, wav_url, duration, explicit')
      .eq('release_id', params.id)

    const targetStores = Array.isArray(release.target_stores)
      ? (release.target_stores as string[]).filter(isDspStoreId)
      : [...ALL_DSP_STORE_IDS]

    const artworkDspUrl = resolveArtworkDspUrl({
      artwork_dsp_url: release.artwork_dsp_url,
      artwork_url: release.artwork_url,
      marketing_copy: release.marketing_copy,
    })

    const trackRows = (tracks || []).map((t) => ({
      id: t.id,
      title: t.title,
      isrc: t.isrc_full,
      wav_url: t.wav_url,
      duration_seconds: t.duration,
      explicit: t.explicit,
    }))

    let preflight = finalizePreflight(
      runRevelatorPreflight({
        id: release.id,
        title: release.title,
        upc: release.upc,
        artwork_url: release.artwork_url,
        artwork_dsp_url: artworkDspUrl,
        genre: release.genre,
        subgenre: release.subgenre,
        album_artist: release.album_artist,
        previously_released: release.previously_released,
        previous_upc: release.previous_upc,
        marketing_copy: release.marketing_copy,
        target_stores: targetStores,
        tracks: trackRows,
      })
    )

    const masters = summarizeMastersReadiness(trackRows)
    const [siteProbe, dspProbe] = await Promise.all([
      toProbeSummary(release.artwork_url),
      toProbeSummary(artworkDspUrl),
    ])
    preflight = mergeProbeIntoPreflight(
      preflight,
      { site: siteProbe, dsp: dspProbe },
      masters
    )
    preflight = finalizePreflight(preflight)

    let lookupStores: unknown[] = []
    const client = createRevelatorClient()
    if (client) {
      try {
        lookupStores = await client.lookupStores()
      } catch {
        lookupStores = []
      }
    }

    const storeMatrix = buildAggregatorStoreMatrix({
      targets: targetStores,
      lookupStores: lookupStores as Array<{
        distributorStoreId?: number
        name?: string
        studioStore?: string | null
        isActive?: boolean
      }>,
      deliveryStores: [],
    })

    const curatedQueueable = storeMatrix.filter((r) => r.targeted && r.queueable).length
    const targetedUnsupported = storeMatrix.filter(
      (r) => r.targeted && r.honesty === 'unsupported'
    ).length

    return NextResponse.json({
      health,
      preflight,
      rights: parseRevelatorDeliveryRights(release.marketing_copy),
      distributorReleaseId: release.distributor_release_id,
      distributorStatus: release.distributor_status,
      distributionMode: release.distribution_mode,
      lookupStores,
      storeMatrix,
      artwork_dsp_url: artworkDspUrl,
      artwork_url: release.artwork_url,
      masters,
      readiness: {
        mastersOk: masters.withMaster === masters.trackCount && masters.trackCount > 0,
        isrcOk: masters.withIsrc === masters.trackCount && masters.trackCount > 0,
        upcOk: Boolean(String(release.upc || '').trim()),
        dspCoverOk: Boolean(dspProbe?.ok && !dspProbe.error),
        siteArtOk: Boolean(siteProbe?.ok && !siteProbe.error),
        curatedQueueable,
        targetedUnsupported,
        dryRunOnly: health.dryRun || health.label !== 'live',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to read aggregator status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
