import artistData from '@/data/artist.json'

export type PublicStoreLink = {
  store: string
  url: string
  label: string
}

const STORE_PLATFORMS: Record<string, { label: string; key: 'spotify' | 'soundcloud' | 'other' }> = {
  spotify: { label: 'Spotify', key: 'spotify' },
  apple_music: { label: 'Apple Music', key: 'other' },
  apple: { label: 'Apple Music', key: 'other' },
  soundcloud: { label: 'SoundCloud', key: 'soundcloud' },
  youtube_music: { label: 'YouTube Music', key: 'other' },
  youtube: { label: 'YouTube', key: 'other' },
  shazam: { label: 'Shazam', key: 'other' },
  amazon: { label: 'Amazon Music', key: 'other' },
  amazon_music: { label: 'Amazon Music', key: 'other' },
  tidal: { label: 'TIDAL', key: 'other' },
  beatport: { label: 'Beatport', key: 'other' },
  traxsource: { label: 'Traxsource', key: 'other' },
  deezer: { label: 'Deezer', key: 'other' },
  pandora: { label: 'Pandora', key: 'other' },
  iheart: { label: 'iHeartRadio', key: 'other' },
  bandcamp: { label: 'Bandcamp', key: 'other' },
  mixcloud: { label: 'Mixcloud', key: 'other' },
  tiktok: { label: 'TikTok', key: 'other' },
  instagram: { label: 'Instagram', key: 'other' },
  claro_musica: { label: 'Claro Música', key: 'other' },
  saavn: { label: 'JioSaavn', key: 'other' },
  boomplay: { label: 'Boomplay', key: 'other' },
  anghami: { label: 'Anghami', key: 'other' },
  netease: { label: 'NetEase Cloud Music', key: 'other' },
  tencent: { label: 'Tencent Music', key: 'other' },
  qobuz: { label: 'Qobuz', key: 'other' },
  joox: { label: 'Joox', key: 'other' },
  kuack_media: { label: 'Kuack Media', key: 'other' },
  adaptr: { label: 'Adaptr', key: 'other' },
  flo: { label: 'Flo', key: 'other' },
  medianet: { label: 'MediaNet', key: 'other' },
  audiomack: { label: 'Audiomack', key: 'other' },
  snapchat: { label: 'Snapchat', key: 'other' },
  massivemusic: { label: 'MassiveMusic', key: 'other' },
  roblox: { label: 'Roblox', key: 'other' },
}

export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://sergikdropz.com').replace(/\/$/, '')
}

export function absoluteUrl(pathOrUrl: string | null | undefined, siteUrl = siteBaseUrl()): string | undefined {
  const raw = (pathOrUrl || '').trim()
  if (!raw) return undefined
  if (/^https?:\/\//i.test(raw)) return raw
  return `${siteUrl}${raw.startsWith('/') ? raw : `/${raw}`}`
}

export function isoDuration(seconds: number | null | undefined): string | undefined {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return undefined
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `PT${h}H${m}M${s}S`
  return `PT${m}M${s}S`
}

export function storeLinkToPlatform(store: string): { label: string; key: 'spotify' | 'soundcloud' | 'other' } {
  const id = store.toLowerCase().replace(/[\s-]+/g, '_')
  return STORE_PLATFORMS[id] || { label: store, key: 'other' }
}

export function seoDescriptionFromCopy(input: {
  title: string
  type?: string | null
  genre?: string | null
  description?: string | null
  elevator?: string | null
}): string {
  const elevator = (input.elevator || '').trim()
  if (elevator) return elevator.slice(0, 160)
  const desc = (input.description || '').trim()
  if (desc) {
    const sentence = desc.split(/(?<=[.!?])\s+/)[0] || desc
    return sentence.slice(0, 160)
  }
  const genre = (input.genre || 'electronic').trim()
  const type = (input.type || 'release').trim()
  return `${input.title} — ${type} by SERGIK. ${genre} for warehouses, after-hours, and late-night listening.`
    .slice(0, 160)
}

export function albumReleaseType(type: string | null | undefined): string {
  const t = String(type || '').toLowerCase()
  if (t === 'ep') return 'EPRelease'
  if (t === 'single') return 'SingleRelease'
  return 'AlbumRelease'
}

export function musicAlbumJsonLd(input: {
  siteUrl: string
  id: string
  title: string
  type?: string | null
  description?: string | null
  genre?: string | null
  subgenre?: string | null
  releaseDate?: string | null
  image?: string | null
  upc?: string | null
  tracks?: Array<{ title: string; duration?: number | null; isrc?: string | null }>
  storeLinks?: PublicStoreLink[]
}) {
  const url = `${input.siteUrl}/music/${encodeURIComponent(input.id)}`
  const genre = [input.genre, input.subgenre].filter(Boolean)
  const tracks = input.tracks || []
  const sameAs = (input.storeLinks || []).map((l) => l.url).filter(Boolean)

  return {
    '@context': 'https://schema.org',
    '@type': 'MusicAlbum',
    name: input.title,
    url,
    albumProductionType: 'StudioAlbum',
    albumReleaseType: albumReleaseType(input.type),
    byArtist: {
      '@type': 'MusicGroup',
      name: artistData.artist_name,
      url: input.siteUrl,
    },
    ...(input.releaseDate ? { datePublished: input.releaseDate } : {}),
    ...(genre.length ? { genre } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(tracks.length ? { numTracks: tracks.length } : {}),
    ...(input.image ? { image: absoluteUrl(input.image, input.siteUrl) } : {}),
    ...(input.upc
      ? { identifier: { '@type': 'PropertyValue', propertyID: 'UPC', value: input.upc } }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(tracks.length
      ? {
          track: tracks.map((track, index) => ({
            '@type': 'MusicRecording',
            name: track.title,
            position: index + 1,
            byArtist: {
              '@type': 'MusicGroup',
              name: artistData.artist_name,
            },
            url,
            ...(isoDuration(track.duration) ? { duration: isoDuration(track.duration) } : {}),
            ...(track.isrc ? { isrcCode: track.isrc } : {}),
            ...(input.genre ? { genre: input.genre } : {}),
          })),
        }
      : {}),
  }
}

export function musicIndexJsonLd(input: {
  siteUrl: string
  description: string
  releases: Array<{ id: string; title: string }>
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'SERGIK Music',
    url: `${input.siteUrl}/music`,
    description: input.description,
    isPartOf: {
      '@type': 'WebSite',
      name: 'SERGIK',
      url: input.siteUrl,
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: input.releases.map((release, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${input.siteUrl}/music/${encodeURIComponent(release.id)}`,
        name: release.title,
      })),
    },
  }
}

export function breadcrumbJsonLd(siteUrl: string, title: string, slug: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Music', item: `${siteUrl}/music` },
      {
        '@type': 'ListItem',
        position: 3,
        name: title,
        item: `${siteUrl}/music/${encodeURIComponent(slug)}`,
      },
    ],
  }
}
