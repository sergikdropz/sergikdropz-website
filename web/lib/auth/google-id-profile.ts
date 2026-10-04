export type GoogleAccountProfile = { email: string; name: string | null }

/** Map a Google tokeninfo payload into a verified site account. */
export function profileFromGoogleTokenInfo(
  data: unknown,
  expectedClientId: string | null,
  nowSec = Math.floor(Date.now() / 1000),
): GoogleAccountProfile | null {
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  const aud = typeof row.aud === 'string' ? row.aud : ''
  if (!expectedClientId || aud !== expectedClientId) return null
  const iss = typeof row.iss === 'string' ? row.iss : ''
  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') return null
  const exp = Number(row.exp)
  if (!Number.isFinite(exp) || exp <= nowSec) return null
  const verified = row.email_verified
  if (verified === false || verified === 'false') return null
  const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : ''
  if (!email.includes('@') || email.length > 320) return null
  const rawName = typeof row.name === 'string' ? row.name.trim().slice(0, 120) : ''
  return { email, name: rawName || null }
}

/** Verify a Sign in with Google ID token without leaving the current page. */
export async function profileFromGoogleIdToken(
  idToken: string,
  expectedClientId: string | null,
): Promise<GoogleAccountProfile | null> {
  const token = idToken.trim()
  if (!token || token.length > 8192 || !expectedClientId) return null
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`)
  if (!response.ok) return null
  const data = await response.json().catch(() => null)
  return profileFromGoogleTokenInfo(data, expectedClientId)
}
