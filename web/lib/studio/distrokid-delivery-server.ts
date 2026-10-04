import type { SupabaseClient } from '@supabase/supabase-js'
import { getAggregatorHealth } from '@/lib/studio/distributor'
import { ensureDspReadyCover } from '@/lib/studio/artwork-dsp'
import { contributorsWithAppleCredits } from '@/lib/studio/distrokid-apple-credits'
import { linkDspMastersForRelease } from '@/lib/studio/link-dsp-masters-server'
import {
  buildDistroKidPacket,
  buildDistroKidQueue,
  distrokidReleaseId,
  evaluateDistroKidWindow,
  marketingCopyWithDistroKidDelivery,
  parseDistroKidDelivery,
  resolveDeliveryPipe,
  type DistroKidDeliveryRecord,
  type DistroKidPacketReleaseInput,
  type DistroKidPacketTrackInput,
} from '@/lib/studio/distrokid-delivery'

const RELEASE_SELECT =
  'id, title, type, release_date, artwork_url, artwork_dsp_url, genre, subgenre, language, album_artist, label_name, upc, previously_released, distributor_status, distribution_mode, distributor_release_id, marketing_copy, target_stores'

const TRACK_SELECT =
  'id, release_id, title, isrc_full, wav_url, explicit, instrumental, ai_generated, contributors, writer_legal_names, preview_start_seconds, track_number'

function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function asTrack(row: Record<string, unknown>): DistroKidPacketTrackInput {
  return {
    title: row.title as string | null,
    isrc: (row.isrc_full as string | null) || null,
    wav_url: (row.wav_url as string | null) || null,
    explicit: Boolean(row.explicit),
    instrumental: Boolean(row.instrumental),
    ai_generated: Boolean(row.ai_generated),
    contributors: row.contributors,
    writer_legal_names: (row.writer_legal_names as string | null) || null,
    preview_start_seconds:
      row.preview_start_seconds == null ? null : Number(row.preview_start_seconds),
    track_number: row.track_number == null ? null : Number(row.track_number),
  }
}

export function releaseInputFromRow(
  release: Record<string, unknown>,
  tracks: DistroKidPacketTrackInput[],
): DistroKidPacketReleaseInput {
  const marketing =
    release.marketing_copy && typeof release.marketing_copy === 'object'
      ? (release.marketing_copy as Record<string, unknown>)
      : {}
  const revelator =
    marketing.revelator_delivery && typeof marketing.revelator_delivery === 'object'
      ? (marketing.revelator_delivery as Record<string, unknown>)
      : {}
  const artworkDsp =
    String(release.artwork_dsp_url || marketing.artwork_dsp_url || revelator.artwork_dsp_url || '').trim() ||
    null
  return {
    id: String(release.id),
    title: release.title as string | null,
    type: release.type as string | null,
    release_date: release.release_date as string | null,
    artwork_url: release.artwork_url as string | null,
    artwork_dsp_url: artworkDsp,
    genre: release.genre as string | null,
    subgenre: release.subgenre as string | null,
    language: release.language as string | null,
    album_artist: release.album_artist as string | null,
    label_name: release.label_name as string | null,
    upc: release.upc as string | null,
    previously_released: Boolean(release.previously_released),
    distributor_status: release.distributor_status as string | null,
    target_stores: release.target_stores,
    tracks,
  }
}

/**
 * Prepare site DSP assets for DistroKid fill:
 * - DSP-ready cover (gallery-images/studio/release-covers/…) when missing
 * - Link/ingest dsp-masters WAVs for tracks that are not yet on DSP masters
 */
async function ensureSiteDspAssetsForDistroKid(
  supabase: SupabaseClient,
  releaseId: string,
  release: Record<string, unknown>,
): Promise<{ artworkDspUrl: string | null; masters: Awaited<ReturnType<typeof linkDspMastersForRelease>> | null }> {
  const siteArt = String(release.artwork_url || '').trim()
  let artworkDspUrl = String(release.artwork_dsp_url || '').trim() || null
  let marketingCopy =
    release.marketing_copy && typeof release.marketing_copy === 'object'
      ? ({ ...(release.marketing_copy as Record<string, unknown>) } as Record<string, unknown>)
      : {}

  if (siteArt) {
    try {
      const ensured = await ensureDspReadyCover({
        releaseId,
        sourceUrl: siteArt,
        existingDspUrl: artworkDspUrl,
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
      const artUpdates: Record<string, unknown> = {
        marketing_copy: marketingCopy,
        artwork_dsp_url: ensured.url,
      }
      let { error: artErr } = await supabase.from('distribution_releases').update(artUpdates).eq('id', releaseId)
      if (artErr && /artwork_dsp_url/i.test(artErr.message)) {
        ;({ error: artErr } = await supabase
          .from('distribution_releases')
          .update({ marketing_copy: marketingCopy })
          .eq('id', releaseId))
      }
      if (artErr) console.warn('[distrokid] dsp cover persist failed', artErr.message)
      release.artwork_dsp_url = ensured.url
      release.marketing_copy = marketingCopy
    } catch (err) {
      console.warn('[distrokid] dsp cover ensure failed', err)
    }
  }

  let masters: Awaited<ReturnType<typeof linkDspMastersForRelease>> | null = null
  try {
    masters = await linkDspMastersForRelease(supabase, releaseId, { skipLocal: false })
  } catch (err) {
    console.warn('[distrokid] dsp masters link failed', err)
  }

  return { artworkDspUrl, masters }
}

export async function loadDistroKidRelease(
  supabase: SupabaseClient,
  releaseId: string,
  opts?: { ensureDspAssets?: boolean },
) {
  const { data: release, error } = await supabase
    .from('distribution_releases')
    .select(RELEASE_SELECT)
    .eq('id', releaseId)
    .single()

  if (error || !release) return { error: error?.message || 'Release not found', release: null }

  const row = release as Record<string, unknown>
  let dspEnsure: Awaited<ReturnType<typeof ensureSiteDspAssetsForDistroKid>> | null = null
  if (opts?.ensureDspAssets) {
    dspEnsure = await ensureSiteDspAssetsForDistroKid(supabase, releaseId, row)
  }

  const { data: tracks, error: trackError } = await supabase
    .from('distribution_tracks')
    .select(TRACK_SELECT)
    .eq('release_id', releaseId)

  if (trackError) return { error: trackError.message, release: null }

  if (opts?.ensureDspAssets && tracks?.length) {
    for (const track of tracks) {
      const tr = track as Record<string, unknown>
      const merged = contributorsWithAppleCredits(tr.contributors)
      const before = JSON.stringify(tr.contributors ?? null)
      const after = JSON.stringify(merged)
      if (before !== after && tr.id) {
        await supabase.from('distribution_tracks').update({ contributors: merged }).eq('id', tr.id)
        tr.contributors = merged
      }
    }
  }

  const input = releaseInputFromRow(row, (tracks || []).map((track) => asTrack(track as Record<string, unknown>)))
  // Prefer freshly ensured DSP cover even if column write failed mid-flight.
  if (dspEnsure?.artworkDspUrl) input.artwork_dsp_url = dspEnsure.artworkDspUrl
  const record = parseDistroKidDelivery(row.marketing_copy)
  const today = todayIso()
  const packet = buildDistroKidPacket(input)
  if (opts?.ensureDspAssets) {
    const nonDsp = packet.tracks.filter((t) => t.wav_url && !/dsp-masters\//i.test(t.wav_url))
    for (const track of nonDsp) {
      packet.warnings.push(
        `${track.title}: WAV is not under dsp-masters/ — DistroKid fill prefers site DSP masters.`,
      )
    }
    if (!dspEnsure?.artworkDspUrl && packet.release.artwork_url) {
      packet.warnings.push('DSP-ready cover unavailable — using marketing artwork for DistroKid upload.')
    }
  }
  return {
    error: null,
    release: row,
    input,
    record,
    packet,
    window: evaluateDistroKidWindow({
      release_date: input.release_date,
      distributor_status: input.distributor_status,
      record,
      today,
    }),
    pipe: resolveDeliveryPipe(getAggregatorHealth()),
    today,
    dspEnsure,
  }
}

export async function loadDistroKidQueue(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('distribution_releases')
    .select(RELEASE_SELECT)
    .in('distributor_status', ['draft', 'submitted', 'delivered', 'error'])
    .order('release_date', { ascending: true })
    .limit(80)

  if (error) return { error: error.message, queue: [], pipe: resolveDeliveryPipe(getAggregatorHealth()) }

  const releases = (data || []) as Array<Record<string, unknown>>
  const ids = releases.map((row) => String(row.id))
  const tracksByRelease = new Map<string, DistroKidPacketTrackInput[]>()
  if (ids.length) {
    const { data: tracks, error: trackError } = await supabase
      .from('distribution_tracks')
      .select(TRACK_SELECT)
      .in('release_id', ids)
    if (trackError) return { error: trackError.message, queue: [], pipe: resolveDeliveryPipe(getAggregatorHealth()) }
    for (const track of tracks || []) {
      const row = track as Record<string, unknown>
      const releaseId = String(row.release_id)
      const list = tracksByRelease.get(releaseId) || []
      list.push(asTrack(row))
      tracksByRelease.set(releaseId, list)
    }
  }

  const inputs = releases.map((row) => releaseInputFromRow(row, tracksByRelease.get(String(row.id)) || []))
  const records = releases.map((row) => parseDistroKidDelivery(row.marketing_copy))
  return {
    error: null,
    queue: buildDistroKidQueue(inputs, todayIso(), records),
    pipe: resolveDeliveryPipe(getAggregatorHealth()),
  }
}

export async function persistDistroKidDelivery(
  supabase: SupabaseClient,
  releaseId: string,
  marketingCopy: unknown,
  record: DistroKidDeliveryRecord | null,
  extra: Record<string, unknown>,
) {
  const nextCopy = marketingCopyWithDistroKidDelivery(marketingCopy, record)
  const withMode = { ...extra, marketing_copy: nextCopy, distribution_mode: 'distrokid' }
  let { error } = await supabase.from('distribution_releases').update(withMode).eq('id', releaseId)
  if (error && /distribution_mode|check constraint/i.test(error.message)) {
    ;({ error } = await supabase
      .from('distribution_releases')
      .update({ ...extra, marketing_copy: nextCopy })
      .eq('id', releaseId))
  }
  return error
}

export function submittedDistributorId(releaseId: string, albumuuid?: string | null): string {
  return distrokidReleaseId(releaseId, albumuuid)
}
