import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

export const FAN_VAULT_UNLOCK_COOKIE = 'fan_vault_unlock'

/** Public hostname for cookie Domain (Vercel / proxies set x-forwarded-host). */
export function hostnameFromRequest(request: NextRequest): string {
  const xf = request.headers.get('x-forwarded-host')
  if (xf) {
    return xf.split(',')[0].trim().toLowerCase().split(':')[0]
  }
  return request.nextUrl.hostname.toLowerCase().split(':')[0]
}

/** Use HTTPS cookies whenever the incoming request is HTTPS (not only NODE_ENV). */
export function cookieSecureFromRequest(request: NextRequest): boolean {
  const proto = request.headers.get('x-forwarded-proto')
  if (proto) {
    return proto.split(',')[0].trim().toLowerCase() === 'https'
  }
  return request.nextUrl.protocol === 'https:'
}

const MAX_AGE_SEC = 60 * 60 * 24 * 120 // 120 days

function getSecret(): string {
  const s = process.env.FAN_VAULT_UNLOCK_SECRET
  if (s && s.length >= 16) return s
  if (process.env.NODE_ENV !== 'production') {
    return 'dev-fan-vault-unlock-secret-min-16-chars'
  }
  throw new Error('FAN_VAULT_UNLOCK_SECRET must be set (min 16 chars) in production')
}

function signPayload(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

function unfoldEmailPart(raw: string): string {
  let value = raw
  for (let i = 0; i < 3; i++) {
    if (value.includes('@')) return value
    try {
      const next = decodeURIComponent(value)
      if (next === value) break
      value = next
    } catch {
      break
    }
  }
  return value
}

function signatureMatches(sig: string, body: string): boolean {
  const expected = signPayload(body)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function sealFanVaultUnlock(email: string): { token: string; maxAgeSec: number } {
  const normalized = email.trim().toLowerCase()
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC
  // Do not pre-encode `@`. Next.js cookie serialization percent-encodes the value;
  // encoding here produced `%2540` and failed verification.
  const body = `${normalized}.${exp}`
  const sig = signPayload(body)
  return { token: `${body}.${sig}`, maxAgeSec: MAX_AGE_SEC }
}

export function readFanVaultUnlockToken(token: string | undefined | null): string | null {
  if (!token || typeof token !== 'string') return null

  // Token format: `${email}.${exp}.${sig}` (legacy tokens used encodeURIComponent(email)).
  // Parse exp + sig from the right so dots in the local-part are safe.
  const lastDot = token.lastIndexOf('.')
  if (lastDot === -1) return null
  const secondLastDot = token.lastIndexOf('.', lastDot - 1)
  if (secondLastDot === -1) return null

  const emailPart = token.substring(0, secondLastDot)
  const expStr = token.substring(secondLastDot + 1, lastDot)
  const sig = token.substring(lastDot + 1)

  if (!emailPart || !expStr || !sig) return null
  const exp = parseInt(expStr, 10)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null

  const unfolded = unfoldEmailPart(emailPart)
  const bodies = new Set([`${emailPart}.${expStr}`, `${unfolded}.${expStr}`])
  if (unfolded.includes('@')) bodies.add(`${encodeURIComponent(unfolded)}.${expStr}`)

  for (const body of bodies) {
    if (!signatureMatches(sig, body)) continue
    const email = unfolded.toLowerCase()
    if (!email.includes('@') || email.length > 320) continue
    return email
  }
  return null
}

export function getFanVaultUnlockEmailFromRequest(request: NextRequest): string | null {
  return readFanVaultUnlockToken(request.cookies.get(FAN_VAULT_UNLOCK_COOKIE)?.value)
}

/**
 * Broad cookie domain so unlock works on apex + www (must match unlock/complete route).
 * Never set Domain= unless it matches the current host — browsers reject mismatched Domain.
 *
 * Optional override: FAN_VAULT_UNLOCK_COOKIE_DOMAIN=example.com (with or without leading dot).
 */
export function fanVaultUnlockCookieDomain(hostname: string): string | undefined {
  const host = hostname.toLowerCase().split(':')[0]

  const raw = process.env.FAN_VAULT_UNLOCK_COOKIE_DOMAIN?.trim().toLowerCase()
  if (raw) {
    const base = raw.startsWith('.') ? raw.slice(1) : raw
    if (base && (host === base || host.endsWith(`.${base}`))) {
      return `.${base}`
    }
  }

  if (host === 'sergikdropz.com' || host.endsWith('.sergikdropz.com')) {
    return '.sergikdropz.com'
  }
  return undefined
}
