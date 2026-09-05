/**
 * Shared list-row field picking so Songs, playlists, and folders show the same catalog columns.
 */

import { catalogLockFromTrack, readCatalogOverrides } from '@/lib/catalog-lock'
import { normalizeVaultAudioUrl } from '@/utils/normalizeVaultAudioUrl'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { createdDateFromTrack, originalDateFromMetadata } from '@/lib/music-library/track-created-date'

export { originalDateFromMetadata }

const UNKNOWN = new Set(['', 'unknown', 'n/a', 'none', 'null', 'unclassified'])

function clean(value: unknown): string {
  if (value == null) return ''
  const text = String(value).trim()
  if (!text || UNKNOWN.has(text.toLowerCase())) return ''
  return text
}

function numOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function measuredOf(sonicDna: unknown): Record<string, any> | null {
  if (!sonicDna || typeof sonicDna !== 'object') return null
  const measured = (sonicDna as any).measured
  return measured && typeof measured === 'object' ? measured : null
}

export type TrackListFolder = {
  name?: string | null
  type?: string | null
  artwork_url?: string | null
}

export type TrackListAudio = {
  duration_seconds?: number | null
  artwork_url?: string | null
  created_at?: string | null
  sonic_dna_status?: string | null
  bpm?: number | null
  key_signature?: string | null
  sonic_dna?: unknown
}

/** Keep only admin catalog stamps — never ship sonic_dna blobs in list rows. */
export function leanCatalogMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined
  const src = metadata as Record<string, unknown>
  const overrides = readCatalogOverrides(src)
  const originalDate = originalDateFromMetadata(src)
  const out: Record<string, unknown> = {}
  if (originalDate) {
    out.original_date = originalDate
    if (typeof src.original_date_source === 'string') {
      out.original_date_source = src.original_date_source
    }
  }
  if (overrides) {
    const hasField = ['bpm', 'key_signature', 'genre', 'subgenre', 'title', 'artist', 'year']
      .some((key) => overrides[key as keyof typeof overrides] != null && overrides[key as keyof typeof overrides] !== '')
    if (hasField) out.catalog_overrides = overrides
  }
  return Object.keys(out).length ? out : undefined
}

/** Pull list-safe display fields from sonic DNA without shipping the full blob. */
export function catalogHintsFromSonicDna(sonicDna: unknown): {
  bpm: number | null
  key: string
  genre: string
  subgenre: string
} {
  const measured = measuredOf(sonicDna)
  const dna = sonicDna && typeof sonicDna === 'object' ? (sonicDna as any) : null
  const bpm =
    numOrNull(measured?.bpm) ??
    numOrNull(dna?.technical?.bpm) ??
    numOrNull(dna?.bpm)
  const key =
    clean(measured?.key) ||
    clean(dna?.technical?.key) ||
    clean(dna?.key_signature) ||
    clean(typeof dna?.key === 'string' ? dna.key : '')
  const genre =
    clean(measured?.genre?.primary) ||
    clean(Array.isArray(dna?.genres?.primaryGenres) ? dna.genres.primaryGenres[0] : '') ||
    clean(typeof dna?.genre === 'string' ? dna.genre : dna?.genre?.primary)
  const subgenre =
    clean(measured?.genre?.subgenre) ||
    clean(Array.isArray(dna?.genres?.subgenres) ? dna.genres.subgenres[0] : '')
  return {
    bpm: bpm != null && bpm >= 40 && bpm <= 240 ? Math.round(bpm) : null,
    key,
    genre,
    subgenre,
  }
}

/**
 * Map a music_library_tracks row (+ optional audio/folder) into the shared list Track shape.
 */
export function mapLibraryTrackToListItem(
  track: any,
  opts?: { audio?: TrackListAudio | null; folder?: TrackListFolder | null; includeFullMetadata?: boolean },
) {
  const audio = opts?.audio || null
  const folder = opts?.folder || null
  const hints = catalogHintsFromSonicDna(audio?.sonic_dna)
  const lock = catalogLockFromTrack(track)
  const originalDate = createdDateFromTrack(track) || undefined

  const bpm =
    numOrNull(lock.bpm) ??
    numOrNull(track.bpm) ??
    numOrNull(audio?.bpm) ??
    hints.bpm ??
    null
  const key_signature =
    clean(lock.key_signature) ||
    clean(track.key_signature) ||
    clean(audio?.key_signature) ||
    hints.key ||
    undefined
  const genre = clean(lock.genre) || clean(track.genre) || hints.genre || undefined
  const subgenre = clean(lock.subgenre) || clean(track.subgenre) || hints.subgenre || undefined
  const title = clean(lock.title) || clean(track.title) || track.title
  const artist = clean(lock.artist) || clean(track.artist) || track.artist
  const year =
    lock.year ??
    track.year ??
    (originalDate ? Number(originalDate.slice(0, 4)) : undefined)

  const artworkRaw = track.artwork_url || audio?.artwork_url || folder?.artwork_url || undefined
  const metadata =
    opts?.includeFullMetadata && track.metadata && typeof track.metadata === 'object'
      ? track.metadata
      : leanCatalogMetadata({
          ...(track.metadata && typeof track.metadata === 'object' ? track.metadata : {}),
          ...(originalDate ? { original_date: originalDate } : {}),
        })

  return {
    id: track.id,
    folderId: track.folder_id,
    audioFileId: track.audio_file_id,
    title,
    artist,
    duration: audio?.duration_seconds || track.duration || null,
    file: normalizeVaultAudioUrl(track.file_url || ''),
    artwork: artworkRaw ? resolveImageUrl(artworkRaw) : undefined,
    bpm: bpm ?? undefined,
    key_signature,
    energy_level: track.energy_level,
    danceability: track.danceability,
    sonic_dna_status: audio?.sonic_dna_status || track.sonic_dna_status || null,
    created_at: audio?.created_at || track.created_at || track.created_at_timestamp,
    date: track.date || undefined,
    year,
    date_created: originalDate,
    display_order: track.display_order,
    is_archived: track.is_archived,
    archived_at: track.archived_at,
    genre,
    subgenre,
    album: folder?.name || track.album || undefined,
    albumType: folder?.type || track.albumType || undefined,
    track_number: track.track_number,
    disc_number: track.disc_number,
    rating: track.rating,
    play_count: track.play_count,
    last_played_at: track.last_played_at,
    tags: track.tags,
    sort_artist: track.sort_artist,
    ...(metadata ? { metadata } : {}),
  }
}
