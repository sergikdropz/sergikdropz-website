/** Process-local admin stats cache (shared by route + optional bust helpers). */

type AdminStatsPayload = {
  success: true
  stats: Record<string, unknown>
  timestamp: string
  cached?: boolean
}

const CACHE_TTL_MS = 45_000
let statsCache: { expiresAt: number; body: AdminStatsPayload } | null = null

export function clearAdminStatsCache() {
  statsCache = null
}

export function readAdminStatsCache(): AdminStatsPayload | null {
  if (!statsCache) return null
  if (statsCache.expiresAt <= Date.now()) {
    statsCache = null
    return null
  }
  return statsCache.body
}

export function writeAdminStatsCache(body: AdminStatsPayload) {
  statsCache = { expiresAt: Date.now() + CACHE_TTL_MS, body }
}
