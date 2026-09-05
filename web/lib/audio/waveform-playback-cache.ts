import type { PeakData } from '@/utils/audioWorkerClient'

const MAX_ENTRIES = 48
const cache = new Map<string, PeakData>()

function cacheKey(resolvedUrl: string): string {
  return resolvedUrl.split('?')[0]
}

export function getPlaybackWaveformCache(resolvedUrl: string): PeakData | null {
  return cache.get(cacheKey(resolvedUrl)) ?? null
}

export function setPlaybackWaveformCache(resolvedUrl: string, data: PeakData): void {
  const key = cacheKey(resolvedUrl)
  if (cache.has(key)) cache.delete(key)
  cache.set(key, data)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}
