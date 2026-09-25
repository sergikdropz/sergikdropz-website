/** Shared artwork URL rules for share UI (client + server, no Node fs). */

export function preferLocalArtworkMasters(opts?: {
  siteUrl?: string
  hostname?: string
}): boolean {
  if (process.env.NEXT_PUBLIC_LOCAL_AUDIO === '1') return true
  const site = opts?.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const host =
    opts?.hostname ??
    (typeof window !== 'undefined' ? window.location.hostname : '')
  if (/localhost|127\.0\.0\.1/i.test(host)) return true
  if (/localhost|127\.0\.0\.1/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')) {
    return true
  }
  return /localhost|127\.0\.0\.1/i.test(site)
}

export function isStorageArtworkUrl(url: string): boolean {
  return (
    /\/object\/(?:public|sign)\/audio-files\/artwork\//i.test(url) ||
    /\/audio-files\/artwork\//i.test(url)
  )
}

export function localArtworkPathToStorageUrl(pathOnly: string): string | null {
  const file = pathOnly.split('/').pop()
  if (!file || !/^folder-[^/]+\.(jpe?g|png|webp|gif|avif)$/i.test(file)) return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')
  if (!base) return null
  let decoded = file
  try {
    decoded = decodeURIComponent(file)
  } catch {
    /* keep */
  }
  return `${base}/storage/v1/object/public/audio-files/artwork/${encodeURIComponent(decoded)}`
}

function withQueryBust(baseUrl: string, raw: string): string {
  const v = raw.match(/[?&]v=([^&]+)/)?.[1]
  if (!v) return baseUrl
  const sep = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${sep}v=${encodeURIComponent(v)}`
}

/**
 * On live deploys, use Supabase artwork (admin sync) instead of immutable
 * `/images/audio/artwork/*` static files on Vercel.
 */
export function rewriteShareArtworkForLiveDisplay(
  artwork: string,
  opts?: { siteUrl?: string; hostname?: string },
): string {
  const raw = artwork.trim()
  if (!raw || preferLocalArtworkMasters(opts)) return raw
  if (isStorageArtworkUrl(raw)) return raw

  const pathOnly = raw.split('?')[0]
  if (pathOnly.startsWith('/images/audio/artwork/')) {
    const storage = localArtworkPathToStorageUrl(pathOnly)
    if (storage) return withQueryBust(storage, raw)
  }

  return raw
}
