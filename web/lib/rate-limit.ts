import type { NextRequest } from 'next/server'

type Entry = { count: number; resetAt: number }

const store = new Map<string, Entry>()

/**
 * Fixed-window limiter (per Node instance). Mitigates brute force on a single server;
 * for multi-instance production, prefer Redis/Upstash.
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  let e = store.get(key)
  if (!e || now >= e.resetAt) {
    e = { count: 0, resetAt: now + windowMs }
    store.set(key, e)
  }
  if (e.count >= max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((e.resetAt - now) / 1000)) }
  }
  e.count += 1
  return { ok: true }
}

export function clientKeyFromRequest(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
