/**
 * SoundCloud-style share links for vault tracks and folders (EPs/albums).
 */

export type ShareKind = 'track' | 'folder'
export type ShareVisibility = 'public' | 'unlisted' | 'disabled'

export type MusicShareLinkRow = {
  id: string
  token: string
  kind: ShareKind
  target_id: string
  visibility: ShareVisibility
  title_override: string | null
  created_by: string | null
  expires_at: string | null
  revoked_at: string | null
  play_count: number
  last_played_at: string | null
  created_at: string
  updated_at: string
}

export type ShareTrackPayload = {
  id: string
  title: string
  artist: string
  duration: number
  artwork?: string
  album?: string
  file: string
  folderId?: string
  audioFileId?: string
  /** Short-lived playback URL when resolved server-side. */
  playbackUrl?: string | null
}

export type ShareCollectionPayload = {
  id: string
  title: string
  type: string
  artwork?: string
  artist?: string
  year?: number | null
  trackCount: number
  hidden: boolean
}

export type ResolvedSharePayload = {
  share: {
    token: string
    kind: ShareKind
    visibility: ShareVisibility
    title: string
  }
  collection: ShareCollectionPayload | null
  tracks: ShareTrackPayload[]
  urls: {
    listen: string
    embed: string
    embedHtml: string
  }
}

/** Canonical live domain — used when SITE_URL is missing or still points at localhost. */
export const DEFAULT_PUBLIC_SITE_ORIGIN = 'https://sergikdropz.com'

function stripTrailingSlash(origin: string): string {
  return origin.replace(/\/$/, '')
}

function normalizeOriginCandidate(raw: string | null | undefined): string | null {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProto)
    if (!url.hostname) return null
    return stripTrailingSlash(`${url.protocol}//${url.host}`)
  } catch {
    return null
  }
}

function vercelDeployOrigin(): string | null {
  // Prefer the production hostname over preview deployment URLs.
  const prod = normalizeOriginCandidate(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  if (prod && !isLocalDevOrigin(prod)) return prod
  const preview = normalizeOriginCandidate(process.env.VERCEL_URL)
  if (preview && !isLocalDevOrigin(preview)) return preview
  return null
}

function isVercelOrProductionRuntime(): boolean {
  return (
    process.env.VERCEL === '1' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production'
  )
}

/**
 * Env-based site origin. On Vercel / production never returns localhost even if
 * NEXT_PUBLIC_SITE_URL was mis-set to 127.0.0.1 (common local .env leak into deploy).
 */
export function siteOrigin(): string {
  const fromEnv = normalizeOriginCandidate(process.env.NEXT_PUBLIC_SITE_URL)
  if (fromEnv && !isLocalDevOrigin(fromEnv)) return fromEnv

  const fromVercel = vercelDeployOrigin()
  if (fromVercel) return fromVercel

  if (isVercelOrProductionRuntime()) return DEFAULT_PUBLIC_SITE_ORIGIN

  return fromEnv || 'http://localhost:3001'
}

export function isLocalDevOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'
  } catch {
    return /localhost|127\.0\.0\.1/i.test(origin)
  }
}

/**
 * Resolve the public origin for share links.
 * Prefer the incoming request host so a mis-set NEXT_PUBLIC_SITE_URL
 * (e.g. http://127.0.0.1:3001 on the live deploy) cannot poison copied links.
 */
export function originFromHeaders(headers: Headers): string | null {
  const hostRaw = headers.get('x-forwarded-host') || headers.get('host')
  if (!hostRaw) return null
  const host = hostRaw.split(',')[0].trim()
  if (!host) return null
  const protoRaw = headers.get('x-forwarded-proto')
  const proto = (protoRaw?.split(',')[0].trim() || (isLocalDevOrigin(`http://${host}`) ? 'http' : 'https')).replace(
    /:$/,
    '',
  )
  return `${proto}://${host}`.replace(/\/$/, '')
}

export function resolvePublicOrigin(headers?: Headers | null, browserOrigin?: string | null): string {
  const fromRequest = headers ? originFromHeaders(headers) : null
  const fromBrowser = normalizeOriginCandidate(browserOrigin)
  const fromEnv = normalizeOriginCandidate(process.env.NEXT_PUBLIC_SITE_URL)
  const fromVercel = vercelDeployOrigin()

  if (fromRequest && !isLocalDevOrigin(fromRequest)) return fromRequest
  if (fromBrowser && !isLocalDevOrigin(fromBrowser)) return fromBrowser
  if (fromEnv && !isLocalDevOrigin(fromEnv)) return fromEnv
  if (fromVercel) return fromVercel

  // Live deploy with poisoned SITE_URL + missing Host → never emit localhost.
  if (isVercelOrProductionRuntime()) return DEFAULT_PUBLIC_SITE_ORIGIN

  if (fromRequest) return fromRequest
  if (fromBrowser) return fromBrowser
  return fromEnv || 'http://localhost:3001'
}

export function listenPathForToken(token: string): string {
  return `/s/${encodeURIComponent(token)}`
}

export function embedPathForToken(token: string): string {
  return `/embed/${encodeURIComponent(token)}`
}

export function listenUrlForToken(token: string, origin = siteOrigin()): string {
  return `${origin}${listenPathForToken(token)}`
}

export function embedUrlForToken(token: string, origin = siteOrigin()): string {
  return `${origin}${embedPathForToken(token)}`
}

/** Default iframe height so Cover/Disc/Sleeve + dock formula fits. */
export const SHARE_EMBED_HEIGHT = 560

export function embedHtmlSnippet(
  token: string,
  origin = siteOrigin(),
  height = SHARE_EMBED_HEIGHT,
): string {
  const src = embedUrlForToken(token, origin)
  return `<iframe width="100%" height="${height}" scrolling="no" frameborder="no" allow="autoplay; encrypted-media" src="${src}"></iframe>`
}

/**
 * Absolute cover URL for Open Graph / iMessage / IG link previews.
 * Relative site paths become absolute; cross-origin vault URLs go through
 * the same-origin artwork proxy so crawlers can fetch them.
 */
export function absoluteShareOgImageUrl(
  image: string | null | undefined,
  origin: string,
): string | null {
  const raw = String(image || '').trim()
  if (!raw) return null
  const base = origin.replace(/\/$/, '') || DEFAULT_PUBLIC_SITE_ORIGIN

  if (raw.startsWith('/api/shares/artwork-proxy')) {
    return `${base}${raw}`
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const img = new URL(raw)
      const site = new URL(base.startsWith('http') ? base : `https://${base}`)
      if (img.origin === site.origin) return raw
      return `${site.origin}/api/shares/artwork-proxy?src=${encodeURIComponent(raw)}`
    } catch {
      return raw
    }
  }

  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/')) return `${base}${raw}`
  return `${base}/${raw}`
}

/**
 * Browser/img src for share UI — prefer the direct URL (Supabase/R2 CDN).
 * Proxying every cover through Next.js made mobile loads very slow.
 */
export function shareDisplayArtworkUrl(artwork?: string | null): string | undefined {
  const raw = String(artwork || '').trim()
  if (!raw) return undefined
  return raw
}

/**
 * Same-origin URL for canvas accent sampling when the CDN blocks CORS.
 */
export function shareAccentArtworkUrl(artwork?: string | null): string | undefined {
  const raw = String(artwork || '').trim()
  if (!raw) return undefined
  if (raw.startsWith('data:') || raw.startsWith('/api/shares/artwork-proxy')) return raw
  if (raw.startsWith('/')) return raw
  return `/api/shares/artwork-proxy?src=${encodeURIComponent(raw)}`
}

/** Prefer track art, then collection/folder art. */
export function pickShareArtwork(
  payload: Pick<ResolvedSharePayload, 'collection' | 'tracks'>,
  trackIndex = 0,
): string | undefined {
  const track = payload.tracks[trackIndex] || payload.tracks[0]
  return track?.artwork || payload.collection?.artwork || undefined
}

export function createShareToken(bytes = 18): string {
  const buf = new Uint8Array(bytes)
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random unavailable')
  }
  cryptoApi.getRandomValues(buf)
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]!)
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(buf).toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isShareActive(row: Pick<MusicShareLinkRow, 'visibility' | 'revoked_at' | 'expires_at'>, now = Date.now()): boolean {
  if (row.revoked_at) return false
  if (row.visibility === 'disabled') return false
  if (row.expires_at) {
    const exp = Date.parse(row.expires_at)
    if (Number.isFinite(exp) && exp <= now) return false
  }
  return true
}

export function isMissingShareTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  const msg = String(error.message || '')
  return /music_share_links/i.test(msg) && /does not exist|Could not find|schema cache/i.test(msg)
}
