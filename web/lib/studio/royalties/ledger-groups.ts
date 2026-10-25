import type { RoyaltyLedgerEntry } from '@/lib/studio/royalties/types'
import { isYouTubeId } from '@/lib/videos/youtube'

export type TrackMedia = {
  title: string
  /** Title plus description or caption. Used to find a track inside an EP video or a post. */
  text?: string | null
  youtubeId?: string | null
  instagramId?: string | null
}

export type LedgerPlatformTotal = {
  id: string
  label: string
  cents: number
}

export type LedgerTrackGroup = {
  key: string
  title: string
  releaseId: string | null
  rows: RoyaltyLedgerEntry[]
  amountCents: number
  youtubeCents: number
  instagramCents: number
  platforms: LedgerPlatformTotal[]
  youtubeIds: string[]
  instagramIds: string[]
  youtubeId: string | null
  instagramId: string | null
}

export function trackGroupKey(title: string | null | undefined): string {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function instagramShortcode(value: string | null | undefined): string | null {
  const raw = (value || '').trim()
  if (!raw) return null
  const fromUrl = raw.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i)
  if (fromUrl) return fromUrl[1]
  if (/^[A-Za-z0-9_-]{5,}$/.test(raw) && !raw.includes(' ')) return raw
  return null
}

/** Full title, plus the name before a feature credit, so "Zoned (feat. …)" can match a video called Zoned. */
export function trackPhrases(title: string): string[] {
  const full = trackGroupKey(title)
  const head = trackGroupKey(title.split(/\(|\bfeat\.|\bft\./i)[0] || '')
  const phrases: string[] = []
  if (full.length >= 3) phrases.push(full)
  if (head.length >= 3 && head !== full) phrases.push(head)
  return phrases
}

export function mediaContainsTrack(title: string, item: Pick<TrackMedia, 'title' | 'text'>): boolean {
  const haystack = ` ${trackGroupKey(`${item.title || ''} ${item.text || ''}`)} `
  return trackPhrases(title).some((phrase) => haystack.includes(` ${phrase} `))
}

export function matchYouTubeIds(title: string, media: TrackMedia[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of media) {
    const id = (item.youtubeId || '').trim()
    if (!isYouTubeId(id) || seen.has(id) || !mediaContainsTrack(title, item)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= 6) break
  }
  return ids
}

export function matchInstagramIds(title: string, media: TrackMedia[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of media) {
    const id = instagramShortcode(item.instagramId)
    if (!id || seen.has(id) || !mediaContainsTrack(title, item)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= 6) break
  }
  return ids
}

export function matchYouTubeId(title: string, media: TrackMedia[]): string | null {
  return matchYouTubeIds(title, media)[0] || null
}

export function matchInstagramId(title: string, media: TrackMedia[]): string | null {
  return matchInstagramIds(title, media)[0] || null
}

/** Roll a statement store into a ledger column. YouTube products stay one column. Instagram and Facebook audio stay one column. */
export function ledgerPlatform(store: string | null | undefined): { id: string; label: string } | null {
  const raw = (store || '').trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower.includes('youtube')) return { id: 'youtube', label: 'YouTube' }
  if (lower.includes('instagram') || lower.includes('facebook')) return { id: 'instagram', label: 'Instagram' }
  if (lower.includes('apple')) return { id: 'apple_music', label: 'Apple Music' }
  if (lower.includes('itunes')) return { id: 'itunes', label: 'iTunes' }
  if (lower.includes('spotify')) return { id: 'spotify', label: 'Spotify' }
  if (lower.includes('amazon')) return { id: 'amazon', label: 'Amazon Music' }
  if (lower.includes('tidal')) return { id: 'tidal', label: 'Tidal' }
  if (lower.includes('deezer')) return { id: 'deezer', label: 'Deezer' }
  if (lower.includes('snap')) return { id: 'snapchat', label: 'Snapchat' }
  if (lower.includes('luna')) return { id: 'luna', label: 'Luna' }
  if (lower.includes('tiktok')) return { id: 'tiktok', label: 'TikTok' }
  if (lower.includes('soundcloud')) return { id: 'soundcloud', label: 'SoundCloud' }
  if (lower.includes('pandora')) return { id: 'pandora', label: 'Pandora' }
  const id = lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return id ? { id, label: raw } : null
}

export type LedgerSort =
  | 'amount-desc'
  | 'amount-asc'
  | 'title-asc'
  | 'title-desc'
  | 'lines-desc'
  | 'youtube-desc'
  | 'instagram-desc'

export const LEDGER_SORTS: { id: LedgerSort; label: string }[] = [
  { id: 'amount-desc', label: 'Amount, high to low' },
  { id: 'amount-asc', label: 'Amount, low to high' },
  { id: 'title-asc', label: 'Title A–Z' },
  { id: 'title-desc', label: 'Title Z–A' },
  { id: 'lines-desc', label: 'Most lines' },
  { id: 'youtube-desc', label: 'YouTube, high to low' },
  { id: 'instagram-desc', label: 'Instagram, high to low' },
]

export type LedgerSortField =
  | 'title'
  | 'lines'
  | 'amount'
  | 'youtube'
  | 'youtubeAmount'
  | 'instagram'
  | 'instagramAmount'

export type LedgerSortDir = 'asc' | 'desc'

const LEDGER_SORT_SPEC: Record<LedgerSort, { field: LedgerSortField; dir: LedgerSortDir }> = {
  'amount-desc': { field: 'amount', dir: 'desc' },
  'amount-asc': { field: 'amount', dir: 'asc' },
  'title-asc': { field: 'title', dir: 'asc' },
  'title-desc': { field: 'title', dir: 'desc' },
  'lines-desc': { field: 'lines', dir: 'desc' },
  'youtube-desc': { field: 'youtubeAmount', dir: 'desc' },
  'instagram-desc': { field: 'instagramAmount', dir: 'desc' },
}

function compareTitles(a: LedgerTrackGroup, b: LedgerTrackGroup): number {
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
}

function compareOptionalText(a: string | null, b: string | null, dir: LedgerSortDir): number {
  const left = (a || '').trim()
  const right = (b || '').trim()
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1
  const cmp = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  return dir === 'asc' ? cmp : -cmp
}

export function compareLedgerGroups(
  a: LedgerTrackGroup,
  b: LedgerTrackGroup,
  field: LedgerSortField,
  dir: LedgerSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1
  switch (field) {
    case 'title':
      return compareTitles(a, b) * (dir === 'asc' ? 1 : -1)
    case 'lines':
      return (a.rows.length - b.rows.length) * sign || b.amountCents - a.amountCents || compareTitles(a, b)
    case 'amount':
      return (a.amountCents - b.amountCents) * sign || compareTitles(a, b)
    case 'youtube':
      return compareOptionalText(a.youtubeId, b.youtubeId, dir) || compareTitles(a, b)
    case 'youtubeAmount':
      return (a.youtubeCents - b.youtubeCents) * sign || compareTitles(a, b)
    case 'instagram':
      return compareOptionalText(a.instagramId, b.instagramId, dir) || compareTitles(a, b)
    case 'instagramAmount':
      return (a.instagramCents - b.instagramCents) * sign || compareTitles(a, b)
  }
}

/** First click on a money or line column starts high-to-low. Title and ids start A–Z. */
export function nextLedgerSort(
  current: { field: LedgerSortField; dir: LedgerSortDir },
  field: LedgerSortField,
): { field: LedgerSortField; dir: LedgerSortDir } {
  if (current.field === field) {
    return { field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  }
  const descFirst =
    field === 'amount' || field === 'lines' || field === 'youtubeAmount' || field === 'instagramAmount'
  return { field, dir: descFirst ? 'desc' : 'asc' }
}

export function sortLedgerGroupsBy(
  groups: LedgerTrackGroup[],
  field: LedgerSortField,
  dir: LedgerSortDir,
): LedgerTrackGroup[] {
  return [...groups].sort((a, b) => compareLedgerGroups(a, b, field, dir))
}

export function sortLedgerGroups(groups: LedgerTrackGroup[], sort: LedgerSort): LedgerTrackGroup[] {
  const spec = LEDGER_SORT_SPEC[sort]
  return sortLedgerGroupsBy(groups, spec.field, spec.dir)
}

export function groupLedgerByTrack(rows: RoyaltyLedgerEntry[], media: TrackMedia[] = []): LedgerTrackGroup[] {
  const groups = new Map<string, LedgerTrackGroup>()
  for (const row of rows) {
    const title = (row.trackTitle || '').trim() || row.isrc || 'Untitled'
    const key = trackGroupKey(title) || (row.isrc || 'untitled').toLowerCase()
    let group = groups.get(key)
    if (!group) {
      const youtubeIds = matchYouTubeIds(title, media)
      const instagramIds = matchInstagramIds(title, media)
      group = {
        key,
        title,
        releaseId: row.releaseId,
        rows: [],
        amountCents: 0,
        youtubeCents: 0,
        instagramCents: 0,
        platforms: [],
        youtubeIds,
        instagramIds,
        youtubeId: youtubeIds[0] || null,
        instagramId: instagramIds[0] || null,
      }
      groups.set(key, group)
    }
    if (!group.releaseId && row.releaseId) group.releaseId = row.releaseId
    group.rows.push(row)
    group.amountCents += row.amountCents
    const platform = ledgerPlatform(row.store)
    if (platform?.id === 'youtube') group.youtubeCents += row.amountCents
    else if (platform?.id === 'instagram') group.instagramCents += row.amountCents
    else if (platform) {
      const existing = group.platforms.find((item) => item.id === platform.id)
      if (existing) existing.cents += row.amountCents
      else group.platforms.push({ ...platform, cents: row.amountCents })
    }
  }
  for (const group of groups.values()) {
    group.platforms.sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label))
  }
  return sortLedgerGroups(Array.from(groups.values()), 'amount-desc')
}
