/**
 * Shared 33⅓ RPM vinyl clock.
 *
 * Display angle is MONOTONIC (never wrapped to 0–360). Wrapping absolute CSS
 * rotates (359° → 0°) makes Mobile Safari / WebKit look like a reverse snap.
 */

export const VINYL_RPM = 100 / 3
export const VINYL_33_RPM_SEC = 60 / VINYL_RPM
export const VINYL_33_RPM_MS = VINYL_33_RPM_SEC * 1000

const DEG_PER_MS = (360 * VINYL_RPM) / 60_000
/** Ignore huge frame gaps (background tab) so the disc doesn't jump. */
const MAX_FRAME_MS = 64

type Listener = (angleDeg: number) => void

/** Unbounded clockwise degrees — keeps growing while the motor runs. */
let angleDeg = 0
let lastNow = 0
let holders = 0
let scrubLocks = 0
let rafId = 0
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener(angleDeg)
}

function tick(now: number) {
  const rawDt = now - lastNow
  lastNow = now
  // Motor only runs when someone wants spin AND the platter isn't being held/scrubbed.
  if (holders > 0 && scrubLocks === 0) {
    const dt = rawDt > 0 && rawDt < MAX_FRAME_MS ? rawDt : Math.min(MAX_FRAME_MS, Math.max(0, rawDt))
    if (dt > 0) {
      angleDeg += dt * DEG_PER_MS
      notify()
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

/** Take a spin hold (ref-counted). Call releaseVinylSpin when done. */
export function acquireVinylSpin(): void {
  holders += 1
  ensureLoop()
}

export function releaseVinylSpin(): void {
  holders = Math.max(0, holders - 1)
}

/** Hold the platter (motor stops; angle still nudged by scrub). */
export function beginVinylScrub(): void {
  scrubLocks += 1
  ensureLoop()
}

export function endVinylScrub(): void {
  scrubLocks = Math.max(0, scrubLocks - 1)
}

/** Manually rotate the platter (degrees; positive = clockwise / track forward). */
export function nudgeVinylAngle(deltaDeg: number): void {
  if (!Number.isFinite(deltaDeg) || deltaDeg === 0) return
  angleDeg += deltaDeg
  notify()
}

/**
 * Map a platter rotation to audio seconds at true 33⅓ RPM.
 * One full clockwise turn ≈ +1.8s of music.
 */
export function vinylDegreesToSeconds(deltaDeg: number): number {
  return (deltaDeg / 360) * VINYL_33_RPM_SEC
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
