import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

export const FAN_VAULT_UNLOCK_COOKIE = 'fan_vault_unlock'

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

export function sealFanVaultUnlock(email: string): { token: string; maxAgeSec: number } {
  const normalized = email.trim().toLowerCase()
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC
  const body = `${encodeURIComponent(normalized)}.${exp}`
  const sig = signPayload(body)
  return { token: `${body}.${sig}`, maxAgeSec: MAX_AGE_SEC }
}

export function readFanVaultUnlockToken(token: string | undefined | null): string | null {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [encEmail, expStr, sig] = parts
  const exp = parseInt(expStr, 10)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null
  const body = `${encEmail}.${expStr}`
  const expected = signPayload(body)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  try {
    const email = decodeURIComponent(encEmail)
    if (!email.includes('@') || email.length > 320) return null
    return email.toLowerCase()
  } catch {
    return null
  }
}

export function getFanVaultUnlockEmailFromRequest(request: NextRequest): string | null {
  return readFanVaultUnlockToken(request.cookies.get(FAN_VAULT_UNLOCK_COOKIE)?.value)
}
