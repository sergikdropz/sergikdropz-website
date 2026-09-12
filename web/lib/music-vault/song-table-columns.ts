/**
 * Sergik Music Vault — songs table column order, visibility, and client-side sort.
 */

import type { Track } from '@/utils/musicLibraryApi'
import { sonicDnaCompletenessPercent } from '@/lib/audio/sonic-dna-quality'
import { createdDateFromTrack } from '@/lib/music-library/track-created-date'

export type SongTableOptionalColumn =
  | 'artist'
  | 'album'
  | 'genre'
  | 'subgenre'
  | 'bpm'
  | 'key'
  | 'year'
  | 'date'
  | 'date_created'
  | 'rating'
  | 'play_count'
  | 'duration'

export type SongTableReorderableColumn = 'title' | 'dna' | SongTableOptionalColumn

export type SongTableSortField =
  | 'title'
  | 'artist'
  | 'album'
  | 'genre'
  | 'subgenre'
  | 'bpm'
  | 'year'
  | 'rating'
  | 'play_count'
  | 'date_added'
  | 'last_played'
  | 'duration'
  | 'key'
  | 'energy'
  | 'date'
  | 'date_created'
  | 'sonic_dna'
  | 'track_number'

export const SONG_TABLE_OPTIONAL_COLUMNS: SongTableOptionalColumn[] = [
  'artist',
  'album',
  'genre',
  'subgenre',
  'bpm',
  'key',
  'year',
  'date',
  'date_created',
  'rating',
  'play_count',
  'duration',
]

export const SONG_TABLE_COLUMN_LABELS: Record<SongTableOptionalColumn, string> = {
  artist: 'Artist',
  album: 'Album',
  genre: 'Genre',
  subgenre: 'Subgenre',
  bpm: 'BPM',
  key: 'Key',
  year: 'Year',
  date: 'Released',
  date_created: 'Created',
  rating: 'Rating',
  play_count: 'Plays',
  duration: 'Time',
}

export const SONG_TABLE_DEFAULT_COLUMN_ORDER: SongTableReorderableColumn[] = [
  'title',
  'dna',
  'artist',
  'album',
  'genre',
  'subgenre',
  'bpm',
  'key',
  'year',
  'date',
  'date_created',
  'rating',
  'play_count',
  'duration',
]

export const SONG_TABLE_COLUMNS_STORAGE_KEY = 'serg-browser-songs-visible-columns'
export const LEGACY_SONG_TABLE_COLUMNS_STORAGE_KEY = 'itunes-browser-songs-visible-columns'
export const SONG_TABLE_EP_COLUMNS_STORAGE_KEY = 'serg-browser-ep-songs-visible-columns'
export const SONG_TABLE_EP_COLUMNS_VERSION_KEY = 'serg-browser-ep-songs-visible-columns-version'
export const SONG_TABLE_EP_COLUMNS_VERSION = 'v1-artist-album-time-genre-subgenre'
export const SONG_TABLE_COLUMN_ORDER_STORAGE_KEY = 'serg-browser-songs-column-order'
export const SONG_TABLE_SORT_STORAGE_KEY = 'serg-browser-songs-sort'

export const COLUMN_SORT_FIELD: Partial<Record<SongTableReorderableColumn, SongTableSortField>> = {
  title: 'title',
  dna: 'sonic_dna',
  artist: 'artist',
  album: 'album',
  genre: 'genre',
  subgenre: 'subgenre',
  bpm: 'bpm',
  key: 'key',
  year: 'year',
  date: 'date',
  date_created: 'date_created',
  rating: 'rating',
  play_count: 'play_count',
  duration: 'duration',
}

export type SongTableColumnPreset = 'default' | 'ep'

/** Default optional columns for EP tracklists (Title / # stay fixed). */
export const SONG_TABLE_EP_DEFAULT_OPTIONAL_COLUMNS: SongTableOptionalColumn[] = [
  'artist',
  'album',
  'duration',
  'genre',
  'subgenre',
]

export function defaultSongTableOptionalColumns(
  preset: SongTableColumnPreset = 'default',
): SongTableOptionalColumn[] {
  return preset === 'ep'
    ? [...SONG_TABLE_EP_DEFAULT_OPTIONAL_COLUMNS]
    : [...SONG_TABLE_OPTIONAL_COLUMNS]
}

export function songTableColumnsStorageKey(preset: SongTableColumnPreset = 'default'): string {
  return preset === 'ep' ? SONG_TABLE_EP_COLUMNS_STORAGE_KEY : SONG_TABLE_COLUMNS_STORAGE_KEY
}

export function saveSongTableColumnVisibility(
  visible: Set<SongTableOptionalColumn>,
  preset: SongTableColumnPreset = 'default',
): void {
  try {
    localStorage.setItem(
      songTableColumnsStorageKey(preset),
      JSON.stringify(SONG_TABLE_OPTIONAL_COLUMNS.filter((k) => visible.has(k))),
    )
  } catch {
    /* ignore */
  }
}

const ALL_REORDERABLE = new Set<SongTableReorderableColumn>(SONG_TABLE_DEFAULT_COLUMN_ORDER)

export function loadSongTableColumnVisibility(
  preset: SongTableColumnPreset = 'default',
): Set<SongTableOptionalColumn> {
  const defaults = defaultSongTableOptionalColumns(preset)
  if (typeof window === 'undefined') return new Set(defaults)
  try {
    if (preset === 'ep') {
      const version = localStorage.getItem(SONG_TABLE_EP_COLUMNS_VERSION_KEY)
      if (version !== SONG_TABLE_EP_COLUMNS_VERSION) {
        const seeded = new Set(defaults)
        saveSongTableColumnVisibility(seeded, 'ep')
        try {
          localStorage.setItem(SONG_TABLE_EP_COLUMNS_VERSION_KEY, SONG_TABLE_EP_COLUMNS_VERSION)
        } catch {
          /* ignore */
        }
        return seeded
      }
      const raw = localStorage.getItem(SONG_TABLE_EP_COLUMNS_STORAGE_KEY)
      if (!raw) return new Set(defaults)
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return new Set(defaults)
      const next = new Set<SongTableOptionalColumn>()
      for (const k of parsed) {
        if (typeof k === 'string' && SONG_TABLE_OPTIONAL_COLUMNS.includes(k as SongTableOptionalColumn)) {
          next.add(k as SongTableOptionalColumn)
        }
      }
      return next.size > 0 ? next : new Set(defaults)
    }

    const raw =
      localStorage.getItem(SONG_TABLE_COLUMNS_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_SONG_TABLE_COLUMNS_STORAGE_KEY)
    if (!raw) return new Set(defaults)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(defaults)
    const next = new Set<SongTableOptionalColumn>()
    for (const k of parsed) {
      if (typeof k === 'string' && SONG_TABLE_OPTIONAL_COLUMNS.includes(k as SongTableOptionalColumn)) {
        next.add(k as SongTableOptionalColumn)
      }
    }
    for (const k of ['year', 'date', 'date_created'] as const) {
      if (!parsed.includes(k)) next.add(k)
    }
    saveSongTableColumnVisibility(next, 'default')
    return next.size > 0 ? next : new Set(defaults)
  } catch {
    return new Set(defaults)
  }
}

export function loadSongTableColumnOrder(): SongTableReorderableColumn[] {
  if (typeof window === 'undefined') return [...SONG_TABLE_DEFAULT_COLUMN_ORDER]
  try {
    const raw = localStorage.getItem(SONG_TABLE_COLUMN_ORDER_STORAGE_KEY)
    if (!raw) return [...SONG_TABLE_DEFAULT_COLUMN_ORDER]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...SONG_TABLE_DEFAULT_COLUMN_ORDER]
    const order: SongTableReorderableColumn[] = []
    for (const k of parsed) {
      if (typeof k === 'string' && ALL_REORDERABLE.has(k as SongTableReorderableColumn)) {
        order.push(k as SongTableReorderableColumn)
      }
    }
    for (const k of SONG_TABLE_DEFAULT_COLUMN_ORDER) {
      if (!order.includes(k)) order.push(k)
    }
    return order
  } catch {
    return [...SONG_TABLE_DEFAULT_COLUMN_ORDER]
  }
}

export function saveSongTableColumnOrder(order: SongTableReorderableColumn[]): void {
  try {
    localStorage.setItem(SONG_TABLE_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(order))
  } catch {
    /* ignore */
  }
}

export function loadSongTableSort(): { field: SongTableSortField; dir: 'asc' | 'desc' } {
  const fallback = { field: 'title' as const, dir: 'asc' as const }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(SONG_TABLE_SORT_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as { field?: string; dir?: string }
    const field = parsed.field as SongTableSortField | undefined
    const dir = parsed.dir === 'desc' ? 'desc' : 'asc'
    const validFields: SongTableSortField[] = [
      'title', 'artist', 'album', 'genre', 'subgenre', 'bpm', 'year', 'rating', 'play_count',
      'date_added', 'last_played', 'duration', 'key', 'energy', 'date', 'date_created', 'sonic_dna',
      'track_number',
    ]
    if (field && validFields.includes(field)) return { field, dir }
    return fallback
  } catch {
    return fallback
  }
}

export function saveSongTableSort(field: SongTableSortField, dir: 'asc' | 'desc'): void {
  try {
    localStorage.setItem(SONG_TABLE_SORT_STORAGE_KEY, JSON.stringify({ field, dir }))
  } catch {
    /* ignore */
  }
}

export function reorderColumns(
  order: SongTableReorderableColumn[],
  from: SongTableReorderableColumn,
  to: SongTableReorderableColumn
): SongTableReorderableColumn[] {
  if (from === to) return order
  const next = order.filter((c) => c !== from)
  const toIndex = next.indexOf(to)
  if (toIndex === -1) return order
  next.splice(toIndex, 0, from)
  return next
}

export function visibleColumnOrder(
  order: SongTableReorderableColumn[],
  visibleOptional: Set<SongTableOptionalColumn>,
  adminCatalog: boolean
): SongTableReorderableColumn[] {
  return order.filter((col) => {
    if (col === 'title') return true
    if (col === 'dna') return adminCatalog
    return visibleOptional.has(col)
  })
}

function trackDateCreatedIso(track: Pick<Track, 'metadata' | 'year' | 'date_created'>): string {
  return createdDateFromTrack(track) || ''
}

function compareStrings(a: string, b: string, dir: 'asc' | 'desc'): number {
  const cmp = a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
  return dir === 'asc' ? cmp : -cmp
}

function compareNumbers(a: number | null | undefined, b: number | null | undefined, dir: 'asc' | 'desc'): number {
  const av = a == null || !Number.isFinite(Number(a)) ? null : Number(a)
  const bv = b == null || !Number.isFinite(Number(b)) ? null : Number(b)
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  return dir === 'asc' ? av - bv : bv - av
}

const DNA_STATUS_RANK: Record<string, number> = {
  completed: 4,
  partial: 3,
  processing: 2,
  pending: 1,
  failed: 0,
}

/** Client-side sort for playlist / album tables (and as display fallback). */
export function sortSongTableTracks(
  tracks: Track[],
  field: SongTableSortField,
  dir: 'asc' | 'desc'
): Track[] {
  const out = [...tracks]
  out.sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'title':
        cmp = compareStrings(a.title || '', b.title || '', 'asc')
        break
      case 'artist':
        cmp = compareStrings(a.artist || '', b.artist || '', 'asc')
        break
      case 'album':
        cmp = compareStrings(a.album || '', b.album || '', 'asc')
        break
      case 'genre':
        cmp = compareStrings(a.genre || '', b.genre || '', 'asc')
        break
      case 'subgenre':
        cmp = compareStrings(a.subgenre || '', b.subgenre || '', 'asc')
        break
      case 'bpm':
        cmp = compareNumbers(a.bpm, b.bpm, 'asc')
        break
      case 'key':
        cmp = compareStrings(a.key_signature || '', b.key_signature || '', 'asc')
        break
      case 'year':
        cmp = compareNumbers(a.year, b.year, 'asc')
        break
      case 'date':
        cmp = compareStrings(String(a.date || '').slice(0, 10), String(b.date || '').slice(0, 10), 'asc')
        break
      case 'date_created':
      case 'date_added':
        cmp = compareStrings(
          a.date_created || trackDateCreatedIso(a) || '',
          b.date_created || trackDateCreatedIso(b) || '',
          'asc'
        )
        break
      case 'rating':
        cmp = compareNumbers(a.rating, b.rating, 'asc')
        break
      case 'play_count':
        cmp = compareNumbers(a.play_count, b.play_count, 'asc')
        break
      case 'duration':
        cmp = compareNumbers(a.duration, b.duration, 'asc')
        break
      case 'energy':
        cmp = compareNumbers(a.energy_level, b.energy_level, 'asc')
        break
      case 'sonic_dna': {
        const ap = sonicDnaCompletenessPercent(a.sonic_dna_status, a.sonic_dna)
        const bp = sonicDnaCompletenessPercent(b.sonic_dna_status, b.sonic_dna)
        cmp = ap - bp
        if (cmp === 0) {
          cmp =
            (DNA_STATUS_RANK[String(a.sonic_dna_status || 'pending')] ?? 0) -
            (DNA_STATUS_RANK[String(b.sonic_dna_status || 'pending')] ?? 0)
        }
        break
      }
      case 'last_played':
        cmp = compareStrings(a.last_played_at || '', b.last_played_at || '', 'asc')
        break
      case 'track_number': {
        const an = a.display_order ?? a.track_number
        const bn = b.display_order ?? b.track_number
        cmp = compareNumbers(an, bn, 'asc')
        if (cmp === 0) cmp = compareNumbers(a.disc_number, b.disc_number, 'asc')
        break
      }
      default:
        cmp = compareStrings(a.title || '', b.title || '', 'asc')
    }
    if (cmp === 0) cmp = compareStrings(a.title || '', b.title || '', 'asc')
    return dir === 'asc' ? cmp : -cmp
  })
  return out
}

/** Shift-click range against the currently visible (sorted) rows, not the unsorted source list. */
export function visibleSelectionRangeIds<T extends { id: string }>(
  visible: T[],
  index: number,
  anchorId: string | null,
): string[] {
  const track = visible[index]
  if (!track) return []
  if (!anchorId) return [track.id]
  const anchorIndex = visible.findIndex((t) => t.id === anchorId)
  const from = anchorIndex >= 0 ? anchorIndex : index
  const lo = Math.min(from, index)
  const hi = Math.max(from, index)
  return visible.slice(lo, hi + 1).map((t) => t.id)
}

export function columnHeaderLabel(col: SongTableReorderableColumn): string {
  if (col === 'title') return 'Title'
  if (col === 'dna') return 'DNA'
  return SONG_TABLE_COLUMN_LABELS[col]
}

export function columnHeaderAlign(col: SongTableReorderableColumn): 'left' | 'center' | 'right' {
  if (col === 'bpm' || col === 'key' || col === 'year' || col === 'rating' || col === 'play_count' || col === 'dna') {
    return 'center'
  }
  if (col === 'duration') return 'right'
  return 'left'
}

export function columnHeaderUppercase(col: SongTableReorderableColumn): boolean {
  return col === 'date' || col === 'date_created' || col === 'dna'
}
