import type { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Dual-mode rate limiter
//
// Mode A (production-safe): When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//   are set, uses Upstash Redis REST API directly (no npm package). Sliding
//   window via INCR + EXPIRE — survives Vercel cold starts and multi-instance.
//
// Mode B (single-instance fallback): In-memory sliding-window log per key.
//   Works per process only; resets on cold start. Suitable for local dev and
//   single-server deploys.
// ---------------------------------------------------------------------------

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '')
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

// ---------------------------------------------------------------------------
// Upstash Redis helpers (Mode A)
// ---------------------------------------------------------------------------

async function upstashPipeline(
  commands: [string, ...string[]][]
): Promise<{ result: unknown }[]> {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Upstash pipeline failed: ${res.status}`)
  return res.json() as Promise<{ result: unknown }[]>
}

async function upstashGet(command: string): Promise<{ result: unknown }> {
  const res = await fetch(`${UPSTASH_URL}/${command}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Upstash GET failed: ${res.status}`)
  return res.json() as Promise<{ result: unknown }>
}

async function redisRateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const windowSec = Math.ceil(windowMs / 1000)
  const redisKey = `rl:${key}`

  const [incrResult, _expireResult] = await upstashPipeline([
    ['INCR', redisKey],
    ['EXPIRE', redisKey, String(windowSec), 'NX'],
  ])

  const count = incrResult.result as number

  if (count > max) {
    const ttlData = await upstashGet(`ttl/${redisKey}`)
    const ttl = (ttlData.result as number) ?? windowSec
    return { ok: false, retryAfterSec: Math.max(1, ttl) }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// In-memory sliding-window log (Mode B)
// ---------------------------------------------------------------------------

type WindowEntry = { timestamps: number[] }
const store = new Map<string, WindowEntry>()

// Prune entries older than 15 min to prevent unbounded growth
let lastPrune = Date.now()
function maybePrune(now: number) {
  if (now - lastPrune < 60_000) return
  lastPrune = now
  const cutoff = now - 15 * 60_000
  // Use Array.from for ES5-compatible Map iteration
  Array.from(store.keys()).forEach((k) => {
    const v = store.get(k)!
    v.timestamps = v.timestamps.filter((t: number) => t > cutoff)
    if (v.timestamps.length === 0) store.delete(k)
  })
}

function memoryRateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  maybePrune(now)
  const cutoff = now - windowMs

  let entry = store.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    store.set(key, entry)
  }

  entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

  if (entry.timestamps.length >= max) {
    const oldest = entry.timestamps[0]!
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    return { ok: false, retryAfterSec }
  }

  entry.timestamps.push(now)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Public API — same signature as before, zero breaking changes
// ---------------------------------------------------------------------------

export async function checkRateLimitAsync(
  key: string,
  max: number,
  windowMs: number
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      return await redisRateLimit(key, max, windowMs)
    } catch (err) {
      // Redis unavailable — fall through to memory limiter so callers are not blocked
      console.warn('[rate-limit] Upstash unavailable, falling back to memory limiter:', err)
    }
  }
  return memoryRateLimit(key, max, windowMs)
}

/** Synchronous shim — memory mode only. Use checkRateLimitAsync in new code. */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  return memoryRateLimit(key, max, windowMs)
}

export function clientKeyFromRequest(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
