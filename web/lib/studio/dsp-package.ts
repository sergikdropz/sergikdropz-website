import { DEFAULT_LABEL_NAME } from '@/lib/studio/constants'

export const TRACK_LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'it', label: 'Italian' },
  { id: 'ja', label: 'Japanese' },
  { id: 'zxx', label: 'No linguistic content' },
] as const

export type TrackLanguageId = (typeof TRACK_LANGUAGES)[number]['id']

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function parseSpotifyArtistId(value: string | null | undefined): string | null {
  const text = clean(value)
  if (!text) return null
  const fromUrl = text.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]+)/i)
  const id = fromUrl?.[1] || (/^[A-Za-z0-9]{22}$/.test(text) ? text : '')
  return id || null
}

export function parseAppleMusicArtistId(value: string | null | undefined): string | null {
  const text = clean(value)
  if (!text) return null
  const fromUrl = text.match(/music\.apple\.com\/[^/]+\/artist\/[^/]+\/(\d+)/i)
  const id = fromUrl?.[1] || (/^\d{4,12}$/.test(text) ? text : '')
  return id || null
}

export function parseYoutubeChannelId(value: string | null | undefined): string | null {
  const text = clean(value)
  if (!text) return null
  const fromUrl = text.match(/(?:youtube\.com|music\.youtube\.com)\/(?:channel\/|.*[?&]channel=)(UC[A-Za-z0-9_-]{20,})/i)
  if (fromUrl?.[1]) return fromUrl[1]
  if (/^UC[A-Za-z0-9_-]{20,}$/.test(text)) return text
  const handle = text.match(/(?:youtube\.com\/)?@([A-Za-z0-9._-]+)/i)
  return handle?.[1] ? `@${handle[1]}` : null
}

export function parseInstagramHandle(value: string | null | undefined): string | null {
  const text = clean(value).replace(/^@/, '')
  if (!text) return null
  const fromUrl = text.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  const handle = fromUrl?.[1] || (/^[A-Za-z0-9._]{1,30}$/.test(text) ? text : '')
  return handle || null
}

export function parseFacebookPage(value: string | null | undefined): string | null {
  const text = clean(value)
  if (!text) return null
  const fromUrl = text.match(/facebook\.com\/(?:pages\/[^/]+\/)?([A-Za-z0-9.]+)/i)
  const page = fromUrl?.[1] || (/^[A-Za-z0-9.]{2,80}$/.test(text) ? text : '')
  if (!page || page === 'pages' || page === 'profile.php') return null
  return page
}

export function noticeYearFromDate(value: string | null | undefined, fallback = new Date().getFullYear()): number {
  const year = value ? Number(String(value).slice(0, 4)) : NaN
  return Number.isFinite(year) && year >= 1900 && year <= 2100 ? year : fallback
}

export function generateCatalogNumber(title: string, year?: number | null): string {
  const slug = clean(title)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18) || 'RELEASE'
  const yr = year && year > 1900 ? year : new Date().getFullYear()
  return `SERGIK-${slug}-${yr}`
}

export function normalizeIpi(value: string | null | undefined): string | null {
  const digits = clean(value).replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 11) return null
  return digits.padStart(11, '0')
}

export function normalizeIswc(value: string | null | undefined): string | null {
  const raw = clean(value).toUpperCase().replace(/\s+/g, '')
  if (!raw) return null
  const compact = raw.replace(/[.\-]/g, '')
  const match = compact.match(/^T(\d{9})(\d)$/)
  if (!match) return null
  const body = match[1]
  const check = match[2]
  return `T-${body.slice(0, 3)}.${body.slice(3, 6)}.${body.slice(6, 9)}-${check}`
}

export function formatPhonogramNotice(year: number, owner: string): string {
  return `℗ ${year} ${owner || 'SERGIK'}`
}

export function formatCopyrightNotice(year: number, owner: string): string {
  return `© ${year} ${owner || 'SERGIK'}`
}

export type ReleasePackageSeed = {
  album_artist?: string
  upc?: string
  catalog_number?: string
  original_release_date?: string
  p_line_year?: number
  c_line_year?: number
  spotify_artist_id?: string
  apple_artist_id?: string
  youtube_artist_id?: string
  instagram_handle?: string
  facebook_page_id?: string
  genre?: string | null
  subgenre?: string | null
}

export function buildReleasePackageSeeds(
  release: Record<string, unknown>,
  opts: {
    upc?: string
    spotifyArtistId?: string | null
    appleArtistId?: string | null
    youtubeArtistId?: string | null
    instagramHandle?: string | null
    facebookPageId?: string | null
  } = {},
): ReleasePackageSeed {
  const seed: ReleasePackageSeed = {}
  const label = clean(release.label_name) || DEFAULT_LABEL_NAME
  if (!clean(release.album_artist)) seed.album_artist = label
  if (!clean(release.upc) && opts.upc) seed.upc = opts.upc
  const street = clean(release.release_date)
  if (!clean(release.original_release_date) && street) seed.original_release_date = street
  const year = noticeYearFromDate(
    clean(release.original_release_date) || street || null,
  )
  if (release.p_line_year == null || release.p_line_year === '') seed.p_line_year = year
  if (release.c_line_year == null || release.c_line_year === '') seed.c_line_year = year
  if (!clean(release.catalog_number)) {
    seed.catalog_number = generateCatalogNumber(clean(release.title) || 'Release', year)
  }
  const spotify = parseSpotifyArtistId(clean(release.spotify_artist_id) || opts.spotifyArtistId)
  const apple = parseAppleMusicArtistId(clean(release.apple_artist_id) || opts.appleArtistId)
  const youtube = parseYoutubeChannelId(clean(release.youtube_artist_id) || opts.youtubeArtistId)
  const instagram = parseInstagramHandle(clean(release.instagram_handle) || opts.instagramHandle)
  const facebook = parseFacebookPage(clean(release.facebook_page_id) || opts.facebookPageId)
  if (!clean(release.spotify_artist_id) && spotify) seed.spotify_artist_id = spotify
  if (!clean(release.apple_artist_id) && apple) seed.apple_artist_id = apple
  if (!clean(release.youtube_artist_id) && youtube) seed.youtube_artist_id = youtube
  if (!clean(release.instagram_handle) && instagram) seed.instagram_handle = instagram
  if (!clean(release.facebook_page_id) && facebook) seed.facebook_page_id = facebook
  return seed
}
