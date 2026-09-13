/**
 * Edge / CDN playback URLs must stay intact (presigned query strings included).
 * Tunnel and same-origin proxy URLs are fallbacks, not destinations.
 */

const TUNNEL_HOST =
  /(?:^|\.)trycloudflare\.com$|(?:^|\.)ngrok(?:-free)?\.(?:dev|app|io)$|ngrok-free\.dev/i

const EDGE_HOST =
  /(?:^|\.)r2\.cloudflarestorage\.com$|(?:^|\.)r2\.dev$/i

export function isStaleTunnelUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    if (!/^https?:\/\//i.test(url)) return /trycloudflare|ngrok/i.test(url)
    return TUNNEL_HOST.test(new URL(url).hostname)
  } catch {
    return /trycloudflare|ngrok/i.test(url)
  }
}

export function isMediaProxyUrl(url: string): boolean {
  return typeof url === 'string' && url.includes('/api/audio/media/')
}

export function configuredMediaCdnBase(): string | null {
  const base = (
    process.env.NEXT_PUBLIC_MEDIA_CDN_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
    process.env.R2_PUBLIC_BASE_URL ||
    ''
  ).replace(/\/+$/, '')
  if (!base || !/^https?:\/\//i.test(base)) return null
  if (isStaleTunnelUrl(base)) return null
  if (/sergikdropz\.com\/api|127\.0\.0\.1|localhost/i.test(base)) return null
  return base
}

export function isEdgePlaybackUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  if (!/^https?:\/\//i.test(url)) return false
  if (isStaleTunnelUrl(url)) return false
  if (isMediaProxyUrl(url)) return false
  try {
    const parsed = new URL(url)
    if (EDGE_HOST.test(parsed.hostname)) return true
    const cdn = configuredMediaCdnBase()
    if (cdn) {
      const cdnHost = new URL(cdn).hostname
      if (parsed.hostname === cdnHost) return true
    }
    return false
  } catch {
    return false
  }
}

/** Server + client: presigned R2 as `<audio src>` only when CORS is confirmed. */
export function isR2BrowserPlayEnabled(): boolean {
  // Hard-off. Range GET + ACAO can succeed while <audio crossOrigin="anonymous">
  // still fails (SW, cache, or a signed URL the element cannot use). Playback
  // stays on same-origin /api/audio/media until that path is proven in-browser.
  return false
}

export function isSignedEdgeUrl(url: string): boolean {
  if (!isEdgePlaybackUrl(url)) return false
  try {
    const parsed = new URL(url)
    return (
      parsed.searchParams.has('X-Amz-Signature') ||
      parsed.searchParams.has('X-Amz-Algorithm')
    )
  } catch {
    return false
  }
}

export function isDirectPlayableUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('blob:')) return true
  if (isMediaProxyUrl(url)) return true
  if (process.env.NEXT_PUBLIC_LOCAL_AUDIO === '1' && url.startsWith('/audio/')) return true
  // Private R2 is only browser-safe after bucket CORS + the play flag.
  if (isR2BrowserPlayEnabled() && (isSignedEdgeUrl(url) || isEdgePlaybackUrl(url))) {
    return true
  }
  return false
}

export function shouldPreferResolveOverProxy(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  if (isDirectPlayableUrl(url)) return false
  return isMediaProxyUrl(url) || isStaleTunnelUrl(url)
}
