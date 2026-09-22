import artistData from '@/data/artist.json'
import { artistDspProfileLinks } from '@/lib/artist-platforms'
import { ALL_DSP_STORE_IDS, DSP_STORES, isDspStoreId, type DspStoreId } from '@/lib/studio/constants'
import {
  dspProviderCatalog,
  dspStoreUrlPatterns,
  getDspProvider,
  odesliPlatformOrder,
  odesliPlatformToStoreMap,
  storeIsB2bSubmitted,
} from '@/lib/studio/dsp-providers'

export type DspLinkSource =
  | 'spotify'
  | 'itunes'
  | 'deezer'
  | 'odesli'
  | 'youtube'
  | 'musicbrainz'
  | 'seed'
  | 'derived'
  | 'artist'

export type ResolvedDspLink = {
  store: DspStoreId
  url: string
  source: DspLinkSource
  platform?: string
}

export type DspLookupInput = {
  title?: string | null
  upc?: string | null
  isrcs?: Array<string | null | undefined>
  seedUrl?: string | null
  existingUrls?: Array<string | null | undefined>
}

export type DspConnectProviders = {
  odesli: boolean
  spotify: boolean
  apple: boolean
  deezer: boolean
  youtube: boolean
  musicbrainz: boolean
}

/** Per-store status across the full 33-target DSP matrix. */
export type DspCoverageKind = 'live' | 'linked' | 'artist' | 'b2b' | 'needs_paste' | 'failed'

export type DspCoverageRow = {
  id: DspStoreId
  name: string
  kind: DspCoverageKind
  url?: string
  source?: DspLinkSource
  verification_status?: string
}

export type DspCoverage = {
  total: number
  /** Proven live (verification live or reachable). */
  live: number
  /** Has a URL but not yet verified live. */
  linked: number
  artist: number
  b2b: number
  needs_paste: number
  failed: number
  /** live + linked + artist + b2b */
  accounted: number
  rows: DspCoverageRow[]
}

export type DspConnectResult = {
  links: ResolvedDspLink[]
  songLinkUrl?: string
  queried: {
    urls: string[]
    isrc?: string
    upc?: string
    title?: string
    spotifyUrl?: string
  }
  providers: DspConnectProviders
  notes: string[]
  catalog?: ReturnType<typeof dspProviderCatalog>
  coverage: DspCoverage
  /** Always the full studio DSP matrix (33). */
  targetStores: DspStoreId[]
}

export type DspPersistSummary = {
  added: string[]
  updated: string[]
  unchanged: string[]
}

const ARTIST_NAME = artistData.artist_name || 'SERGIK'
const ODESLI_ENDPOINT = 'https://api.song.link/v1-alpha.1/links'
const MUSICBRAINZ_ENDPOINT = 'https://musicbrainz.org/ws/2'
const SOURCE_RANK: Record<DspLinkSource, number> = {
  spotify: 0,
  itunes: 1,
  deezer: 1,
  odesli: 2,
  youtube: 2,
  musicbrainz: 3,
  derived: 4,
  seed: 5,
  artist: 6,
}

/** Prefer album/track release pages over artist/profile URLs when merging. */
function releasePageRank(store: string, url: string): number {
  const u = String(url || '')
  if (
    /\/(album|albums|release|releases|track|tracks|song|songs)(\/|$)/i.test(u) ||
    /open\.spotify\.com\/(album|track)\//i.test(u) ||
    /music\.apple\.com\/[^/]+\/(album|song)\//i.test(u) ||
    /deezer\.com\/(?:[a-z]{2}\/)?(album|track)\//i.test(u) ||
    /tidal\.com\/(?:browse\/)?(album|track)\//i.test(u) ||
    /shazam\.com\/album\//i.test(u) ||
    /amazon\.com\/.*\/(dp|gp\/product)\//i.test(u) ||
    /iheart\.com\/.*\/albums\/id-/i.test(u) ||
    /youtu\.be\/|youtube\.com\/watch|music\.youtube\.com\/watch/i.test(u)
  ) {
    return 0
  }
  if (
    /\/(artist|artists|channel|user|@)(\/|$)/i.test(u) ||
    /open\.spotify\.com\/artist\//i.test(u) ||
    /music\.apple\.com\/[^/]+\/artist\//i.test(u) ||
    /tidal\.com\/(?:browse\/)?artist\//i.test(u) ||
    /beatport\.com\/artist\//i.test(u) ||
    /youtube\.com\/@|music\.youtube\.com\/channel\//i.test(u) ||
    /soundcloud\.com\/[^/]+\/?$/i.test(u) ||
    /tiktok\.com\/@/i.test(u) ||
    /instagram\.com\/[^/]+\/?$/i.test(u) ||
    /pandora\.com\/artist\//i.test(u)
  ) {
    return 3
  }
  return 2
}

function isArtistProfileUrl(store: string, url: string): boolean {
  return releasePageRank(store, url) >= 3
}

const STORE_URL_PATTERNS = dspStoreUrlPatterns()
const ODESLI_PLATFORM_ORDER = odesliPlatformOrder()
const ODESLI_TO_STORE = odesliPlatformToStoreMap()

export function odesliApiKey(): string | undefined {
  return process.env.ODESLI_API_KEY || process.env.SONG_LINK_API_KEY || undefined
}

/** Odesli/song.link is public (rate-limited); key only raises limits. Set DSP_ODESLI=0 to disable. */
export function odesliEnabled(): boolean {
  return process.env.DSP_ODESLI !== '0'
}

export function dspConnectProviders(): DspConnectProviders {
  return {
    odesli: odesliEnabled(),
    spotify: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
    apple: true,
    deezer: true,
    youtube: Boolean(process.env.YOUTUBE_API_KEY),
    // MusicBrainz is public; disable with DSP_MUSICBRAINZ=0 if rate-limited
    musicbrainz: process.env.DSP_MUSICBRAINZ !== '0',
  }
}

/**
 * Classify every DSP_STORES id so Delivery / e2e can assert the full 33-target matrix.
 * `live` requires verification_status live|reachable — a bare URL is only `linked`.
 */
export function buildDspCoverage(
  links: Array<{
    store: string
    url?: string | null
    source?: string | null
    verification_status?: string | null
  }>
): DspCoverage {
  const byStore = new Map<
    string,
    { url?: string; source?: string; verification_status?: string }
  >()
  for (const link of links) {
    const store = String(link.store || '').trim()
    if (!store || byStore.has(store)) continue
    byStore.set(store, {
      url: link.url ? String(link.url) : undefined,
      source: link.source ? String(link.source) : undefined,
      verification_status: link.verification_status
        ? String(link.verification_status)
        : undefined,
    })
  }

  const rows: DspCoverageRow[] = DSP_STORES.map((store) => {
    const hit = byStore.get(store.id)
    if (hit?.url) {
      const source = (hit.source || undefined) as DspLinkSource | undefined
      const v = hit.verification_status || 'unverified'
      let kind: DspCoverageKind = 'linked'
      if (v === 'live' || v === 'reachable') kind = 'live'
      else if (v === 'artist_only' || source === 'artist') kind = 'artist'
      else if (v === 'b2b') kind = 'b2b'
      else if (v === 'failed') kind = 'failed'
      return {
        id: store.id,
        name: store.name,
        kind,
        url: hit.url,
        source,
        verification_status: v,
      }
    }
    if (storeIsB2bSubmitted(store.id)) {
      return {
        id: store.id,
        name: store.name,
        kind: 'b2b',
        url: getDspProvider(store.id).exampleUrl,
        verification_status: 'b2b',
      }
    }
    return { id: store.id, name: store.name, kind: 'needs_paste' }
  })

  const live = rows.filter((r) => r.kind === 'live').length
  const linked = rows.filter((r) => r.kind === 'linked').length
  const artist = rows.filter((r) => r.kind === 'artist').length
  const b2b = rows.filter((r) => r.kind === 'b2b').length
  const needs_paste = rows.filter((r) => r.kind === 'needs_paste').length
  const failed = rows.filter((r) => r.kind === 'failed').length
  return {
    total: rows.length,
    live,
    linked,
    artist,
    b2b,
    needs_paste,
    failed,
    accounted: live + linked + artist + b2b,
    rows,
  }
}

export function formatDspCoverageSummary(coverage: DspCoverage): string {
  return `${coverage.total} targets · ${coverage.live} live · ${coverage.linked} linked · ${coverage.artist} artist · ${coverage.b2b} B2B · ${coverage.needs_paste} need URL`
}

export function normalizeIsrc(raw: string | null | undefined): string | undefined {
  const value = String(raw || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
  return value.length === 12 ? value : undefined
}

export function normalizeUpc(raw: string | null | undefined): string | undefined {
  const value = String(raw || '').replace(/\D/g, '')
  return value.length >= 12 && value.length <= 14 ? value : undefined
}

export function isHttpUrl(value: string | null | undefined): value is string {
  return /^https?:\/\//i.test(String(value || '').trim())
}

export function normalizeReleaseTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, 'and')
    .replace(/\b(feat|ft|featuring)\b.*$/i, '')
    .replace(/\b(- )?(ep|single|album|remix|original mix)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function titlesMatch(a: string, b: string): boolean {
  const left = normalizeReleaseTitle(a)
  const right = normalizeReleaseTitle(b)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

export function artistMatches(name: string | null | undefined): boolean {
  const value = String(name || '').toLowerCase()
  return value.includes(ARTIST_NAME.toLowerCase()) || value.includes('sergik')
}

export function appleMusicIdFromUrl(url: string): string | undefined {
  const match = url.match(/music\.apple\.com\/[^?]+\/(?:id)?(\d{6,})/i)
  return match?.[1]
}

export function shazamUrlFromAppleMusic(url: string): string | undefined {
  const id = appleMusicIdFromUrl(url)
  return id ? `https://www.shazam.com/album/${id}` : undefined
}

/** Tidal album numeric id from common Tidal album URLs. */
export function tidalAlbumIdFromUrl(url: string): string | undefined {
  const match =
    url.match(/tidal\.com\/(?:browse\/)?album\/(\d+)/i) ||
    url.match(/listen\.tidal\.com\/album\/(\d+)/i)
  return match?.[1]
}

/**
 * DistroKid often publishes the same numeric album id on Tidal + iHeart.
 * Prefer artist-scoped URL when Follow has an iHeart artist profile.
 */
export function iheartUrlFromTidal(
  tidalUrl: string,
  iheartArtistUrl?: string | null
): string | undefined {
  const albumId = tidalAlbumIdFromUrl(tidalUrl)
  if (!albumId) return undefined
  const artistMatch = String(iheartArtistUrl || '').match(/iheart\.com\/artist\/(id-\d+)/i)
  if (artistMatch?.[1]) {
    return `https://www.iheart.com/artist/${artistMatch[1]}/albums/id-${albumId}`
  }
  return `https://www.iheart.com/album/${albumId}/`
}

/** Secondary derived links (Shazam ← Apple, iHeart ← Tidal). */
export function deriveSecondaryDspLinks(links: ResolvedDspLink[]): ResolvedDspLink[] {
  const out: ResolvedDspLink[] = []
  const byStore = new Map(links.map((l) => [l.store, l] as const))

  const apple = byStore.get('apple_music')
  const shazamExisting = byStore.get('shazam')
  if (
    apple &&
    (!shazamExisting ||
      shazamExisting.source === 'artist' ||
      isArtistProfileUrl('shazam', shazamExisting.url))
  ) {
    const shazam = shazamUrlFromAppleMusic(apple.url)
    if (shazam) {
      out.push({ store: 'shazam', url: shazam, source: 'derived', platform: 'shazam' })
    }
  }

  const tidal = byStore.get('tidal')
  const iheartExisting = byStore.get('iheart')
  if (
    tidal &&
    !isArtistProfileUrl('tidal', tidal.url) &&
    (!iheartExisting ||
      iheartExisting.source === 'artist' ||
      isArtistProfileUrl('iheart', iheartExisting.url) ||
      !/\/albums\/id-/i.test(iheartExisting.url))
  ) {
    const iheartArtist =
      iheartExisting && isArtistProfileUrl('iheart', iheartExisting.url)
        ? iheartExisting.url
        : artistDspProfileLinks().find((l) => l.store === 'iheart')?.url
    const iheart = iheartUrlFromTidal(tidal.url, iheartArtist)
    if (iheart) {
      out.push({ store: 'iheart', url: iheart, source: 'derived', platform: 'iheart' })
    }
  }

  return out
}

export function artistCatalogLinks(): ResolvedDspLink[] {
  return artistDspProfileLinks().map((link) => ({
    store: link.store,
    url: link.url,
    source: 'artist',
    platform: link.store,
  }))
}

/** Public search / discovery URL when no album deep-link exists yet. */
export function buildStoreSearchUrl(
  store: DspStoreId,
  artist: string,
  title: string
): string | null {
  const q = encodeURIComponent(`${artist} ${title}`.trim())
  switch (store) {
    case 'beatport':
      return `https://www.beatport.com/search?q=${q}`
    case 'traxsource':
      return `https://www.traxsource.com/search?term=${q}`
    case 'bandcamp':
      return `https://bandcamp.com/search?q=${q}`
    case 'mixcloud':
      return `https://www.mixcloud.com/search/?q=${q}`
    case 'qobuz':
      return `https://www.qobuz.com/us-en/search?q=${q}`
    case 'tidal':
      return `https://tidal.com/search?q=${q}`
    case 'pandora':
      return `https://www.pandora.com/search/${encodeURIComponent(`${artist} ${title}`.trim())}`
    case 'anghami':
      return `https://play.anghami.com/search/${q}`
    case 'boomplay':
      return `https://www.boomplay.com/search?q=${q}`
    case 'saavn':
      return `https://www.jiosaavn.com/search/${q}`
    case 'claro_musica':
      return `https://www.claromusica.com/search?q=${q}`
    case 'joox':
      return `https://www.joox.com/search?q=${q}`
    case 'audiomack':
      return `https://audiomack.com/search?q=${q}`
    case 'soundcloud':
      return `https://soundcloud.com/search?q=${q}`
    case 'youtube_music':
      return `https://music.youtube.com/search?q=${q}`
    case 'youtube':
      return `https://www.youtube.com/results?search_query=${q}`
    case 'tiktok':
      return `https://www.tiktok.com/search?q=${q}`
    case 'instagram':
      return `https://www.instagram.com/explore/search/keyword/?q=${q}`
    case 'netease':
      return `https://music.163.com/#/search/m/?s=${q}`
    case 'tencent':
      return `https://y.qq.com/n/ryqq/search?w=${q}`
    case 'flo':
      return `https://www.music-flo.com/search?keyword=${q}`
    case 'iheart':
      return `https://www.iheart.com/search/?q=${q}`
    case 'shazam':
      return `https://www.shazam.com/search/${q}`
    case 'amazon':
      return `https://music.amazon.com/search/${q}`
    case 'deezer':
      return `https://www.deezer.com/search/${q}`
    case 'spotify':
      return `https://open.spotify.com/search/${q}`
    case 'apple_music':
      return `https://music.apple.com/us/search?term=${q}`
    default:
      return null
  }
}

/**
 * Fill every studio DSP that still lacks a store link — artist profiles first,
 * then song.link / SERGIK hub for B2B, then store search, then SERGIK music page.
 * Does not invent fake album URLs.
 */
export function planFillMissingStoreLinks(input: {
  existingStores: Iterable<string>
  title: string
  artist?: string
  songLinkUrl?: string | null
  sergikMusicUrl: string
}): ResolvedDspLink[] {
  const have = new Set(
    [...input.existingStores].map((s) => String(s || '').trim()).filter(isDspStoreId)
  )
  const artistByStore = new Map(
    artistDspProfileLinks().map((link) => [link.store, link.url] as const)
  )
  const artist = (input.artist || ARTIST_NAME).trim() || ARTIST_NAME
  const title = input.title.trim() || 'release'
  const songLink = input.songLinkUrl && isHttpUrl(input.songLinkUrl) ? input.songLinkUrl : null
  const sergik = input.sergikMusicUrl.trim()
  const out: ResolvedDspLink[] = []

  for (const store of ALL_DSP_STORE_IDS) {
    if (have.has(store)) continue

    const artistUrl = artistByStore.get(store)
    if (artistUrl) {
      out.push({ store, url: artistUrl, source: 'artist', platform: store })
      continue
    }

    if (storeIsB2bSubmitted(store)) {
      out.push({
        store,
        url: songLink || sergik,
        source: 'seed',
        platform: 'b2b_hub',
      })
      continue
    }

    const search = buildStoreSearchUrl(store, artist, title)
    if (search) {
      out.push({ store, url: search, source: 'seed', platform: 'search' })
      continue
    }

    out.push({ store, url: songLink || sergik, source: 'seed', platform: 'sergik' })
  }

  return out
}

export function parseKnownStoreUrl(url: string): ResolvedDspLink | null {
  const trimmed = url.trim()
  if (!isHttpUrl(trimmed)) return null
  const match = STORE_URL_PATTERNS.find((item) => item.test.test(trimmed))
  if (!match) return null
  return { store: match.store, url: trimmed, source: 'seed', platform: match.store }
}

export function mapOdesliPlatform(platform: string): DspStoreId | null {
  return ODESLI_TO_STORE[platform] || null
}

export function pickLookupSeeds(input: DspLookupInput): {
  urls: string[]
  isrc?: string
  upc?: string
} {
  const urls = unique(
    [input.seedUrl, ...(input.existingUrls || [])]
      .map((value) => String(value || '').trim())
      .filter(isHttpUrl)
  )
  const isrc = (input.isrcs || []).map(normalizeIsrc).find(Boolean)
  const upc = normalizeUpc(input.upc)
  return { urls, isrc, upc }
}

export function parseOdesliLinks(payload: unknown): {
  links: ResolvedDspLink[]
  pageUrl?: string
} {
  if (!payload || typeof payload !== 'object') return { links: [] }
  const record = payload as {
    pageUrl?: unknown
    linksByPlatform?: Record<string, { url?: unknown } | undefined>
  }
  const byPlatform = record.linksByPlatform || {}
  const found = new Map<DspStoreId, ResolvedDspLink>()

  const visit = (platform: string) => {
    const mapped = mapOdesliPlatform(platform)
    const url = String(byPlatform[platform]?.url || '').trim()
    if (!isHttpUrl(url)) return
    const store = mapped || parseKnownStoreUrl(url)?.store || null
    if (!store || found.has(store)) return
    found.set(store, { store, url, source: 'odesli', platform })
  }

  for (const platform of ODESLI_PLATFORM_ORDER) visit(platform)
  for (const platform of Object.keys(byPlatform)) visit(platform)

  const pageUrl = isHttpUrl(String(record.pageUrl || '')) ? String(record.pageUrl) : undefined
  return { links: Array.from(found.values()), pageUrl }
}

export function mergeResolvedLinks(groups: ResolvedDspLink[][]): ResolvedDspLink[] {
  const found = new Map<DspStoreId, ResolvedDspLink>()
  for (const group of groups) {
    for (const link of group) {
      if (!isDspStoreId(link.store) || !isHttpUrl(link.url)) continue
      const current = found.get(link.store)
      if (!current) {
        found.set(link.store, link)
        continue
      }
      const shapeNew = releasePageRank(link.store, link.url)
      const shapeCur = releasePageRank(current.store, current.url)
      if (shapeNew < shapeCur) {
        found.set(link.store, link)
        continue
      }
      if (shapeNew > shapeCur) continue
      if (SOURCE_RANK[link.source] < SOURCE_RANK[current.source]) {
        found.set(link.store, link)
      }
    }
  }
  return DSP_STORES.map((store) => found.get(store.id)).filter(
    (link): link is ResolvedDspLink => Boolean(link)
  )
}

export function dspConnectHint(input: {
  isrc?: string
  upc?: string
  urls: string[]
}): string {
  if (input.isrc) return `Ready to connect from ISRC ${input.isrc}.`
  if (input.upc) return `Ready to connect from UPC ${input.upc}.`
  if (input.urls.length) return 'Ready to connect from an existing store URL.'
  return 'Add an ISRC, UPC, or paste a Spotify / Apple Music URL to connect stores.'
}

export async function connectReleaseToDsps(
  input: DspLookupInput,
  options?: { fetchImpl?: typeof fetch }
): Promise<DspConnectResult> {
  const fetchImpl = options?.fetchImpl || fetch
  const providers = dspConnectProviders()
  const seeds = pickLookupSeeds(input)
  const notes: string[] = []
  const groups: ResolvedDspLink[][] = []
  let songLinkUrl: string | undefined
  let spotifyUrl: string | undefined
  let queryTitle = String(input.title || '').trim()

  const parsedSeeds = seeds.urls
    .map((url) => {
      const parsed = parseKnownStoreUrl(url)
      if (!parsed) return null
      if (isArtistProfileUrl(parsed.store, parsed.url)) {
        return { ...parsed, source: 'artist' as const }
      }
      return parsed
    })
    .filter((link): link is ResolvedDspLink => Boolean(link))
  if (parsedSeeds.length) groups.push(parsedSeeds)
  spotifyUrl =
    parsedSeeds.find((link) => link.store === 'spotify' && !isArtistProfileUrl(link.store, link.url))
      ?.url || parsedSeeds.find((link) => link.store === 'spotify')?.url
  const seedApple = parsedSeeds.find(
    (link) => link.store === 'apple_music' && !isArtistProfileUrl(link.store, link.url)
  )
  if (seedApple) {
    const shazam = shazamUrlFromAppleMusic(seedApple.url)
    if (shazam) {
      groups.push([{ store: 'shazam', url: shazam, source: 'derived', platform: 'shazam' }])
    }
  }

  if (!seeds.urls.length && !seeds.isrc && !seeds.upc && !queryTitle) {
    notes.push(dspConnectHint(seeds))
    const coverage = buildDspCoverage([])
    return {
      links: [],
      queried: seeds,
      providers,
      notes,
      catalog: dspProviderCatalog(),
      coverage,
      targetStores: [...ALL_DSP_STORE_IDS],
    }
  }

  if (spotifyUrl) {
    const oembedTitle = await fetchSpotifyOEmbedTitle(spotifyUrl, fetchImpl)
    if (oembedTitle) queryTitle = oembedTitle
  }

  if (providers.spotify && (seeds.isrc || seeds.upc)) {
    const spotify = seeds.isrc
      ? await searchSpotifyByQuery(`isrc:${seeds.isrc}`, 'track', fetchImpl)
      : undefined
    const spotifyAlbum =
      !spotify && seeds.upc
        ? await searchSpotifyByQuery(`upc:${seeds.upc}`, 'album', fetchImpl)
        : undefined
    const found = spotify || spotifyAlbum
    if (found) {
      spotifyUrl = found
      groups.push([{ store: 'spotify', url: found, source: 'spotify', platform: 'spotify' }])
    } else {
      notes.push('Spotify catalog search returned no match for this ISRC/UPC.')
    }
  } else if ((seeds.isrc || seeds.upc) && !providers.spotify) {
    notes.push('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to match ISRCs/UPCs on Spotify.')
  }

  const apple = await searchAppleMusic({
    title: queryTitle,
    isrc: seeds.isrc,
    upc: seeds.upc,
    fetchImpl,
  })
  if (apple) {
    groups.push([apple])
    const shazam = shazamUrlFromAppleMusic(apple.url)
    if (shazam) {
      groups.push([
        { store: 'shazam', url: shazam, source: 'derived', platform: 'shazam' },
      ])
    }
  }

  const deezer = await searchDeezer({
    title: queryTitle,
    isrc: seeds.isrc,
    fetchImpl,
  })
  if (deezer) groups.push([deezer])

  if (providers.youtube && queryTitle) {
    const youtube = await searchYouTube(queryTitle, fetchImpl)
    if (youtube.length) groups.push(youtube)
  }

  if (providers.odesli) {
    const odesliUrls = unique(
      [spotifyUrl, ...seeds.urls]
        .filter(Boolean)
        .map((url) => String(url))
        .filter((url) => {
          const parsed = parseKnownStoreUrl(url)
          if (!parsed) return isHttpUrl(url)
          return !isArtistProfileUrl(parsed.store, parsed.url)
        }) as string[]
    )
    for (const url of odesliUrls.slice(0, 3)) {
      const parsed = await fetchOdesli({ url }, fetchImpl)
      if (parsed) {
        groups.push(parsed.links)
        songLinkUrl = songLinkUrl || parsed.pageUrl
      }
    }
  } else if (seeds.urls.length || spotifyUrl) {
    notes.push('Odesli fan-out disabled (DSP_ODESLI=0).')
  }

  if (providers.musicbrainz && (seeds.upc || seeds.isrc)) {
    const mb = await searchMusicBrainzUrls({
      upc: seeds.upc,
      isrc: seeds.isrc,
      fetchImpl,
    })
    if (mb.length) groups.push(mb)
  }

  groups.push(artistCatalogLinks())

  const merged = mergeResolvedLinks(groups)
  const links = mergeResolvedLinks([merged, deriveSecondaryDspLinks(merged)])
  const coverage = buildDspCoverage(links)
  if (!links.length) {
    notes.push(
      'No live DSP pages found yet. Stores usually appear after the distributor delivers — paste a URL once one is live.'
    )
  } else {
    notes.unshift(formatDspCoverageSummary(coverage))
    const needsPaste = coverage.rows.filter((r) => r.kind === 'needs_paste').map((r) => r.name)
    const b2bOnly = coverage.rows.filter((r) => r.kind === 'b2b').map((r) => r.name)
    if (needsPaste.length) {
      notes.push(`Still need a pasted URL for ${needsPaste.join(', ')}.`)
    }
    if (b2bOnly.length) {
      notes.push(
        `DistroKid-submitted / B2B (no public album deep-link expected): ${b2bOnly.join(', ')}.`
      )
    }
  }

  return {
    links,
    songLinkUrl,
    queried: { ...seeds, title: queryTitle || undefined, spotifyUrl },
    providers,
    notes,
    catalog: dspProviderCatalog(),
    coverage,
    targetStores: [...ALL_DSP_STORE_IDS],
  }
}

async function searchMusicBrainzUrls(input: {
  upc?: string
  isrc?: string
  fetchImpl: typeof fetch
}): Promise<ResolvedDspLink[]> {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'SERGIKStudio/1.0 ( https://sergikdropz.com ; sergikdrops@gmail.com )',
  }
  let mbid: string | undefined

  try {
    if (input.upc) {
      const search = await input.fetchImpl(
        `${MUSICBRAINZ_ENDPOINT}/release/?query=barcode:${encodeURIComponent(input.upc)}&fmt=json`,
        { headers, signal: AbortSignal.timeout(10000) }
      )
      if (search.ok) {
        const data = (await search.json()) as { releases?: Array<{ id?: string }> }
        mbid = data.releases?.[0]?.id
      }
    }
    if (!mbid && input.isrc) {
      const search = await input.fetchImpl(
        `${MUSICBRAINZ_ENDPOINT}/recording/?query=isrc:${encodeURIComponent(input.isrc)}&fmt=json`,
        { headers, signal: AbortSignal.timeout(10000) }
      )
      if (search.ok) {
        const data = (await search.json()) as {
          recordings?: Array<{ releases?: Array<{ id?: string }> }>
        }
        mbid = data.recordings?.[0]?.releases?.[0]?.id
      }
    }
    if (!mbid) return []

    const detail = await input.fetchImpl(
      `${MUSICBRAINZ_ENDPOINT}/release/${encodeURIComponent(mbid)}?inc=url-rels&fmt=json`,
      { headers, signal: AbortSignal.timeout(10000) }
    )
    if (!detail.ok) return []
    const body = (await detail.json()) as {
      relations?: Array<{ url?: { resource?: string } }>
    }
    const links: ResolvedDspLink[] = []
    for (const rel of body.relations || []) {
      const resource = String(rel.url?.resource || '').trim()
      if (!isHttpUrl(resource)) continue
      const parsed = parseKnownStoreUrl(resource)
      if (parsed) {
        links.push({ ...parsed, source: 'musicbrainz', platform: parsed.store })
      }
    }
    return links
  } catch {
    return []
  }
}

async function fetchSpotifyOEmbedTitle(
  url: string,
  fetchImpl: typeof fetch
): Promise<string | undefined> {
  try {
    const response = await fetchImpl(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!response.ok) return undefined
    const data = (await response.json()) as { title?: string }
    const title = String(data.title || '').trim()
    return title || undefined
  } catch {
    return undefined
  }
}

async function searchAppleMusic(input: {
  title?: string
  isrc?: string
  upc?: string
  fetchImpl: typeof fetch
}): Promise<ResolvedDspLink | null> {
  if (input.isrc) {
    const byIsrc = await fetchItunesJson(
      `https://itunes.apple.com/lookup?isrc=${encodeURIComponent(input.isrc)}&country=US`,
      input.fetchImpl
    )
    const song = pickItunesResult(byIsrc, input.title, 'trackViewUrl')
    if (song) return { store: 'apple_music', url: cleanItunesUrl(song), source: 'itunes', platform: 'appleMusic' }
  }
  if (input.upc) {
    const byUpc = await fetchItunesJson(
      `https://itunes.apple.com/lookup?upc=${encodeURIComponent(input.upc)}&country=US`,
      input.fetchImpl
    )
    const album = pickItunesResult(byUpc, input.title, 'collectionViewUrl')
    if (album) return { store: 'apple_music', url: cleanItunesUrl(album), source: 'itunes', platform: 'appleMusic' }
  }
  if (input.title) {
    const searched = await fetchItunesJson(
      `https://itunes.apple.com/search?term=${encodeURIComponent(`${ARTIST_NAME} ${input.title}`)}&entity=album,song&limit=8&country=US`,
      input.fetchImpl
    )
    const album = pickItunesResult(searched, input.title, 'collectionViewUrl')
    const song = pickItunesResult(searched, input.title, 'trackViewUrl')
    const url = album || song
    if (url) return { store: 'apple_music', url: cleanItunesUrl(url), source: 'itunes', platform: 'appleMusic' }
  }
  return null
}

async function searchDeezer(input: {
  title?: string
  isrc?: string
  fetchImpl: typeof fetch
}): Promise<ResolvedDspLink | null> {
  if (input.isrc) {
    const data = await fetchJson(
      `https://api.deezer.com/track/isrc:${encodeURIComponent(input.isrc)}`,
      input.fetchImpl
    )
    const url = String((data as { link?: string })?.link || '')
    const artist = (data as { artist?: { name?: string } })?.artist?.name
    if (isHttpUrl(url) && artistMatches(artist)) {
      return { store: 'deezer', url, source: 'deezer', platform: 'deezer' }
    }
  }
  if (input.title) {
    const data = await fetchJson(
      `https://api.deezer.com/search/album?q=${encodeURIComponent(`artist:"${ARTIST_NAME}" album:"${input.title}"`)}`,
      input.fetchImpl
    )
    const items = ((data as { data?: Array<{ title?: string; artist?: { name?: string }; link?: string }> })
      ?.data || [])
    const match = items.find(
      (item) => artistMatches(item.artist?.name) && titlesMatch(item.title || '', input.title || '')
    )
    if (match && isHttpUrl(match.link)) {
      return { store: 'deezer', url: match.link, source: 'deezer', platform: 'deezer' }
    }
  }
  return null
}

async function searchYouTube(
  title: string,
  fetchImpl: typeof fetch
): Promise<ResolvedDspLink[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return []
  const data = await fetchJson(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(`${ARTIST_NAME} ${title}`)}&key=${encodeURIComponent(key)}`,
    fetchImpl
  )
  const items = ((data as {
    items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }>
  })?.items || [])
  const match = items.find((item) => {
    const videoTitle = item.snippet?.title || ''
    const channel = item.snippet?.channelTitle || ''
    return Boolean(item.id?.videoId) && titlesMatch(videoTitle, title) && artistMatches(`${videoTitle} ${channel}`)
  })
  const videoId = match?.id?.videoId
  if (!videoId) return []
  return [
    {
      store: 'youtube',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      source: 'youtube',
      platform: 'youtube',
    },
    {
      store: 'youtube_music',
      url: `https://music.youtube.com/watch?v=${videoId}`,
      source: 'youtube',
      platform: 'youtubeMusic',
    },
  ]
}

async function searchSpotifyByQuery(
  query: string,
  type: 'track' | 'album',
  fetchImpl: typeof fetch
): Promise<string | undefined> {
  const token = await getSpotifyAccessToken(fetchImpl)
  if (!token) return undefined
  const response = await fetchImpl(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    }
  )
  if (!response.ok) return undefined
  const data = (await response.json()) as {
    tracks?: { items?: Array<{ external_urls?: { spotify?: string } }> }
    albums?: { items?: Array<{ external_urls?: { spotify?: string } }> }
  }
  const url =
    type === 'track'
      ? data.tracks?.items?.[0]?.external_urls?.spotify
      : data.albums?.items?.[0]?.external_urls?.spotify
  return isHttpUrl(url) ? url : undefined
}

async function getSpotifyAccessToken(fetchImpl: typeof fetch): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
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
}

async function fetchOdesli(
  query: { url: string } | { id: string; platform: string; type: 'song' | 'album' },
  fetchImpl: typeof fetch
): Promise<{ links: ResolvedDspLink[]; pageUrl?: string } | null> {
  if (!odesliEnabled()) return null
  const key = odesliApiKey()
  const params = new URLSearchParams({
    userCountry: process.env.DSP_USER_COUNTRY || 'US',
    songIfSingle: 'true',
  })
  if (key) params.set('key', key)
  if ('url' in query) {
    params.set('url', query.url)
  } else {
    params.set('id', query.id)
    params.set('platform', query.platform)
    params.set('type', query.type)
  }

  try {
    const response = await fetchImpl(`${ODESLI_ENDPOINT}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return null
    return parseOdesliLinks(await response.json())
  } catch {
    return null
  }
}

async function fetchItunesJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  return fetchJson(url, fetchImpl)
}

function pickItunesResult(
  payload: unknown,
  title: string | undefined,
  field: 'trackViewUrl' | 'collectionViewUrl'
): string | undefined {
  const results = ((payload as { results?: Array<Record<string, unknown>> })?.results || []).filter(
    (item) => artistMatches(String(item.artistName || ''))
  )
  const ranked = title
    ? results.filter((item) =>
        titlesMatch(String(item.trackName || item.collectionName || ''), title)
      )
    : results
  const url = String((ranked[0] || results[0])?.[field] || '')
  return isHttpUrl(url) ? url : undefined
}

function cleanItunesUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete('uo')
    return parsed.toString()
  } catch {
    return url
  }
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}
