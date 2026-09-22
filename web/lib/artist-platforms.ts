import artistData from '@/data/artist.json'
import { type DspStoreId } from '@/lib/studio/constants'
import {
  parseAppleMusicArtistId,
  parseFacebookPage,
  parseInstagramHandle,
  parseSpotifyArtistId,
  parseYoutubeChannelId,
} from '@/lib/studio/dsp-package'

/** Follow-page / artist.json keys that map onto Release Studio DSP stores. */
const PLATFORM_TO_STORE: Record<string, DspStoreId> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  amazon_music: 'amazon',
  tidal: 'tidal',
  deezer: 'deezer',
  pandora: 'pandora',
  beatport: 'beatport',
  traxsource: 'traxsource',
  youtube_music: 'youtube_music',
  youtube: 'youtube',
  shazam: 'shazam',
  soundcloud: 'soundcloud',
  mixcloud: 'mixcloud',
  bandcamp: 'bandcamp',
  instagram: 'instagram',
  tiktok: 'tiktok',
  iheart: 'iheart',
}

export function artistPlatforms(): Record<string, string> {
  const raw = (artistData.platforms || {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const url = String(value || '').trim()
    if (url) out[key] = url
  }
  return out
}

export function artistPlatformUrl(key: string): string | undefined {
  const url = artistPlatforms()[key]
  return url && /^https?:\/\//i.test(url) ? url : undefined
}

export function artistDspProfileLinks(): Array<{ store: DspStoreId; url: string }> {
  const platforms = artistPlatforms()
  const seen = new Set<DspStoreId>()
  const links: Array<{ store: DspStoreId; url: string }> = []
  for (const [key, store] of Object.entries(PLATFORM_TO_STORE)) {
    const url = platforms[key]
    if (!url || !/^https?:\/\//i.test(url) || seen.has(store)) continue
    seen.add(store)
    links.push({ store, url })
  }
  return links
}

export function artistDspProfileUrl(store: DspStoreId): string | undefined {
  return artistDspProfileLinks().find((link) => link.store === store)?.url
}

export type ArtistMatchField =
  | 'spotify_artist_id'
  | 'apple_artist_id'
  | 'youtube_artist_id'
  | 'instagram_handle'
  | 'facebook_page_id'

export type ArtistMatchCard = {
  id: string
  label: string
  question: string
  url: string
  value: string
  field: ArtistMatchField
}

/** DistroKid-style “already on this store?” cards from artist.json. */
export function artistAlreadyOnStoreCards(): ArtistMatchCard[] {
  const rows: Array<{
    id: string
    label: string
    question: string
    field: ArtistMatchField
    keys: string[]
    parse: (value: string) => string | null
  }> = [
    {
      id: 'spotify',
      label: 'Spotify',
      question: 'Already on Spotify?',
      field: 'spotify_artist_id',
      keys: ['spotify'],
      parse: parseSpotifyArtistId,
    },
    {
      id: 'apple',
      label: 'Apple Music',
      question: 'Already on Apple Music / iTunes?',
      field: 'apple_artist_id',
      keys: ['apple_music'],
      parse: parseAppleMusicArtistId,
    },
    {
      id: 'youtube',
      label: 'YouTube',
      question: 'Already on YouTube?',
      field: 'youtube_artist_id',
      keys: ['youtube_music', 'youtube'],
      parse: parseYoutubeChannelId,
    },
    {
      id: 'instagram',
      label: 'Instagram',
      question: 'Already on Instagram?',
      field: 'instagram_handle',
      keys: ['instagram'],
      parse: parseInstagramHandle,
    },
    {
      id: 'facebook',
      label: 'Facebook',
      question: 'Already on Facebook?',
      field: 'facebook_page_id',
      keys: ['facebook'],
      parse: parseFacebookPage,
    },
  ]

  const cards: ArtistMatchCard[] = []
  for (const row of rows) {
    let url = ''
    let value = ''
    for (const key of row.keys) {
      const candidate = artistPlatformUrl(key)
      if (!candidate) continue
      const parsed = row.parse(candidate)
      if (!parsed) continue
      url = candidate
      value = parsed
      break
    }
    if (!url || !value) continue
    cards.push({
      id: row.id,
      label: row.label,
      question: row.question,
      url,
      value,
      field: row.field,
    })
  }
  return cards
}
