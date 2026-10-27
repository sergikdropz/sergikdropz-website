import Stripe from 'stripe'
import productsData from '@/data/products.json'
import bundlesData from '@/data/bundles.json'
import musicLibrary from '@/data/music-library.json'
import purchasableTracks from '@/data/purchasable-tracks.json'
import { LEGACY_SCHEDULE_TO_VAULT_FOLDER } from '@/lib/studio/migrate-scheduled-eps'
import { createSupabaseServerClient } from '@/lib/supabase'
import { shareDownloadTagFields, type ShareDownloadTagSource } from '@/lib/shares/share-download-tag-text'
import type { ShareAudioTagFields } from '@/lib/shares/share-download-id3'
import { extractVaultRelativePath } from '@/utils/normalizeVaultAudioUrl'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

export type ShopOrderTrack = {
  id: string
  /** Title exactly as the music vault shows it. */
  title: string
  artist: string
  album: string
  year: number | null
  bpm: number | null
  key: string | null
  genre: string | null
  subgenre: string | null
  trackNumber: number | null
  energy: number | null
  composer: string | null
  relativePath: string
  ext: 'mp3' | 'wav'
}

export type ShopOrderDownload = {
  sessionId: string
  title: string
  artist: string
  artwork: string | null
  kindLabel: string
  formatLabel: string
  tracks: ShopOrderTrack[]
}

export type ShopOrderResult =
  | { ok: true; order: ShopOrderDownload }
  | { ok: false; status: number; message: string }

type VaultTrack = {
  id?: string
  title?: string
  artist?: string
  file?: string
  artwork?: string
  track_number?: number
  bpm?: number
  key_signature?: string
  genre?: string
  subgenre?: string
  year?: number
  energy_level?: number
  composer?: string
}

type LibNode = {
  id?: string
  name?: string
  type?: string
  year?: number
  albumArtist?: string
  artwork?: string
  children?: LibNode[]
  tracks?: VaultTrack[]
}

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) return null
  return new Stripe(key, { apiVersion: '2023-10-16' })
}

function findCollection(nodes: LibNode[], id: string): LibNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children?.length) {
      const hit = findCollection(node.children, id)
      if (hit) return hit
    }
  }
  return null
}

/** Saved file name matches the vault title. Illegal path characters are removed. */
export function vaultDownloadFileName(title: string, ext: 'mp3' | 'wav'): string {
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/\s+/g, ' ').trim()
  return `${cleaned || 'Download'}.${ext}`
}

function audioPath(file: string): { relativePath: string; ext: 'mp3' | 'wav' } | null {
  const rel = extractVaultRelativePath(file, { preferMp3: true })
  if (!rel) return null
  return { relativePath: rel, ext: /\.wav$/i.test(rel) ? 'wav' : 'mp3' }
}

function numOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function textOrNull(value: unknown): string | null {
  const text = String(value || '').trim()
  return text || null
}

function productById(productId: string) {
  return productsData.products.find((row) => row.id === productId)
}

function albumTitle(productTitle: string, collectionName: string): string {
  return collectionName.trim() || productTitle.replace(/\(digital download\)/gi, '').replace(/\s+/g, ' ').trim()
}

function titleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Where a vault title sits in the EP sequence. -1 when it is not on the release. */
export function epSequenceIndex(title: string, sequence: string[]): number {
  const vault = titleKey(title)
  if (!vault) return -1
  let best = -1
  let bestScore = 0
  sequence.forEach((name, index) => {
    const key = titleKey(name)
    if (!key) return
    let score = 0
    if (vault === key) score = 100
    else if (vault.endsWith(` ${key}`) || vault.startsWith(`${key} `)) score = 80
    else if (key.length >= 6 && vault.includes(key)) score = 60
    if (score > bestScore) {
      bestScore = score
      best = index
    }
  })
  return best
}

/** Vault files stay as they are. Their order follows the release track list. */
export function orderShopTracksByEp(tracks: ShopOrderTrack[], sequence: string[]): ShopOrderTrack[] {
  if (sequence.length < 2 || tracks.length < 2) return tracks
  return tracks
    .map((track, index) => ({ track, index, pos: epSequenceIndex(track.title, sequence) }))
    .sort((a, b) => {
      const left = a.pos < 0 ? 1000 + a.index : a.pos
      const right = b.pos < 0 ? 1000 + b.index : b.pos
      return left - right
    })
    .map(({ track, pos }) => ({
      ...track,
      trackNumber: pos >= 0 ? pos + 1 : track.trackNumber,
    }))
}

function tracksFromCollection(collection: LibNode, album: string): ShopOrderTrack[] {
  return [...(collection.tracks || [])]
    .sort((a, b) => (a.track_number || 0) - (b.track_number || 0))
    .map((track) => {
      const audio = audioPath(String(track.file || ''))
      const title = String(track.title || '').trim()
      if (!audio || !title) return null
      return {
        id: String(track.id || title),
        title,
        artist: String(track.artist || collection.albumArtist || 'SERGIK').trim() || 'SERGIK',
        album,
        year: numOrNull(track.year) || numOrNull(collection.year),
        bpm: numOrNull(track.bpm),
        key: textOrNull(track.key_signature),
        genre: textOrNull(track.genre),
        subgenre: textOrNull(track.subgenre),
        trackNumber: numOrNull(track.track_number),
        energy: numOrNull(track.energy_level),
        composer: textOrNull(track.composer),
        relativePath: audio.relativePath,
        ext: audio.ext,
      } satisfies ShopOrderTrack
    })
    .filter((row): row is ShopOrderTrack => Boolean(row))
}

function collectionForRelease(releaseId: string): LibNode | null {
  const folderId = LEGACY_SCHEDULE_TO_VAULT_FOLDER[releaseId]
  if (!folderId) return null
  return findCollection((musicLibrary.folders || []) as LibNode[], folderId)
}

function releaseTitleNeedle(fallbackTitle: string): string {
  return fallbackTitle
    .replace(/\(digital download\)/gi, ' ')
    .replace(/\bep\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function distributionReleaseId(releaseId: string, fallbackTitle: string): Promise<string | null> {
  const supabase = createSupabaseServerClient()
  if (releaseId) {
    const { data } = await supabase
      .from('distribution_tracks')
      .select('id')
      .eq('release_id', releaseId)
      .limit(1)
    if (data?.length) return releaseId
  }
  const title = releaseTitleNeedle(fallbackTitle)
  if (!title) return null
  const { data: releases } = await supabase
    .from('distribution_releases')
    .select('id,title')
    .ilike('title', `%${title}%`)
    .limit(8)
  const match =
    (releases || []).find((row) =>
      String(row.title || '').toLowerCase().includes(title.toLowerCase().slice(0, 12)),
    ) || releases?.[0]
  return match?.id ? String(match.id) : null
}

async function distributionTrackSequence(releaseId: string, fallbackTitle: string): Promise<string[]> {
  const id = await distributionReleaseId(releaseId, fallbackTitle)
  if (!id) return []
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('distribution_tracks')
    .select('title,track_number')
    .eq('release_id', id)
    .order('track_number', { ascending: true })
  return (data || []).map((row) => String(row.title || '').trim()).filter(Boolean)
}

async function tracksFromDistribution(releaseId: string, fallbackTitle: string, album: string): Promise<ShopOrderTrack[]> {
  const id = await distributionReleaseId(releaseId, fallbackTitle)
  if (!id) return []
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('distribution_tracks')
    .select('id,title,track_number,wav_url')
    .eq('release_id', id)
    .order('track_number', { ascending: true })
  return (data || [])
    .map((row): ShopOrderTrack | null => {
      const audio = audioPath(String(row.wav_url || ''))
      const title = String(row.title || '').trim()
      if (!audio || !title) return null
      return {
        id: String(row.id),
        title,
        artist: 'SERGIK',
        album,
        year: null,
        bpm: null,
        key: null,
        genre: null,
        subgenre: null,
        trackNumber: numOrNull(row.track_number),
        energy: null,
        composer: null,
        relativePath: audio.relativePath,
        ext: audio.ext,
      }
    })
    .filter((row): row is ShopOrderTrack => row !== null)
}

function artworkUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim()
    if (!raw) continue
    const resolved = resolveImageUrl(raw)
    if (resolved && !resolved.includes('storage.local.invalid')) return resolved
  }
  return null
}

export function shopOrderTagSource(track: ShopOrderTrack): ShareDownloadTagSource {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: 'SERGIK',
    composer: track.composer,
    genre: track.genre,
    subgenre: track.subgenre,
    year: track.year,
    trackNumber: track.trackNumber,
    trackCount: null,
    bpm: track.bpm,
    key: track.key,
    energy: track.energy,
  }
}

export function shopOrderTags(track: ShopOrderTrack, trackCount: number, fromLibrary?: ShareAudioTagFields | null): ShareAudioTagFields {
  const local = shareDownloadTagFields({ ...shopOrderTagSource(track), trackCount })
  if (!fromLibrary) return local
  const merged = { ...local }
  for (const key of Object.keys(local) as Array<keyof ShareAudioTagFields>) {
    const remote = String(fromLibrary[key] || '').trim()
    if (remote) merged[key] = remote
  }
  merged.title = track.title
  if (local.track) merged.track = local.track
  return merged
}

async function resolveShopOrderFromPurchase(sessionId: string): Promise<ShopOrderResult | null> {
  const id = sessionId.trim()
  if (!id.startsWith('mq_') && !id.startsWith('cr_')) return null

  const supabase = createSupabaseServerClient()
  const { data: purchase } = await supabase
    .from('purchases')
    .select('track_id, format, product_type')
    .eq('stripe_session_id', id)
    .maybeSingle()

  if (!purchase?.track_id) {
    return { ok: false, status: 404, message: 'This download link could not be opened.' }
  }

  const meta = {
    productType: purchase.product_type === 'member-quota' ? 'ep-bundle' : purchase.product_type || 'ep-bundle',
    productId: String(purchase.track_id),
    format: String(purchase.format || 'MP3'),
  }
  return await buildShopOrderFromMetadata(id, meta)
}

async function buildShopOrderFromMetadata(
  sessionId: string,
  meta: { productType?: string; productId?: string; format?: string; releaseId?: string; bundleId?: string; trackId?: string; fileName?: string },
): Promise<ShopOrderResult> {
  const productType = String(meta.productType || 'track')
  const formatLabel = String(meta.format || '').trim().toUpperCase()

  if (productType === 'track' && meta.trackId) {
    const catalog = purchasableTracks.tracks.find((row) => row.id === meta.trackId)
    const selected = catalog?.formats.find((row) => row.type.toLowerCase() === String(meta.format || '').toLowerCase())
    const audio = audioPath(String(selected?.file || meta.fileName || ''))
    if (!catalog || !audio) {
      return { ok: false, status: 404, message: 'Payment is confirmed, but this track is not in the vault yet.' }
    }
    const title = catalog.title.trim() || 'Track'
    return {
      ok: true,
      order: {
        sessionId,
        title,
        artist: 'SERGIK',
        artwork: artworkUrl(catalog.artwork),
        kindLabel: 'TRACK',
        formatLabel,
        tracks: [
          {
            id: catalog.id,
            title,
            artist: 'SERGIK',
            album: title,
            year: null,
            bpm: null,
            key: null,
            genre: null,
            subgenre: null,
            trackNumber: 1,
            energy: null,
            composer: null,
            relativePath: audio.relativePath,
            ext: audio.ext,
          },
        ],
      },
    }
  }

  const productIds =
    productType === 'bundle'
      ? bundlesData.bundles.find((row) => row.id === meta.bundleId)?.productIds || []
      : [String(meta.productId || '')].filter(Boolean)

  return await resolveShopOrderFromProductIds(sessionId, productIds, meta, formatLabel, productType)
}

async function resolveShopOrderFromProductIds(
  sessionId: string,
  productIds: string[],
  meta: { productId?: string; releaseId?: string },
  formatLabel: string,
  productType: string,
): Promise<ShopOrderResult> {
  const tracks: ShopOrderTrack[] = []
  let title = 'Download'
  let artist = 'SERGIK'
  let artwork: string | null = null
  let kindLabel = productIds.length > 1 ? 'BUNDLE' : 'EP'

  for (const productId of productIds) {
    const product = productById(productId)
    const productTitle = product?.title || productId
    const releaseId =
      productId === meta.productId ? String(meta.releaseId || product?.release_id || '') : String(product?.release_id || '')
    const collection = collectionForRelease(releaseId)
    const album = albumTitle(productTitle, collection?.name || '')
    const sequence = await distributionTrackSequence(releaseId, productTitle)
    const rows = orderShopTracksByEp(
      collection ? tracksFromCollection(collection, album) : await tracksFromDistribution(releaseId, productTitle, album),
      sequence,
    )
    if (!artwork) {
      artwork = artworkUrl(product?.artwork, collection?.artwork, collection?.tracks?.[0]?.artwork)
    }
    if (tracks.length === 0 && rows.length) {
      title = album || productTitle
      artist = collection?.albumArtist || rows[0]?.artist || 'SERGIK'
      kindLabel = (collection?.type || 'ep').toUpperCase()
    }
    tracks.push(...rows)
  }

  if (!tracks.length) {
    return {
      ok: false,
      status: 404,
      message: 'Payment is confirmed, but the audio files are not attached to this order yet.',
    }
  }

  return {
    ok: true,
    order: {
      sessionId,
      title,
      artist,
      artwork,
      kindLabel,
      formatLabel,
      tracks,
    },
  }
}

export async function resolveShopOrderDownload(sessionId: string): Promise<ShopOrderResult> {
  const id = sessionId.trim()
  const fromPurchase = await resolveShopOrderFromPurchase(id)
  if (fromPurchase) return fromPurchase

  if (!id.startsWith('cs_')) {
    return { ok: false, status: 400, message: 'This download link is incomplete.' }
  }
  const stripe = stripeClient()
  if (!stripe) return { ok: false, status: 503, message: 'Downloads are not available right now.' }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(id)
  } catch (error) {
    console.error('Order download session failed:', error)
    return { ok: false, status: 404, message: 'This download link could not be opened.' }
  }
  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    return { ok: false, status: 403, message: 'This payment is not complete yet.' }
  }

  return buildShopOrderFromMetadata(session.id, session.metadata || {})
}
