import { isDirectPlayableUrl } from '@/lib/audio/edge-playback-url'
import { normalizeVaultAudioUrl, toSameOriginMediaUrl } from '@/utils/normalizeVaultAudioUrl'

/** Same-origin `/api/audio/media/…` URL when the catalog path normalizes to the proxy. */
export function syncMediaProxyPlaybackUrl(filePath: string): string | null {
  if (!filePath?.trim()) return null
  const proxy = toSameOriginMediaUrl(filePath) || normalizeVaultAudioUrl(filePath)
  if (!proxy?.startsWith('/api/audio/media/') || !isDirectPlayableUrl(proxy)) return null
  return proxy
}

/**
 * When the catalog already points at the same-origin media proxy, a background
 * `/api/audio/resolve` call only competes with the live Range GET on play.
 */
export function shouldSkipBackgroundAudioResolve(
  filePath: string,
  optimisticUrl: string | null | undefined,
): boolean {
  if (!filePath || !optimisticUrl || !isDirectPlayableUrl(optimisticUrl)) return false
  const proxy = syncMediaProxyPlaybackUrl(filePath)
  if (!proxy) return false
  return optimisticUrl === proxy || optimisticUrl.startsWith('/api/audio/media/')
}
