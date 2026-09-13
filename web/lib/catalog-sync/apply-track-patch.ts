import { applyAdminBpmToTrack } from '@/lib/audio/track-display'
import { stampCatalogOverrides } from '@/lib/catalog-lock'
import { normalizeArtworkPatch } from './artwork'
import type { CatalogSyncPatch } from './types'

type CatalogTrackLike = {
  id?: string
  title?: string
  artist?: string
  genre?: string
  subgenre?: string
  key_signature?: string
  date?: string
  date_created?: string
  year?: number
  bpm?: number
  artwork?: string
  metadata?: unknown
  beat_grid_offset?: number | null
  sonic_dna?: unknown
}

/** Build a catalog-sync patch from a saved / drafted track. */
export function catalogPatchFromTrack(track: CatalogTrackLike): CatalogSyncPatch {
  const patch: CatalogSyncPatch = {}
  if (track.title != null && String(track.title).trim()) patch.title = String(track.title).trim()
  if (track.artist != null) patch.artist = String(track.artist)
  if (track.genre != null) patch.genre = String(track.genre)
  if (track.subgenre != null) patch.subgenre = String(track.subgenre)
  if (track.key_signature != null) patch.key_signature = String(track.key_signature)
  if (track.date != null) patch.date = String(track.date)
  if (track.date_created != null) patch.date_created = String(track.date_created)
  if (typeof track.year === 'number' && Number.isFinite(track.year)) patch.year = track.year
  if (typeof track.bpm === 'number' && Number.isFinite(track.bpm)) patch.bpm = track.bpm
  if (track.artwork !== undefined) patch.artwork = track.artwork || null
  if (typeof track.beat_grid_offset === 'number' && Number.isFinite(track.beat_grid_offset)) {
    patch.beat_grid_offset = track.beat_grid_offset
  }
  if (track.sonic_dna !== undefined) patch.sonic_dna = track.sonic_dna
  return patch
}

export function catalogTrackPatchHasFields(patch: CatalogSyncPatch): boolean {
  return (
    patch.title !== undefined ||
    patch.artist !== undefined ||
    patch.genre !== undefined ||
    patch.subgenre !== undefined ||
    patch.key_signature !== undefined ||
    patch.date !== undefined ||
    patch.date_created !== undefined ||
    patch.year !== undefined ||
    typeof patch.bpm === 'number' ||
    typeof patch.beat_grid_offset === 'number' ||
    patch.sonic_dna !== undefined
  )
}

/**
 * Apply an edit-track catalog patch, including catalog_overrides so Songs
 * columns (displayTrack*) read the saved values instead of stale locks.
 */
export function applyCatalogTrackPatch<T extends Record<string, any>>(
  track: T,
  patch: CatalogSyncPatch,
): T {
  const catalogUpdates: Record<string, unknown> = {}
  const next: Record<string, unknown> = { ...track }

  if (patch.title !== undefined) {
    next.title = patch.title
    catalogUpdates.title = patch.title
  }
  if (patch.artist !== undefined) {
    next.artist = patch.artist
    catalogUpdates.artist = patch.artist
  }
  if (patch.genre !== undefined) {
    next.genre = patch.genre
    catalogUpdates.genre = patch.genre
  }
  if (patch.subgenre !== undefined) {
    next.subgenre = patch.subgenre
    catalogUpdates.subgenre = patch.subgenre
  }
  if (patch.key_signature !== undefined) {
    next.key_signature = patch.key_signature
    catalogUpdates.key_signature = patch.key_signature
  }
  if (patch.date !== undefined) next.date = patch.date
  if (patch.date_created !== undefined) next.date_created = patch.date_created
  if (patch.year !== undefined) {
    next.year = patch.year
    catalogUpdates.year = patch.year
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'artwork')) {
    next.artwork = normalizeArtworkPatch(patch.artwork ?? null) ?? undefined
  }

  let result = next as T
  if (Object.keys(catalogUpdates).length) {
    result = {
      ...result,
      metadata: stampCatalogOverrides(result.metadata, catalogUpdates),
    }
  }
  if (typeof patch.bpm === 'number') {
    result = applyAdminBpmToTrack(result, patch.bpm)
  }
  if (typeof patch.beat_grid_offset === 'number' && Number.isFinite(patch.beat_grid_offset)) {
    result = { ...result, beat_grid_offset: patch.beat_grid_offset }
  }
  if (patch.sonic_dna !== undefined) {
    result = { ...result, sonic_dna: patch.sonic_dna }
    const dna = patch.sonic_dna
    if (dna && typeof dna === 'object') {
      const manual =
        (dna as { gridManual?: boolean }).gridManual === true ||
        (dna as { measured?: { gridManual?: boolean } }).measured?.gridManual === true
      if (manual) result = { ...result, grid_manual: true }
    }
  }
  return result
}
