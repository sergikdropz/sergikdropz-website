import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { folderIdFromPlaylistId } from './ids'

export function stripArtworkCacheBust(url: string): string {
  return url.trim().split('?')[0]
}

export function withArtworkCacheBust(url: string): string {
  const base = stripArtworkCacheBust(url)
  if (!base) return ''
  return `${base}?v=${Date.now()}`
}

export function normalizeArtworkPatch(artwork: string | null | undefined): string | undefined {
  if (artwork == null) return undefined
  const base = stripArtworkCacheBust(artwork)
  if (!base) return undefined
  return withArtworkCacheBust(base)
}

/** Strip `playlist-` / `folder-` prefixes so collection ids compare equal. */
export function normalizeCollectionId(id: string): string {
  let next = folderIdFromPlaylistId(id.trim())
  if (next.startsWith('folder-')) next = next.slice('folder-'.length)
  return next
}

export function collectionIdFromArtwork(artwork?: string | null): string | null {
  if (!artwork) return null
  const path = stripArtworkCacheBust(artwork)
  const match = path.match(/(?:^|\/)folder-([^/.]+)\.[a-z0-9]+$/i) || path.match(/folder-([^/.]+)/i)
  return match?.[1] || null
}

/** Stamp the same cover onto every track in a collection list. */
export function stampAllTrackArtwork<T extends { artwork?: string }>(
  tracks: T[],
  artwork: string | undefined,
): T[] {
  if (!tracks.length) return tracks
  let changed = false
  const next = tracks.map((track) => {
    if (track.artwork === artwork) return track
    changed = true
    return { ...track, artwork }
  })
  return changed ? next : tracks
}

export function catalogItemMatchesCoverEvent(
  item: { id?: string; artwork?: string },
  folderId?: string | null,
): boolean {
  if (!folderId) return false
  const wanted = normalizeCollectionId(folderId)
  if (!wanted) return false
  if (item.id && normalizeCollectionId(item.id) === wanted) return true
  const fromArt = collectionIdFromArtwork(item.artwork)
  return Boolean(fromArt && normalizeCollectionId(fromArt) === wanted)
}

export function playerTrackMatchesCoverEvent(
  track: {
    id?: string
    folderId?: string
    folder_id?: string
    folder?: string
    artwork?: string
  },
  opts: {
    folderId?: string | null
    trackId?: string | null
    sourceFolderId?: string | null
  },
): boolean {
  if (opts.trackId && track.id === opts.trackId) return true
  if (
    opts.sourceFolderId &&
    opts.folderId &&
    normalizeCollectionId(opts.sourceFolderId) === normalizeCollectionId(opts.folderId)
  ) {
    return true
  }
  const candidates = [opts.folderId, opts.sourceFolderId].filter(Boolean) as string[]
  if (!candidates.length) return false
  const wanted = new Set(candidates.map(normalizeCollectionId).filter(Boolean))
  const trackFolder = track.folderId || track.folder_id
  if (trackFolder && wanted.has(normalizeCollectionId(trackFolder))) return true
  if (track.folder && wanted.has(normalizeCollectionId(track.folder))) return true
  const fromArt = collectionIdFromArtwork(track.artwork)
  return Boolean(fromArt && wanted.has(normalizeCollectionId(fromArt)))
}

export function isUploadedFolderArtwork(url?: string | null): boolean {
  if (!url) return false
  const path = stripArtworkCacheBust(resolveImageUrl(url) || url)
  if (path.startsWith('/images/audio/artwork/')) return true
  // Cloud Storage folder covers (audio-files bucket) must survive browse refreshes.
  if (/\/audio-files\/artwork\//i.test(path)) return true
  if (/\/object\/(?:public|sign)\/audio-files\/artwork\//i.test(path)) return true
  return false
}

/**
 * True when the track carries unique cover art (not a stamped folder / crate cover).
 * Folder systemic covers use `folder-{id}.*` filenames and should fall back to mosaics.
 * EP release paths under `/unreleased/eps/` count as real artwork.
 */
export function trackHasOwnArtwork(track: {
  artwork?: string | null
  folderId?: string | null
  folder_id?: string | null
  folder?: string | null
}): boolean {
  const art = typeof track.artwork === 'string' ? track.artwork.trim() : ''
  if (!art) return false
  const path = stripArtworkCacheBust(resolveImageUrl(art) || art)
  if (/\/unreleased\/eps\//i.test(path)) return true
  const fromArt = collectionIdFromArtwork(art)
  if (!fromArt) return true
  const folderKey = normalizeCollectionId(
    String(track.folderId || track.folder_id || track.folder || ''),
  )
  if (folderKey && normalizeCollectionId(fromArt) === folderKey) return false
  // `folder-*` cover that doesn't match this track's folder — still treat as shared cover.
  if (isUploadedFolderArtwork(art)) return false
  return true
}

/** EP folders / release paths — never use crate mosaics for these. */
export function trackLooksLikeEp(track: {
  albumType?: string | null
  folderId?: string | null
  folder_id?: string | null
  folder?: string | null
  artwork?: string | null
} | null | undefined): boolean {
  if (!track) return false
  if (String(track.albumType || '').toLowerCase() === 'ep') return true
  const folder = String(track.folderId || track.folder_id || track.folder || '')
  if (/unreleased-eps/i.test(folder)) return true
  if (/collection-[^-]*-eps?-/i.test(folder)) return true
  const art = typeof track.artwork === 'string' ? track.artwork : ''
  if (/\/unreleased\/eps\//i.test(art)) return true
  return false
}

/** EPs keep a single release cover; crates / bare tracks without own art use mosaics. */
export function trackShouldUseCrateMosaic(track: {
  artwork?: string | null
  albumType?: string | null
  folderId?: string | null
  folder_id?: string | null
  folder?: string | null
} | null | undefined): boolean {
  if (!track) return false
  if (trackLooksLikeEp(track)) return false
  return !trackHasOwnArtwork(track)
}

const IMAGE_FILE_EXT = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i
const HEIC_EXT = /\.(heic|heif)$/i
const HEIC_MIME = /image\/hei[cf]/i

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return IMAGE_FILE_EXT.test(file.name || '')
}

/** HEIC bytes saved as .jpg decode as a broken image and the cover appears to vanish. */
export function artworkUploadRejectReason(file: File): string | null {
  const name = file.name || ''
  const type = file.type || ''
  if (HEIC_EXT.test(name) || HEIC_MIME.test(type)) {
    return 'HEIC/HEIF photos can’t be used as cover art. Export as JPG or PNG and try again.'
  }
  if (!isImageFile(file)) {
    return 'Please choose an image file (JPG, PNG, GIF, WebP, …)'
  }
  return null
}
