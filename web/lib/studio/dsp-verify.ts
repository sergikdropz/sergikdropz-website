/**
 * DSP live verification — prove a saved store URL is the release live page,
 * not an artist profile or dead link.
 */

import { DSP_STORES, isDspStoreId, type DspStoreId } from '@/lib/studio/constants'
import {
  appleMusicIdFromUrl,
  dspConnectProviders,
  normalizeIsrc,
  normalizeUpc,
  parseKnownStoreUrl,
  titlesMatch,
} from '@/lib/studio/dsp-connect'
import { storeIsB2bSubmitted } from '@/lib/studio/dsp-providers'

export const DSP_VERIFICATION_STATUSES = [
  'unverified',
  'live',
  'reachable',
  'artist_only',
  'b2b',
  'failed',
] as const

export type DspVerificationStatus = (typeof DSP_VERIFICATION_STATUSES)[number]

export type DspUrlKind = 'album' | 'track' | 'playlist' | 'artist' | 'unknown'

export type DspVerifyResult = {
  store: DspStoreId
  url: string
  status: DspVerificationStatus
  detail: string
  verified_at: string | null
  kind: DspUrlKind
}

export type DspVerifySummary = {
  live: number
  reachable: number
  artist_only: number
  b2b: number
  failed: number
  unverified: number
  total: number
  results: DspVerifyResult[]
}

const ARTIST_PATH =
  /\/(artist|artists|channel|user|@|add)(\/|$)|\/artist\/|open\.spotify\.com\/artist\/|music\.apple\.com\/[^/]+\/artist\/|deezer\.com\/(?:[a-z]{2}\/)?artist\/|tidal\.com\/(?:browse\/)?artist\/|soundcloud\.com\/[^/]+\/?$/i

const ALBUM_PATH =
  /\/(album|albums|release|releases)(\/|$)|open\.spotify\.com\/album\/|music\.apple\.com\/[^/]+\/album\/|deezer\.com\/(?:[a-z]{2}\/)?album\/|tidal\.com\/(?:browse\/)?album\/|amazon\.com\/.*\/(dp|gp\/product)\//i

const TRACK_PATH =
  /\/(track|tracks|song|songs|watch)(\/|$)|open\.spotify\.com\/track\/|music\.apple\.com\/[^/]+\/song\/|youtu\.be\/|youtube\.com\/watch|music\.youtube\.com\/watch/i

const PLAYLIST_PATH = /\/(playlist|playlists)(\/|$)|open\.spotify\.com\/playlist\//i

export function isDspVerificationStatus(value: unknown): value is DspVerificationStatus {
  return DSP_VERIFICATION_STATUSES.includes(value as DspVerificationStatus)
}

/** Classify a store URL as album / track / artist / etc. */
export function classifyStoreUrl(store: string, url: string): DspUrlKind {
  const trimmed = String(url || '').trim()
  if (!/^https?:\/\//i.test(trimmed)) return 'unknown'

  const parsed = parseKnownStoreUrl(trimmed)
  if (parsed && parsed.store !== store && isDspStoreId(store)) {
    // Wrong host for claimed store — still classify shape for detail.
  }

  if (PLAYLIST_PATH.test(trimmed)) return 'playlist'
  if (TRACK_PATH.test(trimmed)) return 'track'
  if (ALBUM_PATH.test(trimmed)) return 'album'
  if (ARTIST_PATH.test(trimmed)) return 'artist'

  // Store-specific fallbacks
  if (store === 'instagram' || store === 'tiktok' || store === 'snapchat') return 'artist'
  if (store === 'youtube' && /youtube\.com\/@|youtube\.com\/channel\//i.test(trimmed)) return 'artist'
  if (store === 'bandcamp' && /\.bandcamp\.com\/?$/i.test(trimmed)) return 'artist'
  if (store === 'mixcloud' && /mixcloud\.com\/[^/]+\/?$/i.test(trimmed)) return 'artist'
  if (store === 'beatport' && /beatport\.com\/artist\//i.test(trimmed)) return 'artist'
  if (store === 'traxsource' && /traxsource\.com\/artist\//i.test(trimmed)) return 'artist'
  if (store === 'iheart' && /iheart\.com\/artist\/[^/]+\/?$/i.test(trimmed)) return 'artist'
  if (store === 'iheart' && /\/albums\/id-\d+/i.test(trimmed)) return 'album'
  if (store === 'shazam' && /shazam\.com\/artist\//i.test(trimmed)) return 'artist'
  if (store === 'shazam' && /shazam\.com\/album\//i.test(trimmed)) return 'album'

  return 'unknown'
}

export function spotifyEntityIdFromUrl(url: string): { type: string; id: string } | null {
  const m = url.match(/open\.spotify\.com\/(album|track|artist|playlist)\/([a-zA-Z0-9]+)/i)
  if (!m) return null
  return { type: m[1]!.toLowerCase(), id: m[2]! }
}

export function deezerEntityIdFromUrl(url: string): { type: string; id: string } | null {
  const m = url.match(/deezer\.com\/(?:[a-z]{2}\/)?(album|track|artist)\/(\d+)/i)
  if (!m) return null
  return { type: m[1]!.toLowerCase(), id: m[2]! }
}

export async function probeStoreUrl(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; status: number; detail: string }> {
  try {
    const head = await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'SERGIKStudio/1.0 (dsp-verify)' },
    })
    if (head.status >= 200 && head.status < 400) {
      return { ok: true, status: head.status, detail: `http_${head.status}` }
    }
    // Many DSPs reject HEAD (405/403) or return bogus 404 — fall back to a ranged GET.
    const get = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SERGIKStudio/1.0; +https://sergikdropz.com)',
        Range: 'bytes=0-0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    if (get.status >= 200 && get.status < 400) {
      return { ok: true, status: get.status, detail: `http_${get.status}` }
    }
    return {
      ok: false,
      status: get.status || head.status,
      detail: `http_${get.status || head.status}`,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'probe_error'
    return { ok: false, status: 0, detail: message.slice(0, 80) }
  }
}

function sameSpotifyEntity(a: string, b: string): boolean {
  const left = spotifyEntityIdFromUrl(a)
  const right = spotifyEntityIdFromUrl(b)
  if (!left || !right) return false
  return left.type === right.type && left.id === right.id
}

function sameAppleEntity(a: string, b: string): boolean {
  const left = appleMusicIdFromUrl(a)
  const right = appleMusicIdFromUrl(b)
  return Boolean(left && right && left === right)
}

function sameDeezerEntity(a: string, b: string): boolean {
  const left = deezerEntityIdFromUrl(a)
  const right = deezerEntityIdFromUrl(b)
  if (!left || !right) return false
  return left.id === right.id
}

async function rematchSpotify(input: {
  url: string
  isrc?: string
  upc?: string
  fetchImpl: typeof fetch
}): Promise<'match' | 'mismatch' | 'skip'> {
  const providers = dspConnectProviders()
  if (!providers.spotify) return 'skip'
  const entity = spotifyEntityIdFromUrl(input.url)
  if (!entity || (entity.type !== 'album' && entity.type !== 'track')) return 'skip'

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return 'skip'

  try {
    const tokenRes = await input.fetchImpl('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8000),
    })
    if (!tokenRes.ok) return 'skip'
    const tokenJson = (await tokenRes.json()) as { access_token?: string }
    const token = tokenJson.access_token
    if (!token) return 'skip'

    const q = input.isrc
      ? `isrc:${input.isrc}`
      : input.upc
        ? `upc:${input.upc}`
        : null
    if (!q) return 'skip'
    const type = input.isrc ? 'track' : 'album'
    const search = await input.fetchImpl(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!search.ok) return 'skip'
    const data = (await search.json()) as {
      tracks?: { items?: Array<{ external_urls?: { spotify?: string }; album?: { external_urls?: { spotify?: string } } }> }
      albums?: { items?: Array<{ external_urls?: { spotify?: string } }> }
    }
    const found =
      type === 'track'
        ? data.tracks?.items?.[0]?.external_urls?.spotify ||
          data.tracks?.items?.[0]?.album?.external_urls?.spotify
        : data.albums?.items?.[0]?.external_urls?.spotify
    if (!found) return 'mismatch'
    const foundEntity = spotifyEntityIdFromUrl(found)
    if (foundEntity && foundEntity.id === entity.id) return 'match'
    // ISRC track search may return track while we stored album — accept same album id.
    if (
      type === 'track' &&
      entity.type === 'album' &&
      data.tracks?.items?.[0]?.album?.external_urls?.spotify
    ) {
      const albumUrl = data.tracks.items[0].album.external_urls.spotify
      if (sameSpotifyEntity(input.url, albumUrl)) return 'match'
    }
    return 'mismatch'
  } catch {
    return 'skip'
  }
}

async function rematchApple(input: {
  url: string
  title?: string
  isrc?: string
  upc?: string
  fetchImpl: typeof fetch
}): Promise<'match' | 'mismatch' | 'skip'> {
  const id = appleMusicIdFromUrl(input.url)
  if (!id) return 'skip'
  try {
    if (input.isrc) {
      const res = await input.fetchImpl(
        `https://itunes.apple.com/lookup?isrc=${encodeURIComponent(input.isrc)}&country=US`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) return 'skip'
      const data = (await res.json()) as {
        results?: Array<{ trackViewUrl?: string; collectionViewUrl?: string; collectionId?: number }>
      }
      const hit = (data.results || []).find(
        (r) =>
          appleMusicIdFromUrl(String(r.trackViewUrl || r.collectionViewUrl || '')) === id ||
          String(r.collectionId || '') === id
      )
      if (hit) return 'match'
      if ((data.results || []).length) return 'mismatch'
    }
    if (input.upc) {
      const res = await input.fetchImpl(
        `https://itunes.apple.com/lookup?upc=${encodeURIComponent(input.upc)}&country=US`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) return 'skip'
      const data = (await res.json()) as {
        results?: Array<{ collectionViewUrl?: string; collectionId?: number; collectionName?: string }>
      }
      const hit = (data.results || []).find(
        (r) =>
          appleMusicIdFromUrl(String(r.collectionViewUrl || '')) === id ||
          String(r.collectionId || '') === id
      )
      if (hit) return 'match'
      if (input.title) {
        const named = (data.results || []).find((r) =>
          titlesMatch(String(r.collectionName || ''), input.title || '')
        )
        if (named && appleMusicIdFromUrl(String(named.collectionViewUrl || '')) === id) return 'match'
      }
      if ((data.results || []).length) return 'mismatch'
    }
    return 'skip'
  } catch {
    return 'skip'
  }
}

async function rematchDeezer(input: {
  url: string
  isrc?: string
  fetchImpl: typeof fetch
}): Promise<'match' | 'mismatch' | 'skip'> {
  const entity = deezerEntityIdFromUrl(input.url)
  if (!entity) return 'skip'
  if (!input.isrc) return 'skip'
  try {
    const res = await input.fetchImpl(
      `https://api.deezer.com/track/isrc:${encodeURIComponent(input.isrc)}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return 'skip'
    const data = (await res.json()) as {
      id?: number
      link?: string
      album?: { id?: number; link?: string }
      error?: unknown
    }
    if (data.error) return 'mismatch'
    if (entity.type === 'track' && String(data.id || '') === entity.id) return 'match'
    if (entity.type === 'album' && String(data.album?.id || '') === entity.id) return 'match'
    if (data.link && sameDeezerEntity(input.url, data.link)) return 'match'
    if (data.album?.link && sameDeezerEntity(input.url, data.album.link)) return 'match'
    return 'mismatch'
  } catch {
    return 'skip'
  }
}

export async function rematchCatalog(input: {
  store: DspStoreId
  url: string
  title?: string | null
  isrcs?: Array<string | null | undefined>
  upc?: string | null
  fetchImpl?: typeof fetch
}): Promise<'match' | 'mismatch' | 'skip'> {
  const fetchImpl = input.fetchImpl || fetch
  const isrc = (input.isrcs || []).map(normalizeIsrc).find(Boolean)
  const upc = normalizeUpc(input.upc)
  if (input.store === 'spotify') {
    return rematchSpotify({ url: input.url, isrc, upc, fetchImpl })
  }
  if (input.store === 'apple_music') {
    return rematchApple({
      url: input.url,
      title: input.title || undefined,
      isrc,
      upc,
      fetchImpl,
    })
  }
  if (input.store === 'deezer') {
    return rematchDeezer({ url: input.url, isrc, fetchImpl })
  }
  return 'skip'
}

export async function verifyStoreLink(input: {
  store: string
  url: string
  title?: string | null
  isrcs?: Array<string | null | undefined>
  upc?: string | null
  fetchImpl?: typeof fetch
  now?: Date
}): Promise<DspVerifyResult> {
  const storeRaw = String(input.store || '').trim()
  const url = String(input.url || '').trim()
  const nowIso = (input.now || new Date()).toISOString()
  const fetchImpl = input.fetchImpl || fetch

  if (!isDspStoreId(storeRaw)) {
    return {
      store: 'spotify',
      url,
      status: 'failed',
      detail: 'unknown_store',
      verified_at: null,
      kind: 'unknown',
    }
  }
  const store = storeRaw

  if (storeIsB2bSubmitted(store)) {
    return {
      store,
      url,
      status: 'b2b',
      detail: 'b2b_submitted',
      verified_at: null,
      kind: 'unknown',
    }
  }

  if (!/^https?:\/\//i.test(url)) {
    return {
      store,
      url,
      status: 'failed',
      detail: 'invalid_url',
      verified_at: null,
      kind: 'unknown',
    }
  }

  const hostOk = parseKnownStoreUrl(url)
  if (hostOk && hostOk.store !== store) {
    return {
      store,
      url,
      status: 'failed',
      detail: `host_mismatch_${hostOk.store}`,
      verified_at: null,
      kind: classifyStoreUrl(store, url),
    }
  }

  const kind = classifyStoreUrl(store, url)
  if (kind === 'artist') {
    return {
      store,
      url,
      status: 'artist_only',
      detail: 'artist_profile',
      verified_at: null,
      kind,
    }
  }

  const probe = await probeStoreUrl(url, fetchImpl)
  if (!probe.ok) {
    // Bot walls often 403 album pages that are live in a browser — don't fail the release.
    if (
      (kind === 'album' || kind === 'track') &&
      (probe.status === 401 || probe.status === 403 || probe.status === 429)
    ) {
      return {
        store,
        url,
        status: 'reachable',
        detail: `probe_blocked_${probe.status}`,
        verified_at: nowIso,
        kind,
      }
    }
    // Deezer HTML often 403/404 to bots; public album API is authoritative.
    if (store === 'deezer' && (kind === 'album' || kind === 'track')) {
      const entity = deezerEntityIdFromUrl(url)
      if (entity) {
        try {
          const api = await fetchImpl(`https://api.deezer.com/${entity.type}/${entity.id}`, {
            signal: AbortSignal.timeout(8000),
          })
          if (api.ok) {
            const data = (await api.json()) as { id?: number; error?: unknown }
            if (data.id && !data.error) {
              return {
                store,
                url,
                status: 'reachable',
                detail: 'deezer_api_ok',
                verified_at: nowIso,
                kind,
              }
            }
          }
        } catch {
          // fall through
        }
      }
    }
    return {
      store,
      url,
      status: 'failed',
      detail: probe.detail || 'unreachable',
      verified_at: null,
      kind,
    }
  }

  if (kind === 'album' || kind === 'track') {
    const rematch = await rematchCatalog({
      store,
      url,
      title: input.title,
      isrcs: input.isrcs,
      upc: input.upc,
      fetchImpl,
    })
    if (rematch === 'match') {
      return {
        store,
        url,
        status: 'live',
        detail: 'catalog_match',
        verified_at: nowIso,
        kind,
      }
    }
    if (rematch === 'mismatch') {
      return {
        store,
        url,
        status: 'failed',
        detail: 'catalog_mismatch',
        verified_at: null,
        kind,
      }
    }
  }

  // Reachable album/track (or unknown shape) without catalog rematch.
  if (kind === 'album' || kind === 'track' || kind === 'playlist') {
    return {
      store,
      url,
      status: 'reachable',
      detail: probe.detail || 'reachable',
      verified_at: nowIso,
      kind,
    }
  }

  return {
    store,
    url,
    status: 'reachable',
    detail: 'reachable_unclassified',
    verified_at: nowIso,
    kind,
  }
}

export function summarizeDspVerifyResults(results: DspVerifyResult[]): DspVerifySummary {
  const summary: DspVerifySummary = {
    live: 0,
    reachable: 0,
    artist_only: 0,
    b2b: 0,
    failed: 0,
    unverified: 0,
    total: results.length,
    results,
  }
  for (const row of results) {
    if (row.status === 'live') summary.live += 1
    else if (row.status === 'reachable') summary.reachable += 1
    else if (row.status === 'artist_only') summary.artist_only += 1
    else if (row.status === 'b2b') summary.b2b += 1
    else if (row.status === 'failed') summary.failed += 1
    else summary.unverified += 1
  }
  return summary
}

export function formatDspVerifySummary(summary: DspVerifySummary): string {
  return `${summary.live} live · ${summary.reachable} reachable · ${summary.artist_only} artist · ${summary.failed} failed · ${summary.b2b} B2B`
}

/** True when the link counts as release-live for ops / marketing. */
export function isReleaseLiveOnStore(status: DspVerificationStatus | null | undefined): boolean {
  return status === 'live' || status === 'reachable'
}

export function verificationLabel(status: DspVerificationStatus | null | undefined): string {
  switch (status) {
    case 'live':
      return 'Live'
    case 'reachable':
      return 'Reachable'
    case 'artist_only':
      return 'Artist only'
    case 'b2b':
      return 'B2B'
    case 'failed':
      return 'Failed'
    case 'unverified':
    default:
      return 'Unverified'
  }
}

export function defaultVerificationForNewLink(opts: {
  store: string
  url: string
  source?: string | null
  platform?: string | null
}): { verification_status: DspVerificationStatus; verification_detail: string | null } {
  if (opts.platform === 'b2b_hub' || (isDspStoreId(opts.store) && storeIsB2bSubmitted(opts.store))) {
    return { verification_status: 'b2b', verification_detail: 'b2b_submitted' }
  }
  if (opts.platform === 'search') {
    return { verification_status: 'unverified', verification_detail: 'search_fallback' }
  }
  if (opts.platform === 'sergik') {
    return { verification_status: 'unverified', verification_detail: 'sergik_hub' }
  }
  if (opts.source === 'artist' || classifyStoreUrl(opts.store, opts.url) === 'artist') {
    return { verification_status: 'artist_only', verification_detail: 'artist_profile' }
  }
  return { verification_status: 'unverified', verification_detail: null }
}

/** Keep DSP_STORES order for stable UI. */
export function orderVerifyResults(results: DspVerifyResult[]): DspVerifyResult[] {
  const byStore = new Map(results.map((r) => [r.store, r]))
  return DSP_STORES.map((s) => byStore.get(s.id)).filter((r): r is DspVerifyResult => Boolean(r))
}
