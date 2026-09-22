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

/** Prefer a positive length; fall back to any finite value (including 0). */
function pickDurationSeconds(...values: unknown[]): number | null {
  const nums = values.map(numOrNull).filter((n): n is number => n != null)
  return nums.find((n) => n > 0) ?? nums[0] ?? null
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
  const album = clean(src.album) || clean(src.album_title)
  if (album) out.album = album
  const albumType = clean(src.album_type) || clean(src.release_type) || clean(src.type_hint)
  if (albumType) out.album_type = albumType
  if (overrides) {
    const hasField = ['bpm', 'key_signature', 'genre', 'subgenre', 'title', 'artist', 'year']
      .some((key) => overrides[key as keyof typeof overrides] != null && overrides[key as keyof typeof overrides] !== '')
    if (hasField) out.catalog_overrides = overrides
  }
  return Object.keys(out).length ? out : undefined
}

function isPlaylistContainerFolder(folder: TrackListFolder | null | undefined): boolean {
  if (!folder) return false
  const type = clean(folder.type).toLowerCase()
  if (!type || type === 'folder' || type === 'playlist') return true
  const name = clean(folder.name).toLowerCase()
  return name === 'distrokid exports' || name.endsWith(' exports')
}

function releaseAlbumFields(track: any): { album?: string; albumType?: string } {
  const meta =
    track.metadata && typeof track.metadata === 'object' && !Array.isArray(track.metadata)
      ? (track.metadata as Record<string, unknown>)
      : {}
  const distribution =
    meta.distribution && typeof meta.distribution === 'object' && !Array.isArray(meta.distribution)
      ? (meta.distribution as Record<string, unknown>)
      : {}
  const album =
    clean(meta.album) ||
    clean(meta.album_title) ||
    clean(distribution.release_title) ||
    clean(distribution.releaseTitle) ||
    clean(distribution.album) ||
    clean(track.album) ||
    undefined
  let albumType =
    clean(meta.album_type) ||
    clean(meta.release_type) ||
    clean(meta.type_hint) ||
    clean(distribution.release_type) ||
    clean(distribution.releaseType) ||
    clean(track.albumType) ||
    clean(track.album_type) ||
    undefined
  if (albumType) {
    const normalized = albumType.toLowerCase()
    if (normalized === 'single' || normalized === 'ep' || normalized === 'album') {
      albumType = normalized
    }
  }
  return { album, albumType }
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

  // Crate folders use mosaics for unassigned rows — don't inherit the folder tile
  // cover onto every track (that made one unassigned cover appear on all rows).
  // EP / single / remix folders still share release art with their tracks.
  const folderType = clean(folder?.type).toLowerCase()
  const inheritFolderArt = folderType !== 'album'
  const artworkRaw =
    track.artwork_url ||
    audio?.artwork_url ||
    (inheritFolderArt ? folder?.artwork_url : null) ||
    undefined
  const metadata =
    opts?.includeFullMetadata && track.metadata && typeof track.metadata === 'object'
      ? track.metadata
      : leanCatalogMetadata({
          ...(track.metadata && typeof track.metadata === 'object' ? track.metadata : {}),
          ...(originalDate ? { original_date: originalDate } : {}),
        })

  const release = releaseAlbumFields(track)
  const folderIsPlaylistDump = isPlaylistContainerFolder(folder)
  const album =
    release.album ||
    (!folderIsPlaylistDump ? clean(folder?.name) : '') ||
    undefined
  const albumType =
    release.albumType ||
    (!folderIsPlaylistDump && !release.album ? clean(folder?.type) : '') ||
    undefined

  return {
    id: track.id,
    folderId: track.folder_id,
    audioFileId: track.audio_file_id,
    title,
    artist,
    duration: pickDurationSeconds(audio?.duration_seconds, track.duration),
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
    album,
    albumType,
    track_number: track.track_number,
    disc_number: track.disc_number,
    rating: track.rating,
    play_count: track.play_count,
    last_played_at: track.last_played_at,
    tags: track.tags,
    sort_artist: track.sort_artist,
    // Phase only — include 0 so the player does not re-derive ~½-beat offsets from peaks.
    beat_grid_offset: numOrNull(track.beat_grid_offset),
    // Lean flag when DNA is already on the row (detail/PUT); list stays blob-free.
    grid_manual: (() => {
      const dna = track.sonic_dna
      if (!dna || typeof dna !== 'object') return undefined
      if ((dna as { gridManual?: boolean }).gridManual === true) return true
      const measured = (dna as { measured?: { gridManual?: boolean } }).measured
      return measured?.gridManual === true ? true : undefined
    })(),
    ...(metadata ? { metadata } : {}),
  }
}

/** Normalize a tracks PUT/GET payload whether it is still a DB row or already mapped. */
export function coerceLibraryApiTrack(raw: any) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null
  const looksLikeDbRow =
    raw.folder_id != null ||
    raw.artwork_url != null ||
    raw.file_url != null ||
    raw.audio_file_id != null
  const mapped = looksLikeDbRow
    ? mapLibraryTrackToListItem(raw, {
        includeFullMetadata: true,
        folder: raw.music_library_folders || null,
      })
    : raw
  return {
    ...mapped,
    sonic_dna: raw.sonic_dna ?? mapped.sonic_dna,
    beat_grid_offset:
      mapped.beat_grid_offset ??
      (typeof raw.beat_grid_offset === 'number' ? raw.beat_grid_offset : undefined),
    grid_manual: mapped.grid_manual ?? undefined,
    file: mapped.file || raw.file || '',
    artwork: mapped.artwork || raw.artwork,
    folderId: mapped.folderId || raw.folderId || raw.folder_id,
    audioFileId: mapped.audioFileId || raw.audioFileId || raw.audio_file_id,
    date_created: mapped.date_created || raw.date_created || raw.dateCreated,
  }
}
