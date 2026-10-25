/**
 * Rate-limit helpers for the Printful client.
 *
 * Printful caps requests per store (general 120/min; mockup create-task 2/min for
 * new stores, 10/min established; sync writes 10/min) and returns 429 with a
 * `Retry-After` header plus `X-RateLimit-*`. These pure helpers let the client
 * honour `Retry-After`, back off with jitter, and surface remaining budget.
 * See knowledge/merch/PRINTFUL_API.md §2.
 */

export type RateLimitSnapshot = {
  limit: number | null
  remaining: number | null
  resetSeconds: number | null
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into milliseconds. */
export function parseRetryAfterMs(header: string | null, now: number = Date.now()): number | null {
  if (!header) return null
  const trimmed = header.trim()
  if (trimmed === '') return null
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const date = Date.parse(trimmed)
  if (!Number.isNaN(date)) return Math.max(0, date - now)
  return null
}

/** Full-jitter exponential backoff. `jitter` is injectable for deterministic tests. */
export function computeBackoffMs(
  attempt: number,
  opts: { baseMs?: number; maxMs?: number; jitter?: number } = {},
): number {
  const baseMs = opts.baseMs ?? 500
  const maxMs = opts.maxMs ?? 8000
  const jitter = opts.jitter ?? Math.random()
  const safeAttempt = Math.max(0, Math.floor(attempt))
  const ceiling = Math.min(maxMs, baseMs * 2 ** safeAttempt)
  // Full jitter between 50% and 100% of the ceiling keeps retries spread out.
  return Math.round(ceiling * (0.5 + 0.5 * Math.min(1, Math.max(0, jitter))))
}

/** Retry transient failures only: rate limit + gateway/service errors. */
export function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504
}

function numOrNull(value: string | null): number | null {
  if (value == null || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function readRateLimit(headers: {
  get(name: string): string | null
}): RateLimitSnapshot {
  return {
    limit: numOrNull(headers.get('x-ratelimit-limit') ?? headers.get('X-RateLimit-Limit')),
    remaining: numOrNull(headers.get('x-ratelimit-remaining') ?? headers.get('X-RateLimit-Remaining')),
    resetSeconds: numOrNull(headers.get('x-ratelimit-reset') ?? headers.get('X-RateLimit-Reset')),
  }
}

/** Decide the wait before the next attempt, honouring Retry-After when present. */
export function nextRetryDelayMs(
  attempt: number,
  retryAfterHeader: string | null,
  opts: { baseMs?: number; maxMs?: number; jitter?: number; capMs?: number } = {},
): number {
  const capMs = opts.capMs ?? 15_000
  const retryAfter = parseRetryAfterMs(retryAfterHeader)
  const delay = retryAfter ?? computeBackoffMs(attempt, opts)
  return Math.min(capMs, Math.max(0, delay))
}
