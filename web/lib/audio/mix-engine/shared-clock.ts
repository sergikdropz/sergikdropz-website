/**
 * Shared AudioContext clock helpers for dual-deck start + optional buffer incoming.
 */

const decodeCache = new Map<string, Promise<AudioBuffer | null>>()

export const SHARED_CLOCK_LEAD_SEC = 0.04

export function nextSharedClockWhen(
  ctx: Pick<AudioContext, 'currentTime'>,
  leadSec = SHARED_CLOCK_LEAD_SEC,
): number {
  return ctx.currentTime + Math.max(0.008, leadSec)
}

/** Media time for a BufferSource started at `startCtx` from `cueSec`. */
export function incomingBufferMediaTime(params: {
  cueSec: number
  startCtx: number
  nowCtx: number
  rate: number
}): number {
  const elapsed = Math.max(0, params.nowCtx - params.startCtx)
  const rate = params.rate > 0 ? params.rate : 1
  return Math.max(0, params.cueSec + elapsed * rate)
}

export async function decodeIncomingBuffer(
  ctx: AudioContext,
  url: string,
): Promise<AudioBuffer | null> {
  if (!url) return null
  const existing = decodeCache.get(url)
  if (existing) return existing
  const pending = (async () => {
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'force-cache' })
      if (!res.ok) return null
      const raw = await res.arrayBuffer()
      const copy = raw.slice(0)
      return await ctx.decodeAudioData(copy)
    } catch {
      return null
    }
  })()
  decodeCache.set(url, pending)
  const buf = await pending
  if (!buf) decodeCache.delete(url)
  return buf
}

export function forgetDecodedIncoming(url?: string): void {
  if (url) decodeCache.delete(url)
  else decodeCache.clear()
}

/**
 * Park + play an HTMLAudio element, then snap once to the shared clock.
 * Used when a decoded buffer is not available.
 */
export async function syncElementToSharedClock(params: {
  element: HTMLAudioElement
  cueSec: number
  ctx: Pick<AudioContext, 'currentTime'>
  rate?: number
}): Promise<void> {
  const el = params.element
  const cue = Math.max(0, params.cueSec)
  if (typeof params.rate === 'number' && params.rate > 0) {
    try {
      el.playbackRate = params.rate
    } catch {
      /* ignore */
    }
  }
  try {
    if (Math.abs((el.currentTime || 0) - cue) > 0.04) {
      el.currentTime = cue
    }
  } catch {
    /* ignore */
  }
  if (el.paused) {
    try {
      await el.play()
    } catch {
      try {
        await el.play()
      } catch {
        /* autoplay */
      }
    }
  }
  // Never seek after play() — a 12ms snap is an audible skip / stop.
}
