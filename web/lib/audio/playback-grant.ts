/** Vault covers one listening session. Sold tracks last the rest of the day. */

export const VAULT_PRESIGN_SEC = 2 * 60 * 60
export const SOLD_PRESIGN_SEC = 6 * 60 * 60
/** Ask for a new signature while the current one still plays. */
export const SIGNED_URL_REFRESH_MARGIN_SEC = 5 * 60

/** Unreleased vault paths stay short-lived. Everything else is treated as a file we sell or ship. */
export function isVaultPlaybackPath(relativePath: string): boolean {
  const rel = relativePath.replace(/^\/+/, '').replace(/^audio\//i, '')
  return rel === 'unreleased' || rel.startsWith('unreleased/')
}

export function playbackPresignSeconds(relativePath: string): number {
  return isVaultPlaybackPath(relativePath) ? VAULT_PRESIGN_SEC : SOLD_PRESIGN_SEC
}

export function isProductionMediaHost(): boolean {
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
}

/** Milliseconds when an S3/R2 presign stops working, or null if the URL has no clock. */
export function signedUrlExpiresAtMs(url: string): number | null {
  try {
    const parsed = new URL(url)
    const expires = Number(parsed.searchParams.get('X-Amz-Expires'))
    const amzDate = parsed.searchParams.get('X-Amz-Date') || ''
    if (!Number.isFinite(expires) || expires <= 0) return null
    const match = amzDate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
    if (!match) return null
    const start = Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    )
    return start + expires * 1000
  } catch {
    return null
  }
}

export function signedUrlExpired(url: string, now = Date.now()): boolean {
  const expiresAt = signedUrlExpiresAtMs(url)
  if (expiresAt == null) return false
  return expiresAt <= now
}

export function signedUrlShouldRefresh(url: string, now = Date.now()): boolean {
  const expiresAt = signedUrlExpiresAtMs(url)
  if (expiresAt == null) return true
  return expiresAt - now <= SIGNED_URL_REFRESH_MARGIN_SEC * 1000
}
