import type { SupabaseClient } from '@supabase/supabase-js'
import { isDspStoreId, orderDspStoreIds, type DspStoreId } from '@/lib/studio/constants'
import { storeIsB2bSubmitted } from '@/lib/studio/dsp-providers'
import type { PurchasableTrackRecord } from '@/lib/shop/purchasable-data-file'

/** Fan-facing streaming stores that should be live before a track is sold direct. */
export const SHOP_CORE_STREAMING_STORES: DspStoreId[] = [
  'spotify',
  'apple_music',
  'youtube_music',
  'amazon',
  'deezer',
  'tidal',
]

export type ShopStoreScanMode = 'core' | 'full_targets'

export type DistributionScanReleaseSummary = {
  releaseId: string
  title: string
  eligible: boolean
  mode: ShopStoreScanMode
  trackCount: number
  linkedStores: number
  targetStores: number
  missingStores: DspStoreId[]
}

export type DistributionScanResult = {
  mode: ShopStoreScanMode
  scannedAt: string
  releases: DistributionScanReleaseSummary[]
  candidates: PurchasableTrackRecord[]
  skippedTrackCount: number
}

type ReleaseRow = {
  id: string
  title: string
  artwork_url: string | null
  target_stores: unknown
}

type TrackRow = {
  id: string
  release_id: string
  title: string
  duration: number | null
  wav_url: string | null
  artwork_url: string | null
  isrc_full: string | null
}

type LinkRow = {
  release_id: string
  store: string
  url: string
}

function slugifyTitle(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

function parseTargetStores(raw: unknown): DspStoreId[] {
  if (!Array.isArray(raw)) return []
  return orderDspStoreIds(raw.map((v) => String(v || '').trim()).filter(isDspStoreId))
}

function linksByStore(rows: LinkRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of rows) {
    const store = String(row.store || '').trim()
    const url = String(row.url || '').trim()
    if (!store || !url) continue
    map.set(store, url)
  }
  return map
}

export function evaluateReleaseStoreCoverage(
  mode: ShopStoreScanMode,
  targetStores: DspStoreId[],
  linkMap: Map<string, string>,
): { eligible: boolean; missingStores: DspStoreId[] } {
  if (mode === 'core') {
    const missingStores = SHOP_CORE_STREAMING_STORES.filter((store) => !linkMap.has(store))
    return { eligible: missingStores.length === 0, missingStores }
  }

  const targets = targetStores.length ? targetStores : SHOP_CORE_STREAMING_STORES
  const missingStores: DspStoreId[] = []
  for (const store of targets) {
    if (storeIsB2bSubmitted(store)) continue
    if (!linkMap.has(store)) missingStores.push(store)
  }
  return { eligible: missingStores.length === 0, missingStores }
}

function isSeedPlaceholder(track: PurchasableTrackRecord): boolean {
  return track.id === 'track-1' && track.title === 'Track Name'
}

function trackKey(track: Pick<PurchasableTrackRecord, 'id' | 'isrc' | 'distributionTrackId'>): string {
  if (track.distributionTrackId) return `dt:${track.distributionTrackId}`
  if (track.isrc) return `isrc:${track.isrc}`
  return `id:${track.id}`
}

function buildCandidate(
  release: ReleaseRow,
  track: TrackRow,
  linkMap: Map<string, string>,
): PurchasableTrackRecord | null {
  const wav = String(track.wav_url || '').trim()
  if (!wav) return null

  const isrc = String(track.isrc_full || '').trim()
  const title = String(track.title || 'Untitled').trim()
  const slugBase = slugifyTitle(title)
  const slug = isrc ? `${slugBase}-${isrc.slice(-4).toLowerCase()}` : slugBase
  const id = isrc ? `shop-${isrc.toLowerCase()}` : `shop-${slugifyTitle(track.id)}`

  const spotify = linkMap.get('spotify')
  const description = [
    `Digital download — ${release.title}.`,
    isrc ? `ISRC ${isrc}.` : null,
    spotify ? 'Also streaming on Spotify and other DSPs.' : 'Live on streaming platforms.',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    id,
    title,
    slug,
    description,
    price: 2.99,
    formats: [{ type: 'WAV', file: wav, size: '' }],
    artwork: track.artwork_url || release.artwork_url || undefined,
    duration: typeof track.duration === 'number' ? track.duration : undefined,
    stripePriceId: '',
    licensingEnabled: false,
    availableTiers: [],
    freeDownload: false,
    freeDownloadFormats: [],
    distributionTrackId: track.id,
    releaseId: release.id,
    isrc: isrc || undefined,
  }
}

export async function scanDistributionForPurchasableTracks(
  supabase: SupabaseClient,
  mode: ShopStoreScanMode = 'core',
): Promise<DistributionScanResult> {
  const { data: releases, error: relError } = await supabase
    .from('distribution_releases')
    .select('id, title, artwork_url, target_stores')
    .eq('distributor_status', 'live')

  if (relError) {
    throw new Error(relError.message)
  }

  const liveReleases = (releases || []) as ReleaseRow[]
  if (!liveReleases.length) {
    return {
      mode,
      scannedAt: new Date().toISOString(),
      releases: [],
      candidates: [],
      skippedTrackCount: 0,
    }
  }

  const releaseIds = liveReleases.map((r) => r.id)
  const [{ data: trackRows, error: trackError }, { data: linkRows, error: linkError }] =
    await Promise.all([
      supabase
        .from('distribution_tracks')
        .select('id, release_id, title, duration, wav_url, artwork_url, isrc_full')
        .in('release_id', releaseIds),
      supabase.from('distribution_store_links').select('release_id, store, url').in('release_id', releaseIds),
    ])

  if (trackError) throw new Error(trackError.message)
  if (linkError) throw new Error(linkError.message)

  const tracks = (trackRows || []) as TrackRow[]
  const links = (linkRows || []) as LinkRow[]

  const linksForRelease = new Map<string, LinkRow[]>()
  for (const link of links) {
    const bucket = linksForRelease.get(link.release_id) || []
    bucket.push(link)
    linksForRelease.set(link.release_id, bucket)
  }

  const releaseSummaries: DistributionScanReleaseSummary[] = []
  const candidates: PurchasableTrackRecord[] = []
  let skippedTrackCount = 0

  for (const release of liveReleases) {
    const targetStores = parseTargetStores(release.target_stores)
    const linkMap = linksByStore(linksForRelease.get(release.id) || [])
    const coverage = evaluateReleaseStoreCoverage(mode, targetStores, linkMap)
    const releaseTracks = tracks.filter((t) => t.release_id === release.id)

    releaseSummaries.push({
      releaseId: release.id,
      title: release.title,
      eligible: coverage.eligible,
      mode,
      trackCount: releaseTracks.length,
      linkedStores: linkMap.size,
      targetStores: targetStores.length,
      missingStores: coverage.missingStores,
    })

    if (!coverage.eligible) {
      skippedTrackCount += releaseTracks.length
      continue
    }

    for (const track of releaseTracks) {
      const candidate = buildCandidate(release, track, linkMap)
      if (!candidate) {
        skippedTrackCount += 1
        continue
      }
      candidates.push(candidate)
    }
  }

  return {
    mode,
    scannedAt: new Date().toISOString(),
    releases: releaseSummaries,
    candidates,
    skippedTrackCount,
  }
}

export function mergePurchasableTracksFromScan(
  existing: PurchasableTrackRecord[],
  candidates: PurchasableTrackRecord[],
): PurchasableTrackRecord[] {
  const byKey = new Map<string, PurchasableTrackRecord>()

  for (const track of existing) {
    if (isSeedPlaceholder(track)) continue
    byKey.set(trackKey(track), track)
  }

  for (const candidate of candidates) {
    const key = trackKey(candidate)
    const prev = byKey.get(key)
    byKey.set(key, {
      ...candidate,
      price: prev?.price ?? candidate.price,
      stripePriceId: prev?.stripePriceId ?? candidate.stripePriceId,
      licensingEnabled: prev?.licensingEnabled ?? candidate.licensingEnabled,
      availableTiers: prev?.availableTiers ?? candidate.availableTiers,
      freeDownload: prev?.freeDownload ?? candidate.freeDownload,
      freeDownloadFormats: prev?.freeDownloadFormats ?? candidate.freeDownloadFormats,
      formats: prev?.formats?.length ? prev.formats : candidate.formats,
      previewUrl: prev?.previewUrl || candidate.previewUrl,
    })
  }

  return Array.from(byKey.values()).sort((a, b) => a.title.localeCompare(b.title))
}
