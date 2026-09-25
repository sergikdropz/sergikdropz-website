/**
 * Shared library track search — server PostgREST filters + client haystack matching.
 */

export function normalizeLibrarySearchQuery(raw: string): string {
  return String(raw || '').trim().slice(0, 160)
}

export function librarySearchTokens(query: string): string[] {
  return normalizeLibrarySearchQuery(query).toLowerCase().split(/\s+/).filter(Boolean)
}

/** Escape `%` / `_` for ilike patterns (PostgREST). */
export function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export function ilikePatternForSearch(search: string): string {
  const q = normalizeLibrarySearchQuery(search)
  if (!q) return ''
  return `%${escapeIlikePattern(q)}%`
}

/** Main-table columns only — embedded `music_library_folders` in `.or()` breaks PostgREST. */
const TRACK_SEARCH_COLUMNS = [
  'title',
  'artist',
  'sort_artist',
  'genre',
  'subgenre',
  'file_url',
  'key_signature',
] as const

/**
 * PostgREST `.or()` filter for one search phrase across common track + folder fields.
 */
export function buildTrackLibrarySearchOrFilter(search: string): string | null {
  const pattern = ilikePatternForSearch(search)
  if (!pattern) return null
  return TRACK_SEARCH_COLUMNS.map((col) => `${col}.ilike.${pattern}`).join(',')
}

export type TrackSearchLike = {
  title?: string | null
  artist?: string | null
  album?: string | null
  genre?: string | null
  subgenre?: string | null
  key_signature?: string | null
  tags?: string[] | string | null
  file?: string | null
  file_url?: string | null
  metadata?: Record<string, unknown> | null
}

export function trackSearchHaystack(track: TrackSearchLike): string {
  const tags = Array.isArray(track.tags)
    ? track.tags.join(' ')
    : typeof track.tags === 'string'
      ? track.tags
      : ''
  const meta = track.metadata && typeof track.metadata === 'object' ? track.metadata : {}
  const metaAlbum = String(meta.album || meta.album_title || '')
  const file = String(track.file || track.file_url || '')
  const fileBase = file.split('/').pop()?.replace(/\.[^.]+$/, '') || ''
  return [
    track.title,
    track.artist,
    track.album,
    metaAlbum,
    track.genre,
    track.subgenre,
    track.key_signature,
    tags,
    fileBase,
    file,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** Every whitespace-separated token must appear somewhere in the haystack. */
export function trackMatchesLibrarySearch(track: TrackSearchLike, query: string): boolean {
  const tokens = librarySearchTokens(query)
  if (!tokens.length) return true
  const hay = trackSearchHaystack(track)
  return tokens.every((token) => hay.includes(token))
}

export function filterTracksForLibraryBrowse<T extends TrackSearchLike>(
  tracks: T[],
  opts: { search?: string; genre?: string | null; artist?: string | null },
): T[] {
  let next = tracks
  if (opts.genre) {
    next = next.filter((t) => String(t.genre || '') === opts.genre)
  }
  if (opts.artist) {
    const artistQ = opts.artist.toLowerCase()
    next = next.filter((t) => String(t.artist || '').toLowerCase().includes(artistQ))
  }
  const search = normalizeLibrarySearchQuery(opts.search || '')
  if (search) {
    next = next.filter((t) => trackMatchesLibrarySearch(t, search))
  }
  return next
}
