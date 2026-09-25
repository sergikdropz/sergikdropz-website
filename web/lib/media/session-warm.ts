/**
 * Warm cover art (+ optional next-queue audio) for Music Vault sessions.
 * Respects Save-Data / slow connections; cover URLs must include `?v=`.
 */

import { prepareCoverPrefetchUrls, prefersReducedDataTransfer } from '@/lib/media/cover-cache'
import { preloadCovers, preloadTracks, isServiceWorkerActive } from '@/utils/serviceWorker'
import { COVER_CACHE_NAME } from '@/lib/media/cover-cache'

let lastWarmKey = ''
let warmInFlight: Promise<void> | null = null
let lastAudioHintKey = ''

const AUDIO_HINT_BYTES = 65_536

/** Range GET first ~64KB — warms CDN/proxy when the SW audio cache is cold. */
export async function warmAudioByteHints(urls: string[]): Promise<void> {
  if (typeof window === 'undefined') return
  if (prefersReducedDataTransfer()) return
  const list = urls.filter((u) => typeof u === 'string' && u.trim()).slice(0, 2)
  if (!list.length) return
  const key = list.join('|')
  if (key === lastAudioHintKey) return
  lastAudioHintKey = key

  await Promise.all(
    list.map(async (url) => {
      try {
        await fetch(url, {
          method: 'GET',
          headers: { Range: `bytes=0-${AUDIO_HINT_BYTES - 1}` },
          credentials: 'same-origin',
          cache: 'force-cache',
        })
      } catch {
        /* best effort */
      }
    }),
  )
}

async function warmCoversViaCacheApi(urls: string[]): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return
  try {
    const cache = await caches.open(COVER_CACHE_NAME)
    const CONCURRENCY = 4
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const slice = urls.slice(i, i + CONCURRENCY)
      await Promise.all(
        slice.map(async (url) => {
          try {
            const hit = await cache.match(url)
            if (hit) return
            const res = await fetch(url, { credentials: 'same-origin', cache: 'force-cache' })
            if (res.ok) await cache.put(url, res.clone())
          } catch {
            /* best effort */
          }
        }),
      )
    }
  } catch {
    /* ignore */
  }
}

export type SessionWarmInput = {
  covers?: Array<string | null | undefined>
  audioUrls?: string[]
  /** Dedupe key — skip if identical to last successful warm. */
  key?: string
}

/**
 * Prefetch busted cover URLs (SW when active, else Cache API) and optionally
 * queue-preload a few audio URLs through the existing SW audio cache.
 */
export async function warmMusicLibrarySession(input: SessionWarmInput): Promise<void> {
  if (typeof window === 'undefined') return
  if (prefersReducedDataTransfer()) return

  const covers = prepareCoverPrefetchUrls(input.covers || [])
  const audio = (input.audioUrls || []).filter((u) => typeof u === 'string' && u.trim()).slice(0, 3)
  if (!covers.length && !audio.length) return

  const key = input.key || `${covers.slice(0, 8).join('|')}|${audio.join('|')}`
  if (key && key === lastWarmKey) return
  if (warmInFlight) return warmInFlight

  warmInFlight = (async () => {
    try {
      if (covers.length) {
        if (isServiceWorkerActive()) {
          await preloadCovers(covers)
        } else {
          await warmCoversViaCacheApi(covers)
        }
      }
      if (audio.length && isServiceWorkerActive()) {
        await preloadTracks(audio)
      }
      lastWarmKey = key
    } finally {
      warmInFlight = null
    }
  })()

  return warmInFlight
}

/** Test helper */
export function resetSessionWarmForTests() {
  lastWarmKey = ''
  warmInFlight = null
  lastAudioHintKey = ''
}
