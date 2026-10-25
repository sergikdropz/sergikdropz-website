import { describe, it, expect } from 'vitest'
import {
  parseRetryAfterMs,
  computeBackoffMs,
  shouldRetryStatus,
  readRateLimit,
  nextRetryDelayMs,
} from './printful-rate-limit'

describe('printful-rate-limit', () => {
  it('parses delta-seconds Retry-After', () => {
    expect(parseRetryAfterMs('30')).toBe(30_000)
    expect(parseRetryAfterMs('0')).toBe(0)
  })

  it('parses HTTP-date Retry-After relative to now', () => {
    const now = Date.parse('2026-01-01T00:00:00Z')
    const header = 'Thu, 01 Jan 2026 00:00:10 GMT'
    expect(parseRetryAfterMs(header, now)).toBe(10_000)
  })

  it('returns null for missing or garbage Retry-After', () => {
    expect(parseRetryAfterMs(null)).toBeNull()
    expect(parseRetryAfterMs('')).toBeNull()
    expect(parseRetryAfterMs('soon')).toBeNull()
  })

  it('backs off exponentially with jitter bounds', () => {
    // With jitter=1 we get the full ceiling; jitter=0 gives half.
    expect(computeBackoffMs(0, { baseMs: 500, jitter: 1 })).toBe(500)
    expect(computeBackoffMs(0, { baseMs: 500, jitter: 0 })).toBe(250)
    expect(computeBackoffMs(1, { baseMs: 500, jitter: 1 })).toBe(1000)
    expect(computeBackoffMs(2, { baseMs: 500, jitter: 1 })).toBe(2000)
  })

  it('caps backoff at maxMs', () => {
    expect(computeBackoffMs(20, { baseMs: 500, maxMs: 8000, jitter: 1 })).toBe(8000)
  })

  it('retries only transient statuses', () => {
    expect(shouldRetryStatus(429)).toBe(true)
    expect(shouldRetryStatus(503)).toBe(true)
    expect(shouldRetryStatus(400)).toBe(false)
    expect(shouldRetryStatus(404)).toBe(false)
    expect(shouldRetryStatus(200)).toBe(false)
  })

  it('reads rate-limit headers (case-insensitive)', () => {
    const headers = new Map([
      ['x-ratelimit-limit', '120'],
      ['x-ratelimit-remaining', '3'],
      ['x-ratelimit-reset', '42'],
    ])
    const snap = readRateLimit({ get: (k) => headers.get(k.toLowerCase()) ?? null })
    expect(snap).toEqual({ limit: 120, remaining: 3, resetSeconds: 42 })
  })

  it('prefers Retry-After over backoff and respects the cap', () => {
    expect(nextRetryDelayMs(0, '5')).toBe(5000)
    expect(nextRetryDelayMs(0, '999', { capMs: 15_000 })).toBe(15_000)
    // No header → backoff path.
    expect(nextRetryDelayMs(1, null, { baseMs: 500, jitter: 1 })).toBe(1000)
  })
})
