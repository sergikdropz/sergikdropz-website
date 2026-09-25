import { isR2BrowserPlayEnabled } from '@/lib/audio/edge-playback-url'
import { syncMediaProxyPlaybackUrl } from '@/lib/audio/skip-background-resolve'
import { warmAudioByteHints, warmMusicLibrarySession } from '@/lib/media/session-warm'

export function resolveWarmPlaybackUrl(file: string | undefined | null): string | null {
  if (!file?.trim()) return null
  if (isR2BrowserPlayEnabled()) return null
  return syncMediaProxyPlaybackUrl(file)
}

/** Best-effort warm for the next queue items after a library play click. */
export function warmUpcomingQueuePlayback(
  queue: Array<{ file?: string | null }>,
  startIndex: number,
  count = 2,
): void {
  if (typeof window === 'undefined') return
  const urls = queue
    .slice(startIndex + 1, startIndex + 1 + count)
    .map((t) => resolveWarmPlaybackUrl(t.file))
    .filter((u): u is string => Boolean(u))
  if (!urls.length) return
  const key = `queue-warm:${urls.join('|')}`
  void warmMusicLibrarySession({ audioUrls: urls, key })
  void warmAudioByteHints(urls)
}
