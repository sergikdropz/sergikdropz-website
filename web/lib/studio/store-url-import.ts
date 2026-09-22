/**
 * LANDR-style store URL → release draft (Spotify / Apple Music → ISRC/UPC/titles).
 * Complements DistroKid JSON import for stream-safe distributor switches.
 */

import artistData from '@/data/artist.json'
import {
  appleMusicIdFromUrl,
  connectReleaseToDsps,
  isHttpUrl,
  normalizeIsrc,
  normalizeUpc,
  parseKnownStoreUrl,
  titlesMatch,
} from '@/lib/studio/dsp-connect'
import { parseISRC } from '@/lib/studio/isrc-format'
import { emptyStreamContinuity } from '@/lib/studio/stream-continuity'
import { studioTypeFromTrackCount } from '@/lib/studio/distrokid-import'
import type { StudioReleaseType } from '@/lib/studio/vault-import'

const ARTIST_NAME = artistData.artist_name || 'SERGIK'

export type StoreUrlTrackDraft = {
  track_number: number
  title: string
  isrc_full: string | null
  isrc_prefix: string | null
  isrc_year: number | null
  isrc_serial: number | null
  duration_ms?: number | null
}

export type StoreUrlReleaseDraft = {
  id: string
  title: string
  type: StudioReleaseType
  album_artist: string | null
  release_date: string | null
  original_release_date: string | null
  upc: string | null
  previous_upc: string | null
  previous_isrc: string | null
  previously_released: true
  artwork_url: string | null
  seed_url: string
  tracks: StoreUrlTrackDraft[]
  store_links: Array<{ store: string; url: string }>
  notes: string[]
  marketing_meta: {
    source: 'store_url'
    seed_url: string
    upc: string | null
    importedAt: string
    spotify_album_id?: string | null
    apple_album_id?: string | null
  }
}

export type ResolveStoreUrlOptions = {
  fetchImpl?: typeof fetch
  matchVaultHint?: boolean
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function parseSpotifyAlbumId(url: string): string | null {
  const match = url.match(/open\.spotify\.com\/album\/([a-zA-Z0-9]+)/i)
  return match?.[1] || null
}

export function parseSpotifyTrackId(url: string): string | null {
  const match = url.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/i)
  return match?.[1] || null
}

export function studioReleaseIdFromStoreUrl(seedUrl: string, now: number = Date.now()): string {
  const known = parseKnownStoreUrl(seedUrl)
  const album =
    parseSpotifyAlbumId(seedUrl) ||
    appleMusicIdFromUrl(seedUrl) ||
    parseSpotifyTrackId(seedUrl) ||
    'url'
  const store = known?.store || 'store'
  return `release-url-${store}-${album}-${now.toString(36)}`.slice(0, 80)
}

function trackDraftFromIsrc(
  track_number: number,
  title: string,
  isrc: string | null | undefined,
  duration_ms?: number | null,
): StoreUrlTrackDraft {
  const parsed = isrc ? parseISRC(isrc) : null
  return {
    track_number,
    title: clean(title) || `Track ${track_number}`,
    isrc_full: parsed?.isrc_full ?? normalizeIsrc(isrc) ?? null,
    isrc_prefix: parsed?.prefix ?? null,
    isrc_year: parsed?.year ?? null,
    isrc_serial: parsed?.serial ?? null,
    duration_ms: duration_ms ?? null,
  }
}

async function getSpotifyToken(fetchImpl: typeof fetch): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  try {
    const response = await fetchImpl('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return null
    const data = (await response.json()) as { access_token?: string }
    return data.access_token || null
  } catch {
    return null
  }
}

async function fetchSpotifyAlbumDraft(
  albumId: string,
  seedUrl: string,
  fetchImpl: typeof fetch,
  notes: string[],
): Promise<Partial<StoreUrlReleaseDraft> | null> {
  const token = await getSpotifyToken(fetchImpl)
  if (!token) {
    notes.push('Set SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET for full Spotify album + ISRC import.')
    return null
  }

  const albumRes = await fetchImpl(`https://api.spotify.com/v1/albums/${albumId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12000),
  })
  if (!albumRes.ok) {
    notes.push(`Spotify album lookup failed (${albumRes.status}).`)
    return null
  }
  const album = (await albumRes.json()) as {
    name?: string
    release_date?: string
    images?: Array<{ url?: string }>
    external_ids?: { upc?: string }
    artists?: Array<{ name?: string }>
    tracks?: {
      items?: Array<{
        name?: string
        track_number?: number
        duration_ms?: number
        external_ids?: { isrc?: string }
        id?: string
      }>
      next?: string | null
    }
  }

  let items = album.tracks?.items || []
  let nextUrl = album.tracks?.next || null
  while (nextUrl) {
    const pageRes = await fetchImpl(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12000),
    })
    if (!pageRes.ok) break
    const page = (await pageRes.json()) as {
      items?: typeof items
      next?: string | null
    }
    items = items.concat(page.items || [])
    nextUrl = page.next || null
  }

  // Spotify album track list often omits ISRC — fetch track endpoints in batches.
  const trackIds = items.map((t) => t.id).filter(Boolean) as string[]
  const isrcById = new Map<string, string>()
  for (let i = 0; i < trackIds.length; i += 50) {
    const batch = trackIds.slice(i, i + 50)
    const tracksRes = await fetchImpl(
      `https://api.spotify.com/v1/tracks?ids=${encodeURIComponent(batch.join(','))}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(12000),
      },
    )
    if (!tracksRes.ok) continue
    const tracksPayload = (await tracksRes.json()) as {
      tracks?: Array<{ id?: string; external_ids?: { isrc?: string } } | null>
    }
    for (const track of tracksPayload.tracks || []) {
      const isrc = normalizeIsrc(track?.external_ids?.isrc)
      if (track?.id && isrc) isrcById.set(track.id, isrc)
    }
  }

  const upc = normalizeUpc(album.external_ids?.upc) || null
  const tracks = items.map((item, index) => {
    const isrc =
      normalizeIsrc(item.external_ids?.isrc) ||
      (item.id ? isrcById.get(item.id) : undefined) ||
      null
    return trackDraftFromIsrc(
      item.track_number || index + 1,
      item.name || `Track ${index + 1}`,
      isrc,
      item.duration_ms,
    )
  })

  const missingIsrc = tracks.filter((t) => !t.isrc_full).length
  if (missingIsrc) {
    notes.push(
      `${missingIsrc} track(s) missing ISRC from Spotify — paste DistroKid JSON or set codes manually.`,
    )
  }

  return {
    title: clean(album.name) || 'Untitled',
    album_artist: clean(album.artists?.[0]?.name) || ARTIST_NAME,
    release_date: album.release_date?.slice(0, 10) || null,
    original_release_date: album.release_date?.slice(0, 10) || null,
    upc,
    previous_upc: upc,
    previous_isrc: tracks.find((t) => t.isrc_full)?.isrc_full || null,
    artwork_url: album.images?.[0]?.url || null,
    tracks,
    marketing_meta: {
      source: 'store_url',
      seed_url: seedUrl,
      upc,
      importedAt: new Date().toISOString(),
      spotify_album_id: albumId,
    },
  }
}

async function fetchItunesAlbumDraft(
  appleId: string,
  seedUrl: string,
  fetchImpl: typeof fetch,
  notes: string[],
): Promise<Partial<StoreUrlReleaseDraft> | null> {
  try {
    const response = await fetchImpl(
      `https://itunes.apple.com/lookup?id=${encodeURIComponent(appleId)}&entity=song&country=US`,
      { signal: AbortSignal.timeout(12000) },
    )
    if (!response.ok) {
      notes.push(`Apple Music / iTunes lookup failed (${response.status}).`)
      return null
    }
    const payload = (await response.json()) as {
      results?: Array<Record<string, unknown>>
    }
    const results = payload.results || []
    const collection = results.find((row) => row.wrapperType === 'collection')
    const songs = results.filter((row) => row.wrapperType === 'track' || row.kind === 'song')

    if (!collection && !songs.length) {
      notes.push('Apple Music lookup returned no album or songs.')
      return null
    }

    const upc = normalizeUpc(String(collection?.upc || '')) || null
    const title =
      clean(collection?.collectionName) ||
      clean(songs[0]?.collectionName) ||
      clean(songs[0]?.trackName) ||
      'Untitled'
    const artist =
      clean(collection?.artistName) || clean(songs[0]?.artistName) || ARTIST_NAME
    const releaseDate = String(collection?.releaseDate || songs[0]?.releaseDate || '').slice(0, 10)
    const artwork = clean(collection?.artworkUrl100 || songs[0]?.artworkUrl100).replace(
      /100x100bb/,
      '1200x1200bb',
    )

    const tracks = (songs.length ? songs : [{ trackName: title, trackNumber: 1, isrc: null }]).map(
      (song, index) =>
        trackDraftFromIsrc(
          Number(song.trackNumber) || index + 1,
          String(song.trackName || `Track ${index + 1}`),
          String(song.isrc || '') || null,
          typeof song.trackTimeMillis === 'number' ? song.trackTimeMillis : null,
        ),
    )

    const missingIsrc = tracks.filter((t) => !t.isrc_full).length
    if (missingIsrc) {
      notes.push(
        `${missingIsrc} track(s) missing ISRC from Apple — DistroKid export or manual ISRC recommended.`,
      )
    }

    return {
      title,
      album_artist: artist,
      release_date: releaseDate || null,
      original_release_date: releaseDate || null,
      upc,
      previous_upc: upc,
      previous_isrc: tracks.find((t) => t.isrc_full)?.isrc_full || null,
      artwork_url: artwork || null,
      tracks,
      marketing_meta: {
        source: 'store_url',
        seed_url: seedUrl,
        upc,
        importedAt: new Date().toISOString(),
        apple_album_id: appleId,
      },
    }
  } catch {
    notes.push('Apple Music / iTunes lookup errored.')
    return null
  }
}

async function resolveSpotifyTrackToAlbumId(
  trackId: string,
  fetchImpl: typeof fetch,
  notes: string[],
): Promise<string | null> {
  const token = await getSpotifyToken(fetchImpl)
  if (!token) {
    notes.push('Spotify track URL needs API credentials to resolve the parent album.')
    return null
  }
  const response = await fetchImpl(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) return null
  const data = (await response.json()) as { album?: { id?: string } }
  return data.album?.id || null
}

/**
 * Resolve a Spotify or Apple Music URL into a previously-released studio draft.
 */
export async function resolveStoreUrlToReleaseDraft(
  seedUrlRaw: string,
  options: ResolveStoreUrlOptions = {},
): Promise<StoreUrlReleaseDraft> {
  const seedUrl = clean(seedUrlRaw)
  if (!isHttpUrl(seedUrl)) {
    throw new Error('Paste a full Spotify or Apple Music album/track URL.')
  }
  const known = parseKnownStoreUrl(seedUrl)
  if (!known || (known.store !== 'spotify' && known.store !== 'apple_music')) {
    throw new Error('Only Spotify or Apple Music album/track URLs are supported for migrate import.')
  }

  const fetchImpl = options.fetchImpl || fetch
  const notes: string[] = []
  let partial: Partial<StoreUrlReleaseDraft> | null = null

  const spotifyAlbumId = parseSpotifyAlbumId(seedUrl)
  const spotifyTrackId = parseSpotifyTrackId(seedUrl)
  const appleId = appleMusicIdFromUrl(seedUrl)

  if (spotifyAlbumId) {
    partial = await fetchSpotifyAlbumDraft(spotifyAlbumId, seedUrl, fetchImpl, notes)
  } else if (spotifyTrackId) {
    const albumId = await resolveSpotifyTrackToAlbumId(spotifyTrackId, fetchImpl, notes)
    if (albumId) {
      partial = await fetchSpotifyAlbumDraft(albumId, seedUrl, fetchImpl, notes)
    }
  } else if (appleId) {
    partial = await fetchItunesAlbumDraft(appleId, seedUrl, fetchImpl, notes)
  }

  // Fan-out store links via existing DSP connect (Odesli / iTunes / etc.).
  const connect = await connectReleaseToDsps(
    {
      title: partial?.title,
      upc: partial?.upc,
      isrcs: (partial?.tracks || []).map((t) => t.isrc_full),
      seedUrl,
    },
    { fetchImpl },
  )
  notes.push(...connect.notes)

  const tracks = partial?.tracks?.length
    ? partial.tracks
    : [
        trackDraftFromIsrc(
          1,
          partial?.title || 'Untitled',
          connect.queried.isrc || null,
        ),
      ]

  if (!partial?.title && connect.queried.title) {
    notes.push('Used oEmbed / lookup title — verify metadata before distribute.')
  }

  const upc = partial?.upc || normalizeUpc(connect.queried.upc) || null
  const title = clean(partial?.title) || clean(connect.queried.title) || 'Untitled'
  const type = studioTypeFromTrackCount(tracks.length)
  const now = Date.now()

  return {
    id: studioReleaseIdFromStoreUrl(seedUrl, now),
    title,
    type,
    album_artist: partial?.album_artist || ARTIST_NAME,
    release_date: partial?.release_date || null,
    original_release_date: partial?.original_release_date || partial?.release_date || null,
    upc,
    previous_upc: upc,
    previous_isrc: partial?.previous_isrc || tracks.find((t) => t.isrc_full)?.isrc_full || null,
    previously_released: true,
    artwork_url: partial?.artwork_url || null,
    seed_url: seedUrl,
    tracks,
    store_links: connect.links.map((link) => ({ store: link.store, url: link.url })),
    notes,
    marketing_meta: {
      source: 'store_url',
      seed_url: seedUrl,
      upc,
      importedAt: new Date().toISOString(),
      spotify_album_id: parseSpotifyAlbumId(seedUrl) || partial?.marketing_meta?.spotify_album_id,
      apple_album_id: appleId || partial?.marketing_meta?.apple_album_id,
    },
  }
}

export function summarizeStoreUrlDraft(draft: StoreUrlReleaseDraft): {
  title: string
  type: StudioReleaseType
  trackCount: number
  withIsrc: number
  upc: string | null
  storeLinkCount: number
  notes: string[]
} {
  return {
    title: draft.title,
    type: draft.type,
    trackCount: draft.tracks.length,
    withIsrc: draft.tracks.filter((t) => t.isrc_full).length,
    upc: draft.upc,
    storeLinkCount: draft.store_links.length,
    notes: draft.notes,
  }
}

export function marketingCopyWithStoreUrlMeta(
  existing: Record<string, unknown> | null | undefined,
  draft: StoreUrlReleaseDraft,
): Record<string, unknown> {
  const continuity = emptyStreamContinuity('store_url')
  continuity.seed_url = draft.seed_url
  continuity.old_distributor = 'prior'
  continuity.phases = {
    captured: true,
    identity_verified: Boolean(
      draft.upc || draft.tracks.some((t) => t.isrc_full) || draft.store_links.length,
    ),
  }
  return {
    ...(existing || {}),
    _store_url: draft.marketing_meta,
    _stream_continuity: {
      ...continuity,
      updated_at: new Date().toISOString(),
    },
  }
}

/** Prefer DistroKid meta when both exist; used for conflict messaging. */
export function titlesCompatible(a: string, b: string): boolean {
  return titlesMatch(a, b)
}
