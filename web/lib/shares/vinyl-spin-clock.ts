/**
 * Shared 33⅓ RPM vinyl clock.
 *
 * - Playing: angle locks to audio timeline (1 rev ≈ 1.8s).
 * - Scrubbing: angle follows finger nudges; timeline origin re-locks on release.
 * Display angle is MONOTONIC (never wrapped) so WebKit never reverse-snaps.
 */

export const VINYL_RPM = 100 / 3
export const VINYL_33_RPM_SEC = 60 / VINYL_RPM
export const VINYL_33_RPM_MS = VINYL_33_RPM_SEC * 1000

/** Degrees of platter rotation per second of audio at 33⅓ RPM. */
export const VINYL_DEG_PER_SEC = 360 / VINYL_33_RPM_SEC

const DEG_PER_MS = VINYL_DEG_PER_SEC / 1000
/** Ignore huge frame gaps (background tab) so the disc doesn't jump. */
const MAX_FRAME_MS = 64

type Listener = (angleDeg: number) => void
type TimelineGetter = () => number

/** Unbounded clockwise degrees — keeps growing while the motor / timeline runs. */
let angleDeg = 0
/** angleDeg = timelineOrigin + currentTime * VINYL_DEG_PER_SEC when timeline-locked. */
let timelineOrigin = 0
let lastNow = 0
let holders = 0
let scrubLocks = 0
let rafId = 0
let getTimeline: TimelineGetter | null = null
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener(angleDeg)
}

function tick(now: number) {
  const rawDt = now - lastNow
  lastNow = now

  if (scrubLocks > 0) {
    // Finger owns the platter — angle only changes via nudgeVinylAngle.
    rafId = requestAnimationFrame(tick)
    return
  }

  if (holders > 0) {
    if (getTimeline) {
      const t = getTimeline()
      if (Number.isFinite(t) && t >= 0) {
        angleDeg = timelineOrigin + t * VINYL_DEG_PER_SEC
        notify()
      }
    } else {
      const dt = rawDt > 0 && rawDt < MAX_FRAME_MS ? rawDt : Math.min(MAX_FRAME_MS, Math.max(0, rawDt))
      if (dt > 0) {
        angleDeg += dt * DEG_PER_MS
        notify()
      }
    }
  }

  rafId = requestAnimationFrame(tick)
}

function ensureLoop() {
  if (rafId || typeof requestAnimationFrame === 'undefined') return
  lastNow = performance.now()
  rafId = requestAnimationFrame(tick)
}

/** Current platter angle in unbounded degrees (monotonic). */
export function getVinylSpinAngle(): number {
  return angleDeg
}

/** Drive spin from audio.currentTime while the motor is acquired. */
export function setVinylTimelineSource(getter: TimelineGetter | null): void {
  getTimeline = getter
  ensureLoop()
}

/**
 * Re-lock timeline origin so the current visual angle matches `currentTime`
 * (call after scrub ends or after a hard seek).
 */
export function relockVinylTimeline(currentTime: number): void {
  const t = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0
  timelineOrigin = angleDeg - t * VINYL_DEG_PER_SEC
}

/** Take a spin hold (ref-counted). Call releaseVinylSpin when done. */
export function acquireVinylSpin(): void {
  holders += 1
  ensureLoop()
}

export function releaseVinylSpin(): void {
  holders = Math.max(0, holders - 1)
}

/** Hold the platter (timeline motor stops; angle still nudged by scrub). */
export function beginVinylScrub(): void {
  scrubLocks += 1
  ensureLoop()
}

export function endVinylScrub(currentTime?: number): void {
  scrubLocks = Math.max(0, scrubLocks - 1)
  if (scrubLocks === 0 && currentTime != null) {
    relockVinylTimeline(currentTime)
  }
}

/** Manually rotate the platter (degrees; positive = clockwise / track forward). */
export function nudgeVinylAngle(deltaDeg: number): void {
  if (!Number.isFinite(deltaDeg) || deltaDeg === 0) return
  angleDeg += deltaDeg
  notify()
}

/** Set absolute platter angle (used while finger-scrubbing). */
export function setVinylAngle(nextDeg: number): void {
  if (!Number.isFinite(nextDeg)) return
  angleDeg = nextDeg
  notify()
}

/** True while a scrub lock is held (timeline motor is suspended). */
export function isVinylScrubbing(): boolean {
  return scrubLocks > 0
}

/**
 * Map a platter rotation to audio seconds at true 33⅓ RPM.
 * One full clockwise turn ≈ +1.8s of music.
 */
export function vinylDegreesToSeconds(deltaDeg: number): number {
  return (deltaDeg / 360) * VINYL_33_RPM_SEC
}

/** Angular velocity (deg/s) → signed playback-rate multiple of 33⅓ RPM. */
export function vinylVelocityToRate(degPerSec: number): number {
  if (!Number.isFinite(degPerSec) || degPerSec === 0) return 0
  return degPerSec / VINYL_DEG_PER_SEC
}

/** Smallest signed delta from one absolute pointer angle to another (−180…180]. */
export function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  let d = toDeg - fromDeg
  while (d > 180) d -= 360
  while (d <= -180) d += 360
  return d
}

/**
 * Subscribe to angle updates. Invokes immediately with the current angle so a
 * remounted disc continues from the same rotation instead of snapping to 0.
 */
export function subscribeVinylSpin(listener: Listener): () => void {
  listeners.add(listener)
  listener(angleDeg)
  ensureLoop()
  return () => {
    listeners.delete(listener)
  }
}
