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
]

/**
 * Determine if an image should skip Next.js optimization.
 *
 * Remote URLs that match our configured remotePatterns ARE optimized
 * (resized, converted to WebP/AVIF, cached). Only URLs from unknown
 * hosts and local paths with special characters need the escape hatch.
 */
export function shouldUnoptimizeImage(src: string): boolean {
  let decoded = src
  try {
    decoded = decodeURIComponent(src)
  } catch {
    /* keep raw */
  }

  // EP masters are 2–19MB; the Next optimizer rejects large sources.
  // Production Supabase Storage is currently failing (health.storage=error),
  // so never proxy those hosts through /_next/image.
  if (decoded.includes('/images/audio/') || src.includes('/images/audio/')) return true
  if (src.includes('supabase.co')) return true
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
