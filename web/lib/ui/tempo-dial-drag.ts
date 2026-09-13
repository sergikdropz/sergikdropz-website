/** ADJ / tempo dial gestures — keep % in sync with the popup VerticalFader (−50…+50). */

export const TEMPO_DIAL_MIN_PCT = -50
export const TEMPO_DIAL_MAX_PCT = 50
/** Vertical pixels from 0% to either end of the fader travel. */
export const TEMPO_DIAL_TRAVEL_PX = 140
/** Pointer slop before a press counts as a drag instead of a tap. */
export const TEMPO_DIAL_DRAG_SLOP_PX = 3
/** Shift-drag multiplier for fine trims. */
export const TEMPO_DIAL_FINE_SCALE = 0.25
/** Percents landing inside this window snap to a hard 0% detent. */
const ZERO_DETENT_PCT = 0.15

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function roundTenth(value: number) {
  return Math.round(value * 10) / 10
}

function applyDetent(pct: number) {
  return Math.abs(pct) < ZERO_DETENT_PCT ? 0 : pct
}

export function isTempoDialDrag(deltaX: number, deltaY: number): boolean {
  return Math.hypot(deltaX, deltaY) >= TEMPO_DIAL_DRAG_SLOP_PX
}

/** Drag up speeds up, drag down slows down, relative to the % captured at pointer-down. */
export function tempoPctFromDrag({
  startPct,
  deltaY,
  fine = false,
}: {
  startPct: number
  deltaY: number
  fine?: boolean
}): number {
  const start = clamp(Number.isFinite(startPct) ? startPct : 0, TEMPO_DIAL_MIN_PCT, TEMPO_DIAL_MAX_PCT)
  const travel = (deltaY * (fine ? TEMPO_DIAL_FINE_SCALE : 1)) / TEMPO_DIAL_TRAVEL_PX
  // Up (negative deltaY) → higher tempo %, matching a vertical fader.
  const next = start - travel * (TEMPO_DIAL_MAX_PCT - TEMPO_DIAL_MIN_PCT) * 0.5
  return applyDetent(roundTenth(clamp(next, TEMPO_DIAL_MIN_PCT, TEMPO_DIAL_MAX_PCT)))
}

/** Keyboard equivalent of a short drag. */
export function nudgeTempoPct(pct: number, deltaPct: number): number {
  const safe = clamp(Number.isFinite(pct) ? pct : 0, TEMPO_DIAL_MIN_PCT, TEMPO_DIAL_MAX_PCT)
  return applyDetent(
    roundTenth(clamp(safe + deltaPct, TEMPO_DIAL_MIN_PCT, TEMPO_DIAL_MAX_PCT)),
  )
}
