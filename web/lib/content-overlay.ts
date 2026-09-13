/** DOM id for portaled overlays scoped to the public music library main column. */
export const MUSIC_LIBRARY_OVERLAY_HOST_ID = 'music-library-overlay-host'

/** Overlay within a `relative` page shell (e.g. MusicLibraryMain). */
export const CONTENT_AREA_OVERLAY_CLASS =
  'pointer-events-auto absolute inset-0 z-[10000] flex items-center justify-center bg-black/70 px-4 sm:px-6'

/** Full-viewport overlay when no content host is available. */
export const VIEWPORT_OVERLAY_CLASS =
  'pointer-events-auto fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 px-4 sm:px-6'
