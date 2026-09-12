/**
 * Mix crossfader side-scroll jog — relative, longer-stroke than click-drag.
 * Drag maps absolute finger X → fader position; wheel accumulates soft deltas.
 */

export const XF_WHEEL_FINE_SCALE = 0.00055
/** Alt holds for finer trims. */
export const XF_WHEEL_SUPERFINE_SCALE = 0.00018
/** Cap per event so momentum flings stay smooth. */
export const XF_WHEEL_MAX_STEP_PX = 28
export const XF_WHEEL_SOFT_EXP = 0.72

const LINE_DELTA_PX = 16
const PAGE_DELTA_PX = 100

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function softPixels(pixels: number, exp = XF_WHEEL_SOFT_EXP): number {
  if (!Number.isFinite(pixels) || !pixels) return 0
  const a = Math.abs(pixels)
  return Math.sign(pixels) * Math.pow(a, exp)
}

export type CrossfaderWheelGesture = {
  deltaX: number
  deltaY: number
  deltaMode?: number
  shiftKey?: boolean
  altKey?: boolean
}

/**
 * Progress delta (−1…1 scale) from a wheel event.
 * Positive → toward B (right). Any dominant axis jogs while hovering the strip.
 */
export function crossfaderDeltaFromWheel({
  deltaX,
  deltaY,
  deltaMode = 0,
  shiftKey = false,
  altKey = false,
}: CrossfaderWheelGesture): number {
  const unit = deltaMode === 1 ? LINE_DELTA_PX : deltaMode === 2 ? PAGE_DELTA_PX : 1
  const x = (Number.isFinite(deltaX) ? deltaX : 0) * unit
  const y = (Number.isFinite(deltaY) ? deltaY : 0) * unit
  const raw = shiftKey
    ? Math.abs(x) > Math.abs(y)
      ? x
      : y
    : Math.abs(x) >= Math.abs(y)
      ? x
      : y
  if (!raw) return 0
  const capped = Math.max(-XF_WHEEL_MAX_STEP_PX, Math.min(XF_WHEEL_MAX_STEP_PX, raw))
  const soft = softPixels(capped)
  const scale = altKey ? XF_WHEEL_SUPERFINE_SCALE : XF_WHEEL_FINE_SCALE
  return soft * scale
}

export function applyCrossfaderWheelDelta(progress: number, delta: number): number {
  const base = Number.isFinite(progress) ? progress : XF_CENTER
  if (!Number.isFinite(delta) || !delta) return clamp01(base)
  return clamp01(base + delta)
}

export const XF_CENTER = 0.5
