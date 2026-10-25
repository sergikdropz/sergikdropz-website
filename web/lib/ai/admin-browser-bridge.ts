import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import {
  ADMIN_BROWSER_BRIDGE_TTL_SEC,
  isAdminBrowserBridgeOrigin,
} from '@/lib/ai/admin-browser-bridge-shared'

const BRIDGE_INFO = 'sergik-admin-browser-bridge-v1'

function bridgeKey(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!secret) return null
  return createHmac('sha256', secret).update(BRIDGE_INFO).digest()
}

/** Short-lived pass so the live admin page can drive Chrome on this Mac. */
export function mintAdminBrowserBridgeTicket(userId: string): string | null {
  const key = bridgeKey()
  const sub = userId.trim()
  if (!key || !sub) return null
  const exp = Math.floor(Date.now() / 1000) + ADMIN_BROWSER_BRIDGE_TTL_SEC
  const payload = Buffer.from(
    JSON.stringify({ sub, exp, n: randomBytes(8).toString('hex') })
  ).toString('base64url')
  const sig = createHmac('sha256', key).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyAdminBrowserBridgeTicket(
  token: string
): { ok: true; sub: string } | { ok: false } {
  const key = bridgeKey()
  if (!key) return { ok: false }
  const dot = token.indexOf('.')
  if (dot <= 0) return { ok: false }
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!payload || !sig) return { ok: false }
  const expected = createHmac('sha256', key).update(payload).digest()
  const actual = Buffer.from(sig, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { ok: false }
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      sub?: unknown
      exp?: unknown
    }
    if (typeof body.sub !== 'string' || !body.sub) return { ok: false }
    if (typeof body.exp !== 'number' || body.exp < Math.floor(Date.now() / 1000)) return { ok: false }
    return { ok: true, sub: body.sub }
  } catch {
    return { ok: false }
  }
}

export function adminBrowserLocalCorsHeaders(origin: string | null): Record<string, string> | null {
  if (!isAdminBrowserBridgeOrigin(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin as string,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}
