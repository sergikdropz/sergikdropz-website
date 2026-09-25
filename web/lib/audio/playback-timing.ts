/**
 * Optional dev telemetry: `NEXT_PUBLIC_PLAYBACK_TIMING=1`
 * Logs trackId + elapsed ms from the last `playbackTimingStart`.
 */

const enabled = (): boolean =>
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PLAYBACK_TIMING === '1'

type TimingState = { trackId: string; start: number }

function state(): TimingState | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { __sergikPlaybackTiming?: TimingState }).__sergikPlaybackTiming ?? null
}

function setState(next: TimingState | null) {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __sergikPlaybackTiming?: TimingState | null }
  if (next) w.__sergikPlaybackTiming = next
  else delete w.__sergikPlaybackTiming
}

export function playbackTimingStart(trackId: string): void {
  if (!enabled() || typeof performance === 'undefined') return
  setState({ trackId, start: performance.now() })
}

export function playbackTimingMark(trackId: string, label: string): void {
  if (!enabled() || typeof performance === 'undefined') return
  const s = state()
  const base = s?.trackId === trackId ? s.start : performance.now()
  const ms = Math.round(performance.now() - base)
  console.debug(`[playback-timing] ${label}`, { trackId, ms })
}

export function playbackTimingClear(): void {
  setState(null)
}
