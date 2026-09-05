/**
 * WAV masters were migrated to MP3 in Supabase `audio-files` bucket.
 * Stale clients may still hold .wav URLs (localStorage, SW, old bundles).
 * Rewrite known vault URLs/paths to .mp3 so playback hits existing objects.
 *
 * When the app is pointed at the home-server (localhost API) or
 * NEXT_PUBLIC_LOCAL_AUDIO=1, rewrite Storage URLs to local files under /audio/
 * (web/public/audio).
 *
 * NEXT_PUBLIC_AUDIO_BASE_URL names the upstream media origin (a tunnel to the
 * home-server). Playback never points at it directly: an <audio> element cannot
 * send the header that bypasses the tunnel's browser interstitial, so we emit a
 * same-origin `/api/audio/media/...` URL and let the server proxy it. That keeps
 * production and local development on the same URL shape.
 *
 * Important: Supabase URL may itself be a tunnel host (home-server). Those
 * URLs still use `/storage/v1/object/public/audio-files/...` while the media
 * server only serves `/audio/...` — always rewrite the storage marker path.
 *
 * Also unwrap absolute media URLs (`https://any-host/audio/...`) and never
 * nest a full URL inside `/audio/...` (that caused CORS 404s on prod).
 */

const STORAGE_MARKER = '/object/public/audio-files/'
const AUDIO_PREFIX = '/audio/'
/** Must be tested before AUDIO_PREFIX — it contains "/audio/" as a substring. */
const MEDIA_PROXY_PREFIX = '/api/audio/media/'
const AUDIO_EXTENSION = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aiff?|webm)$/i
/** data:, file:, javascript: … anything that is not an http(s) URL or a bare path. */
const NON_HTTP_SCHEME = /^(?!https?:)[a-z][a-z0-9+.-]*:/i

/**
 * Remove a known media prefix from a path, so normalizing an already-normalized
 * URL is a no-op instead of nesting `/api/audio/media/` inside itself.
 */
function stripMediaPrefix(path: string): string | null {
  const lower = path.toLowerCase()
  const proxyIdx = lower.indexOf(MEDIA_PROXY_PREFIX)
  if (proxyIdx >= 0) return path.slice(proxyIdx + MEDIA_PROXY_PREFIX.length)
  const audioIdx = lower.indexOf(AUDIO_PREFIX)
  if (audioIdx >= 0) return path.slice(audioIdx + AUDIO_PREFIX.length)
  return null
}

function safeDecode(value: string): string {
  try {
    if (/%[0-9A-Fa-f]{2}/.test(value)) return decodeURIComponent(value)
  } catch {
    // keep
  }
  return value
}

/**
 * Storage-relative vault path (no leading slash, no /audio/ prefix).
 * Returns null when the input is not a recognizable vault audio reference.
 *
 * By default rewrites `.wav` → `.mp3` (cloud masters were migrated). Pass
 * `{ preferMp3: false }` for local static files that may still be WAV-only.
 */
export function extractVaultRelativePath(
  urlOrPath: string,
  options?: { preferMp3?: boolean },
): string | null {
  if (!urlOrPath || typeof urlOrPath !== 'string') return null
  const preferMp3 = options?.preferMp3 !== false
  let value = urlOrPath.trim()
  if (!value || NON_HTTP_SCHEME.test(value)) return null

  value = value.split('?')[0].split('#')[0]

  // Nested mistake: /audio/https%3A//host/audio/real/path.mp3
  const nestedHttp = value.match(/\/audio\/https?%3A\/\//i) || value.match(/\/audio\/https?:\/\//i)
  if (nestedHttp) {
    const nested = value.slice(value.toLowerCase().indexOf('/audio/') + AUDIO_PREFIX.length)
    const decoded = safeDecode(nested)
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      return extractVaultRelativePath(decoded, options)
    }
  }

  const storageIdx = value.indexOf(STORAGE_MARKER)
  if (storageIdx >= 0) {
    value = value.slice(storageIdx + STORAGE_MARKER.length)
  } else if (/^https?:\/\//i.test(value)) {
    try {
      const stripped = stripMediaPrefix(new URL(value).pathname)
      // Unknown absolute URL — not a vault path we can rewrite
      if (stripped === null) return null
      value = stripped
    } catch {
      return null
    }
  } else if (value.startsWith('/')) {
    const stripped = stripMediaPrefix(value)
    if (stripped !== null) value = stripped
  } else if (value.toLowerCase().startsWith('audio/')) {
    value = value.slice('audio/'.length)
  }

  value = safeDecode(value).replace(/^\/+/, '').replace(/^audio\//i, '')
  if (!value) return null

  // Reject if we still look like a URL got embedded as a path segment
  if (/^https?:\/\//i.test(value) || value.toLowerCase().startsWith('https%3a')) {
    return extractVaultRelativePath(safeDecode(value), options)
  }

  // Only claim references that actually name an audio file, so unrelated
  // strings are never rewritten into {AUDIO_BASE}/audio/<string>.
  if (!AUDIO_EXTENSION.test(value)) return null

  return preferMp3 ? value.replace(/\.wav$/i, '.mp3') : value
}

/** Swap .mp3 ↔ .wav on a same-origin vault URL (for local file probing). */
export function alternateAudioExtensionUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null
  const [path, query = ''] = url.split('?')
  const q = query ? `?${query}` : ''
  if (/\.mp3$/i.test(path)) return `${path.replace(/\.mp3$/i, '.wav')}${q}`
  if (/\.wav$/i.test(path)) return `${path.replace(/\.wav$/i, '.mp3')}${q}`
  return null
}

function encodePath(rel: string): string {
  return rel.split('/').map((s) => encodeURIComponent(s)).join('/')
}

/** Same-origin URL the browser should play: CDN, static file locally, or proxy fallback. */
function toAudioPublicUrl(viaProxy: boolean, rel: string): string {
  const segments = encodePath(rel)
  const cdn = getPublicMediaCdnBase()
  if (cdn) return `${cdn}/audio/${segments}`
  return viaProxy ? `/api/audio/media/${segments}` : `/audio/${segments}`
}

function getPublicMediaCdnBase(): string | null {
  const base = (
    process.env.NEXT_PUBLIC_MEDIA_CDN_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
    ''
  ).replace(/\/+$/, '')
  if (!base) return null
  if (/sergikdropz\.com\/api|ngrok|trycloudflare|127\.0\.0\.1|localhost/i.test(base)) {
    return null
  }
  return base
}

/** Absolute URL on the upstream media origin, for server-side fetches only. */
export function vaultUpstreamUrl(rel: string): string | null {
  const base = (process.env.AUDIO_ORIGIN || process.env.NEXT_PUBLIC_AUDIO_BASE_URL || '').replace(
    /\/+$/,
    '',
  )
  if (!base) return null
  return `${base}/audio/${encodePath(rel)}`
}

export function normalizeVaultAudioUrl(urlOrPath: string): string {
  if (!urlOrPath || typeof urlOrPath !== 'string') return urlOrPath
  if (urlOrPath.startsWith('blob:')) return urlOrPath

  const useLocal =
    process.env.NEXT_PUBLIC_LOCAL_AUDIO === '1' ||
    /localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  const audioBase = (process.env.NEXT_PUBLIC_AUDIO_BASE_URL || '').replace(/\/+$/, '')

  // Local static vault may still have WAV-only playlist drops; keep extension.
  // Cloud/proxy always prefers migrated MP3 masters.
  const rel = extractVaultRelativePath(urlOrPath, { preferMp3: !useLocal })
  if (rel && (useLocal || audioBase)) {
    // Local files win when present; otherwise stream through the media proxy.
    return toAudioPublicUrl(!useLocal, rel)
  }

  // Decommissioned Supabase Storage hosts (or any storage marker): always rewrite
  // to same-origin media so stale JSON / localStorage cannot keep hitting dead hosts.
  if (rel && urlOrPath.includes(STORAGE_MARKER)) {
    return toAudioPublicUrl(!useLocal, rel)
  }

  // Relative vault path with no media base configured
  if (rel && !rel.startsWith('http')) {
    if (/\.wav$/i.test(urlOrPath) || urlOrPath.includes(STORAGE_MARKER)) {
      return toAudioPublicUrl(false, rel)
    }
  }

  if (!/\.wav(?=$|[?#])/i.test(urlOrPath)) return urlOrPath

  const isStorageObject = urlOrPath.includes(STORAGE_MARKER)
  if (
    isStorageObject ||
    urlOrPath.startsWith('unreleased/') ||
    urlOrPath.startsWith('/audio/')
  ) {
    return urlOrPath.replace(/\.wav(?=$|[?#])/i, '.mp3')
  }

  return urlOrPath
}
