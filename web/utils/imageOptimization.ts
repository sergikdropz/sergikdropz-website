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
]

/**
 * Determine if an image should skip Next.js optimization.
 *
 * Remote URLs that match our configured remotePatterns ARE optimized
 * (resized, converted to WebP/AVIF, cached). Only URLs from unknown
 * hosts and local paths with special characters need the escape hatch.
 */
export function shouldUnoptimizeImage(src: string): boolean {
  if (src.startsWith('http://') || src.startsWith('https://')) {
    try {
      const { hostname } = new URL(src)
      const isOptimizable = OPTIMIZABLE_HOSTS.some(
        (h) => hostname === h.replace(/^\./, '') || hostname.endsWith(h),
      )
      return !isOptimizable
    } catch {
      return true
    }
  }

  return /[ &'()]/.test(src)
}
