/**
 * Shared HTML5 drag MIME + parsers for vault library ↔ player queue.
 * Playlist organize still uses track-id MIME; queue override uses full track payload.
 */

export const SERGIK_PLAYLIST_DRAG_MIME = 'application/x-sergik-playlist-tracks'
/** Full Track objects for drop targets that cannot resolve IDs (e.g. MusicPlayer queue). */
export const SERGIK_LIBRARY_TRACKS_DRAG_MIME = 'application/x-sergik-library-tracks'

export type LibraryDragTrack = {
  id: string
  title?: string
  artist?: string
  duration?: number
  file?: string
  [key: string]: unknown
}

export function libraryDragHasTracks(dt: DataTransfer | null): boolean {
  if (!dt) return false
  const types = Array.from(dt.types || [])
  if (types.includes(SERGIK_LIBRARY_TRACKS_DRAG_MIME)) return true
  if (types.includes(SERGIK_PLAYLIST_DRAG_MIME)) return true
  // Chrome/Safari often omit custom MIME from `types` during dragover; row drags also set text/plain.
  return types.includes('text/plain') && !types.includes('Files')
}

export function parsePlaylistDragTrackIds(raw: string): string[] {
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
  } catch {
    /* csv fallback */
  }
  return raw.split(',').map((part) => part.trim()).filter(Boolean)
}

export function parseLibraryDragTracks(dt: DataTransfer | null): LibraryDragTrack[] {
  if (!dt) return []
  const raw = dt.getData(SERGIK_LIBRARY_TRACKS_DRAG_MIME)
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (t): t is LibraryDragTrack =>
        Boolean(t && typeof t === 'object' && typeof (t as LibraryDragTrack).id === 'string'),
    )
  } catch {
    return []
  }
}

export function readLibraryDragTrackIds(dt: DataTransfer | null): string[] {
  if (!dt) return []
  const fromPayload = parseLibraryDragTracks(dt)
  if (fromPayload.length) return fromPayload.map((t) => t.id)
  const raw =
    dt.getData(SERGIK_PLAYLIST_DRAG_MIME) || dt.getData('text/plain')
  return parsePlaylistDragTrackIds(raw)
}

/** Keep current (and prior) queue slots; replace everything after the playing track. */
export function overrideUpcomingQueue<T extends { id: string }>(
  queue: T[],
  currentQueueIndex: number,
  incoming: T[],
): T[] {
  if (!incoming.length) return queue
  if (currentQueueIndex >= 0) {
    return [...queue.slice(0, currentQueueIndex + 1), ...incoming]
  }
  return [...incoming]
}

export function setLibraryTrackDragData(
  dt: DataTransfer,
  tracks: LibraryDragTrack[],
  options?: { effectAllowed?: DataTransfer['effectAllowed'] },
): void {
  const ids = tracks.map((t) => String(t.id)).filter(Boolean)
  dt.setData(SERGIK_PLAYLIST_DRAG_MIME, JSON.stringify(ids))
  dt.setData(SERGIK_LIBRARY_TRACKS_DRAG_MIME, JSON.stringify(tracks))
  dt.setData('text/plain', ids.join(','))
  dt.effectAllowed = options?.effectAllowed ?? 'copy'
}
