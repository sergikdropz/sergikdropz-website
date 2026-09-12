/** Mini EQ dial gestures — keep the gain range in sync with the popup VerticalFader. */
export const EQ_DIAL_MIN_GAIN = -40
export const EQ_DIAL_MAX_GAIN = 12
/** Vertical pixels between the 0 dB detent and either end of the dial's travel. */
export const EQ_DIAL_TRAVEL_PX = 120
/** Pointer slop allowed before a press counts as a drag instead of a tap. */
export const EQ_DIAL_DRAG_SLOP_PX = 3
/** Shift-drag multiplier for fine trims. */
export const EQ_DIAL_FINE_SCALE = 0.25
/** Gains landing inside this window snap to a hard 0 dB detent. */
const ZERO_DETENT_DB = 0.5

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function roundTenth(value: number) {
  return Math.round(value * 10) / 10
}

function applyDetent(gain: number) {
  return Math.abs(gain) < ZERO_DETENT_DB ? 0 : gain
}

/** Gain → −1…1 knob travel, matching the knob's asymmetric boost/cut rotation. */
export function eqGainToDialPosition(gain: number): number {
  const safe = clamp(Number.isFinite(gain) ? gain : 0, EQ_DIAL_MIN_GAIN, EQ_DIAL_MAX_GAIN)
  return safe >= 0 ? safe / EQ_DIAL_MAX_GAIN : safe / -EQ_DIAL_MIN_GAIN
}

export function eqDialPositionToGain(position: number): number {
  const safe = clamp(Number.isFinite(position) ? position : 0, -1, 1)
  return roundTenth(safe >= 0 ? safe * EQ_DIAL_MAX_GAIN : safe * -EQ_DIAL_MIN_GAIN)
}

export function isEqDialDrag(deltaX: number, deltaY: number): boolean {
  return Math.hypot(deltaX, deltaY) >= EQ_DIAL_DRAG_SLOP_PX
}

/** Drag up boosts, drag down cuts, relative to the gain captured at pointer-down. */
export function eqGainFromDrag({
  startGain,
  deltaY,
  fine = false,
}: {
  startGain: number
  deltaY: number
  fine?: boolean
}): number {
  const travel = (deltaY * (fine ? EQ_DIAL_FINE_SCALE : 1)) / EQ_DIAL_TRAVEL_PX
  return applyDetent(eqDialPositionToGain(eqGainToDialPosition(startGain) - travel))
}

/** Keyboard equivalent of a short drag. */
export function nudgeEqGain(gain: number, deltaDb: number): number {
  const safe = clamp(Number.isFinite(gain) ? gain : 0, EQ_DIAL_MIN_GAIN, EQ_DIAL_MAX_GAIN)
  return applyDetent(
    roundTenth(clamp(safe + deltaDb, EQ_DIAL_MIN_GAIN, EQ_DIAL_MAX_GAIN)),
  )
}
