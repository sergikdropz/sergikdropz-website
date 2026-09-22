/**
 * Canonical DSP provider registry — every studio store has a parse rule + resolve mode.
 * Connect uses this for URL detection, Odesli fan-out, and “what still needs a paste” notes.
 */

import { ALL_DSP_STORE_IDS, DSP_STORES, type DspStoreId } from '@/lib/studio/constants'

/** How a store can get a live URL into distribution_store_links. */
export type DspResolveMode =
  | 'search' // dedicated catalog API (Spotify / Apple / Deezer / YouTube)
  | 'odesli' // song.link / album.link cross-platform
  | 'derived' // computed from another store (e.g. Shazam ← Apple)
  | 'artist' // artist.json / Follow profile fallback
  | 'paste' // operator pastes a release or artist URL
  | 'submitted' // DistroKid submitted; often no public album deep-link (B2B / regional)

export type DspProviderImpl = {
  id: DspStoreId
  name: string
  /** Match pasted / DistroKid / Odesli URLs onto this store. */
  urlPattern: RegExp
  /** Odesli `linksByPlatform` keys that map here (first wins in order). */
  odesliPlatforms: string[]
  modes: DspResolveMode[]
  /** Example URL for docs / e2e fixtures. */
  exampleUrl: string
}

/**
 * One implementation row per DSP_STORES id — keep in sync with constants.ts.
 * Modes are additive: search stores still benefit from Odesli + paste.
 */
export const DSP_PROVIDER_IMPLS: DspProviderImpl[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    urlPattern: /open\.spotify\.com\/(album|track|playlist)\//i,
    odesliPlatforms: ['spotify'],
    modes: ['search', 'odesli', 'paste', 'artist'],
    exampleUrl: 'https://open.spotify.com/album/2NkWmlDlwoFYpM2foerkHH',
  },
  {
    id: 'apple_music',
    name: 'Apple Music',
    urlPattern: /music\.apple\.com\//i,
    odesliPlatforms: ['appleMusic', 'itunes'],
    modes: ['search', 'odesli', 'paste', 'artist'],
    exampleUrl: 'https://music.apple.com/us/album/ftp-ep/1757184282',
  },
  {
    id: 'youtube_music',
    name: 'YouTube Music',
    urlPattern: /music\.youtube\.com\//i,
    odesliPlatforms: ['youtubeMusic'],
    modes: ['search', 'odesli', 'paste', 'artist'],
    exampleUrl: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    urlPattern: /(youtube\.com\/watch|youtu\.be\/)/i,
    odesliPlatforms: ['youtube'],
    modes: ['search', 'odesli', 'paste', 'artist'],
    exampleUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    id: 'shazam',
    name: 'Shazam',
    urlPattern: /shazam\.com\//i,
    odesliPlatforms: [],
    modes: ['derived', 'paste', 'artist'],
    exampleUrl: 'https://www.shazam.com/album/1757184282',
  },
  {
    id: 'beatport',
    name: 'Beatport',
    urlPattern: /beatport\.com\//i,
    odesliPlatforms: [],
    modes: ['paste', 'artist'],
    exampleUrl: 'https://www.beatport.com/artist/sergik/1002796',
  },
  {
    id: 'traxsource',
    name: 'Traxsource',
    urlPattern: /traxsource\.com\//i,
    odesliPlatforms: [],
    modes: ['paste'],
    exampleUrl: 'https://www.traxsource.com/artist/sergik/1',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    urlPattern: /soundcloud\.com\//i,
    odesliPlatforms: ['soundcloud'],
    modes: ['odesli', 'paste', 'artist'],
    exampleUrl: 'https://soundcloud.com/sergikdropz',
  },
  {
    id: 'mixcloud',
    name: 'Mixcloud',
    urlPattern: /mixcloud\.com\//i,
    odesliPlatforms: [],
    modes: ['paste'],
    exampleUrl: 'https://www.mixcloud.com/sergikdropz',
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    urlPattern: /\.bandcamp\.com\//i,
    odesliPlatforms: [],
    modes: ['paste'],
    exampleUrl: 'https://sergik.bandcamp.com/',
  },
  {
    id: 'amazon',
    name: 'Amazon Music',
    urlPattern: /(music\.amazon\.|amazon\.[^/]+\/(music|albums|gp\/product|dp\/))/i,
    odesliPlatforms: ['amazonMusic', 'amazonStore'],
    modes: ['odesli', 'paste', 'artist'],
    exampleUrl: 'https://www.amazon.com/gp/product/B0D9BGZDWK/',
  },
  {
    id: 'tidal',
    name: 'Tidal',
    urlPattern: /tidal\.com\//i,
    odesliPlatforms: ['tidal'],
    modes: ['odesli', 'paste', 'artist'],
    exampleUrl: 'https://tidal.com/album/123456789',
  },
  {
    id: 'deezer',
    name: 'Deezer',
    urlPattern: /deezer\.com\//i,
    odesliPlatforms: ['deezer'],
    modes: ['search', 'odesli', 'paste', 'artist'],
    exampleUrl: 'https://www.deezer.com/album/615102062',
  },
  {
    id: 'pandora',
    name: 'Pandora',
    urlPattern: /pandora\.com\//i,
    odesliPlatforms: ['pandora'],
    modes: ['odesli', 'paste', 'artist'],
    exampleUrl: 'https://www.pandora.com/artist/sergik/ARz95KfVdbj3P5Z',
  },
  {
    id: 'iheart',
    name: 'iHeartRadio',
    urlPattern: /iheart\.com\//i,
    odesliPlatforms: [],
    modes: ['derived', 'paste', 'submitted', 'artist'],
    exampleUrl: 'https://www.iheart.com/artist/id-36587473/albums/id-278836343',
  },
  {
    id: 'tiktok',
    name: 'TikTok / Commercial',
    urlPattern: /tiktok\.com\//i,
    odesliPlatforms: [],
    modes: ['paste', 'artist', 'submitted'],
    exampleUrl: 'https://www.tiktok.com/@sergikdropz',
  },
  {
    id: 'instagram',
    name: 'Instagram / Meta',
    urlPattern: /instagram\.com\//i,
    odesliPlatforms: [],
    modes: ['paste', 'artist', 'submitted'],
    exampleUrl: 'https://www.instagram.com/sergikdropz',
  },
  {
    id: 'claro_musica',
    name: 'Claro Música',
    urlPattern: /(claromusica|claro\.com\.|imusica)/i,
    odesliPlatforms: [],
    modes: ['paste', 'submitted'],
    exampleUrl: 'https://www.claromusica.com/',
  },
  {
    id: 'saavn',
    name: 'JioSaavn',
    urlPattern: /(jiosaavn|saavn)\.com\//i,
    odesliPlatforms: [],
    modes: ['paste', 'submitted'],
    exampleUrl: 'https://www.jiosaavn.com/album/ftp/xyz',
  },
  {
    id: 'boomplay',
    name: 'Boomplay',
    urlPattern: /boomplay\.com\//i,
    odesliPlatforms: ['boomplay'],
    modes: ['odesli', 'paste', 'submitted'],
    exampleUrl: 'https://www.boomplay.com/albums/123',
  },
  {
    id: 'anghami',
    name: 'Anghami',
    urlPattern: /anghami\.com\//i,
    odesliPlatforms: ['anghami'],
    modes: ['odesli', 'paste', 'submitted'],
    exampleUrl: 'https://play.anghami.com/album/123',
  },
  {
    id: 'netease',
    name: 'NetEase Cloud Music',
    urlPattern: /(music\.163\.com|y\.music\.163\.com|netease)/i,
    odesliPlatforms: [],
    modes: ['paste', 'submitted'],
    exampleUrl: 'https://music.163.com/#/album?id=123',
  },
  {
    id: 'tencent',
    name: 'Tencent Music',
    urlPattern: /(y\.qq\.com|tencentmusic|kugou\.com|kuwo\.cn)/i,
    odesliPlatforms: [],
    modes: ['paste', 'submitted'],
    exampleUrl: 'https://y.qq.com/n/ryqq/albumDetail/001',
  },
  {
    id: 'qobuz',
    name: 'Qobuz',
    urlPattern: /qobuz\.com\//i,
    odesliPlatforms: [],
    modes: ['paste', 'submitted'],
    exampleUrl: 'https://open.qobuz.com/album/xyz',
  },
  {
    id: 'joox',
    name: 'Joox',
    urlPattern: /joox\.com\//i,
    odesliPlatforms: [],
    modes: ['paste', 'submitted'],
    exampleUrl: 'https://www.joox.com/album/123',
  },
  {
    id: 'kuack_media',
    name: 'Kuack Media',
    urlPattern: /kuack(media)?\./i,
    odesliPlatforms: [],
    modes: ['submitted'],
    exampleUrl: 'https://www.kuackmedia.com/',
  },
  {
    id: 'adaptr',
    name: 'Adaptr',
    urlPattern: /(adaptr\.|feed\.fm)/i,
    odesliPlatforms: [],
    modes: ['submitted'],
    exampleUrl: 'https://www.adaptr.com/',
  },
  {
    id: 'flo',
    name: 'Flo',
    urlPattern: /(music-flo\.com|flo\.music|\.flo\.)/i,
    odesliPlatforms: [],
    modes: ['paste', 'submitted'],
    exampleUrl: 'https://www.music-flo.com/',
  },
  {
    id: 'medianet',
    name: 'MediaNet',
    urlPattern: /mndigital\.|medianet/i,
    odesliPlatforms: [],
    modes: ['submitted'],
    exampleUrl: 'https://www.mndigital.com/',
  },
  {
    id: 'audiomack',
    name: 'Audiomack',
    urlPattern: /audiomack\.com\//i,
    odesliPlatforms: ['audiomack'],
    modes: ['odesli', 'paste', 'submitted'],
    exampleUrl: 'https://audiomack.com/album/sergik/ftp',
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    urlPattern: /(snapchat\.com|snap\.com)\//i,
    odesliPlatforms: [],
    modes: ['paste', 'submitted'],
    exampleUrl: 'https://www.snapchat.com/add/sergikdropz',
  },
  {
    id: 'massivemusic',
    name: 'MassiveMusic',
    urlPattern: /massivemusic\./i,
    odesliPlatforms: [],
    modes: ['submitted'],
    exampleUrl: 'https://www.massivemusic.com/',
  },
  {
    id: 'roblox',
    name: 'Roblox',
    urlPattern: /roblox\.com\//i,
    odesliPlatforms: [],
    modes: ['submitted'],
    exampleUrl: 'https://www.roblox.com/',
  },
]

const BY_ID = new Map(DSP_PROVIDER_IMPLS.map((row) => [row.id, row]))

export function getDspProvider(id: DspStoreId): DspProviderImpl {
  const row = BY_ID.get(id)
  if (!row) {
    throw new Error(`Missing DSP provider implementation for ${id}`)
  }
  return row
}

/** Store URL patterns in DSP_STORES order (used by parseKnownStoreUrl). */
export function dspStoreUrlPatterns(): Array<{ store: DspStoreId; test: RegExp }> {
  return DSP_PROVIDER_IMPLS.map((row) => ({ store: row.id, test: row.urlPattern }))
}

/** Flatten Odesli platform → studio store (first registration wins). */
export function odesliPlatformToStoreMap(): Record<string, DspStoreId> {
  const out: Record<string, DspStoreId> = {}
  for (const row of DSP_PROVIDER_IMPLS) {
    for (const platform of row.odesliPlatforms) {
      if (!out[platform]) out[platform] = row.id
    }
  }
  return out
}

export function odesliPlatformOrder(): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const row of DSP_PROVIDER_IMPLS) {
    for (const platform of row.odesliPlatforms) {
      if (seen.has(platform)) continue
      seen.add(platform)
      ordered.push(platform)
    }
  }
  return ordered
}

export function assertDspProvidersComplete(): {
  ok: boolean
  missingImpl: DspStoreId[]
  orphanImpl: string[]
} {
  const implIds = new Set(DSP_PROVIDER_IMPLS.map((r) => r.id))
  const missingImpl = ALL_DSP_STORE_IDS.filter((id) => !implIds.has(id))
  const orphanImpl = DSP_PROVIDER_IMPLS.map((r) => r.id).filter((id) => !ALL_DSP_STORE_IDS.includes(id))
  return { ok: missingImpl.length === 0 && orphanImpl.length === 0, missingImpl, orphanImpl }
}

/** Public summary for GET /dsp-connect and e2e assertions. */
export function dspProviderCatalog(): Array<{
  id: DspStoreId
  name: string
  modes: DspResolveMode[]
  odesliPlatforms: string[]
  hasUrlPattern: boolean
  exampleUrl: string
}> {
  return DSP_STORES.map((store) => {
    const impl = getDspProvider(store.id)
    return {
      id: store.id,
      name: store.name,
      modes: impl.modes,
      odesliPlatforms: impl.odesliPlatforms,
      hasUrlPattern: Boolean(impl.urlPattern),
      exampleUrl: impl.exampleUrl,
    }
  })
}

export function storeNeedsPasteNote(id: DspStoreId): boolean {
  const modes = getDspProvider(id).modes
  // B2B-only submitted stores shouldn't nag “paste a URL” on every connect.
  if (modes.length === 1 && modes[0] === 'submitted') return false
  return modes.includes('paste') || modes.includes('submitted')
}

export function storeIsB2bSubmitted(id: DspStoreId): boolean {
  const modes = getDspProvider(id).modes
  if (!modes.includes('submitted')) return false
  // Pure DistroKid B2B feeds — no public album/artist deep-link expected.
  return !modes.some(
    (m) => m === 'search' || m === 'odesli' || m === 'paste' || m === 'derived' || m === 'artist'
  )
}
