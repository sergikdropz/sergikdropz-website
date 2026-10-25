/**
 * Hosts that Next.js can optimize via remotePatterns in next.config.js.
 * Keep in sync with that config.
 */
const OPTIMIZABLE_HOSTS = [
  '.scdn.co',
  '.spotifycdn.com',
  'img.youtube.com',
  'i.ytimg.com',
  '.supabase.co',
  '.cdninstagram.com',
  '.fbcdn.net',
  '.instagram.com',
  '.trycloudflare.com',
  '.sndcdn.com',
  // DistroKid / Fandalism artwork (also allowlisted in next.config.js)
  's3.amazonaws.com',
  '.amazonaws.com',
  '.fandalism.com',
]

function stripUrlQuery(src: string): string {
  const idx = src.indexOf('?')
  return idx === -1 ? src : src.slice(0, idx)
}

/** Shipped folder masters under `public/images/audio/artwork`. */
export function isLocalFolderArtworkPath(src: string): boolean {
  let decoded = src
  try {
    decoded = decodeURIComponent(src)
  } catch {
    /* keep raw */
  }
  return (
    /\/images\/audio\/artwork\//i.test(decoded) ||
    /\/images\/audio\/artwork\//i.test(stripUrlQuery(src))
  )
}

/** JPEG/PNG/WebP we host. HEIC is excluded — browsers cannot paint it. */
function isOwnDisplayableRaster(src: string): boolean {
  const path = stripUrlQuery(src)
  if (!/\.(jpe?g|png|webp|gif)$/i.test(path)) return false
  return (
    isResizableArtworkPath(src) ||
    path.includes('/images/') ||
    /gallery-images/i.test(src) ||
    /\/audio-files\/artwork\//i.test(src)
  )
}
function isResizableArtworkPath(src: string): boolean {
  return (
    isLocalFolderArtworkPath(src) ||
    /\/audio-files\/artwork\//i.test(src) ||
    /\/object\/(?:public|sign)\/audio-files\/artwork\//i.test(src)
  )
}

/** Huge EP UUID / legacy masters — next/image rejects or chokes on multi‑MB sources. */
function isHeavyUnreleasedMaster(src: string): boolean {
  return /\/images\/audio\/unreleased\//i.test(src) || /\/unreleased\/eps\//i.test(src)
}

/**
 * Determine if an image should skip Next.js optimization.
 *
 * Remote URLs that match our configured remotePatterns ARE optimized
 * (resized, converted to WebP/AVIF, cached). Only URLs from unknown
 * hosts and local paths with special characters need the escape hatch.
 *
 * Folder covers are served as the file itself. Full-resolution EP masters stay unoptimized too.
 */
export function shouldUnoptimizeImage(src: string): boolean {
  let decoded = src
  try {
    decoded = decodeURIComponent(src)
  } catch {
    /* keep raw */
  }

  if (src.startsWith('blob:') || src.startsWith('data:')) return true

  // Local folder JPEGs use `?v=` cache bust — next/image 400s when the inner url has a query.
  // Serve native `/images/...?v=` so overwrites refresh (optimizer CDN would ignore bust anyway).
  if (isLocalFolderArtworkPath(src) || isLocalFolderArtworkPath(decoded)) {
    return true
  }

  // Our own JPEG/PNG/WebP masters. The browser can show these. Sending them
  // through /_next/image re-decodes the file on Vercel and swaps srcsets, which
  // is the cover flash. HEIC still needs the optimizer because browsers cannot show it.
  if (isOwnDisplayableRaster(decoded) || isOwnDisplayableRaster(src)) {
    return true
  }

  // Multi-MB EP masters under unreleased/ — do not send through the optimizer.
  if (isHeavyUnreleasedMaster(decoded) || isHeavyUnreleasedMaster(src)) {
    return true
  }

  // Other vault audio image paths (non-artwork) — keep unoptimized.
  if (decoded.includes('/images/audio/') || src.includes('/images/audio/')) return true

  if (src.includes('storage.local.invalid') || src.includes('.invalid/')) return true

  if (src.startsWith('http://') || src.startsWith('https://')) {
    try {
      const { hostname } = new URL(src)
      if (hostname.endsWith('.invalid')) return true
      const isOptimizable = OPTIMIZABLE_HOSTS.some(
        (h) => hostname === h.replace(/^\./, '') || hostname.endsWith(h),
      )
      return !isOptimizable
    } catch {
      return true
    }
  }

  return /[ &'()]/.test(decoded)
}

/** next/image throws on unknown remote hosts (e.g. storage.local.invalid). */
export function isSafeNextImageSrc(src: string): boolean {
  if (!src?.trim()) return false
  if (src.startsWith('/') || src.startsWith('data:') || src.startsWith('blob:')) return true
  try {
    const { hostname } = new URL(src)
    return !hostname.endsWith('.invalid')
  } catch {
    return false
  }
}

/** Grid / sidebar thumbs — half quality, small display width. */
export const COVER_THUMB_QUALITY = 50
/** EP stage / lightbox — only used when hero still goes through the optimizer. */
export const COVER_HERO_QUALITY = 100

export const COVER_THUMB_SIZES =
  '(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 160px'
/** Full-width EP stage (~1000px panels) — avoid undersized srcset caps. */
export const COVER_HERO_SIZES = '(max-width: 768px) 100vw, 1400px'

/**
 * EP stage / art viewer — serve native JPEG/PNG masters (no WebP re-encode or width cap).
 */
export function shouldUnoptimizeHeroCover(src: string): boolean {
  let decoded = src
  try {
    decoded = decodeURIComponent(src)
  } catch {
    /* keep raw */
  }

  if (src.startsWith('blob:') || src.startsWith('data:')) return true

  if (isResizableArtworkPath(src) || isResizableArtworkPath(decoded)) return true
  if (isHeavyUnreleasedMaster(decoded) || isHeavyUnreleasedMaster(src)) return true
  if (decoded.includes('/images/audio/') || src.includes('/images/audio/')) return true

  if (src.startsWith('http://') || src.startsWith('https://')) {
    try {
      const { hostname } = new URL(src)
      if (hostname.endsWith('.invalid')) return true
      // DistroKid / Storage / CDN — load the remote master as-is on hero surfaces.
      return true
    } catch {
      return true
    }
  }

  return shouldUnoptimizeImage(src)
}
