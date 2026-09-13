/**
 * Phase-align meter jog gestures — CDJ-style side-scroll / drag for beat nudge.
 *
 * Wheel and drag share one seconds mapping; the wheel is geared much finer and
 * inverted so natural trackpad scroll pushes the needle the expected way.
 */

export type PhaseJogFeel = 'fine' | 'normal' | 'coarse'

/** Side-scroll gear: ~30× longer stroke than a 1:1 drag of the same pixels. */
export const PHASE_WHEEL_FINE_SCALE = 0.035
/** Alt holds the jog down to sub-millisecond steps. */
export const PHASE_WHEEL_SUPERFINE_SCALE = 0.009
/** Drag gear — still finer than raw strip mapping, like a light jog touch. */
export const PHASE_DRAG_SCALE = 0.32
/** Cap per wheel event so momentum flings stay smooth. */
export const PHASE_WHEEL_MAX_STEP_PX = 20
/** Soft-response exponent (<1 damps big flicks, keeps tiny ticks alive). */
export const PHASE_JOG_SOFT_EXP = 0.72
/** Magnetic snap width as a fraction of one beat (matches the green LOCK band). */
export const PHASE_JOG_SNAP_BEAT_FRAC = 0.02

/** Multipliers applied on top of the base wheel / drag gears. */
export const PHASE_JOG_FEEL_SCALES: Record<
  PhaseJogFeel,
  { wheel: number; drag: number; alt: number }
> = {
  fine: { wheel: 0.55, drag: 0.55, alt: 0.45 },
  normal: { wheel: 1, drag: 1, alt: 1 },
  coarse: { wheel: 1.85, drag: 1.75, alt: 1.6 },
}

/** Pixel equivalents for browsers that report line / page wheel deltas. */
const LINE_DELTA_PX = 16
const PAGE_DELTA_PX = 100

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export type PhaseWheelGesture = {
  deltaX: number
  deltaY: number
  /** WheelEvent.deltaMode — 0 pixel, 1 line, 2 page. */
  deltaMode?: number
  shiftKey?: boolean
  altKey?: boolean
  feel?: PhaseJogFeel
  /** Extra multiplier (1 = default stroke length). */
  sensitivity?: number
}

/** Sub-linear shaping so large flicks ease off like a CDJ jog. */
export function softPhaseJogPixels(pixels: number, exp = PHASE_JOG_SOFT_EXP): number {
  if (!Number.isFinite(pixels) || !pixels) return 0
  const a = Math.abs(pixels)
  const shaped = Math.pow(a, exp)
  return Math.sign(pixels) * shaped
}

function resolveSensitivity(sensitivity?: number): number {
  if (!Number.isFinite(sensitivity) || !(Number(sensitivity) > 0)) return 1
  return Math.max(0.25, Math.min(5, Number(sensitivity)))
}

/**
 * Horizontal wheel intent in pixels, or 0 when there is no usable delta.
 *
 * While hovering the phase strip any wheel axis jogs (mouse wheel = vertical),
 * so the mixer panel does not steal the gesture. Direction is inverted vs raw
 * delta so natural trackpad scroll moves the needle the CDJ way.
 */
export function phaseWheelPixels({
  deltaX,
  deltaY,
  deltaMode = 0,
  shiftKey = false,
  altKey = false,
  feel = 'normal',
  sensitivity = 1,
}: PhaseWheelGesture): number {
  const unit = deltaMode === 1 ? LINE_DELTA_PX : deltaMode === 2 ? PAGE_DELTA_PX : 1
  const x = (Number.isFinite(deltaX) ? deltaX : 0) * unit
  const y = (Number.isFinite(deltaY) ? deltaY : 0) * unit
  // Prefer the dominant axis. Shift keeps the old “force vertical → jog” path.
  // Vertical alone still jogs — this strip is a dedicated jog control.
  const raw = shiftKey
    ? Math.abs(x) > Math.abs(y)
      ? x
      : y
    : Math.abs(x) >= Math.abs(y)
      ? x
      : y
  if (!raw) return 0
  // Invert: trackpad scroll-right → negative pixels → needle left when polarity
  // maps offset the CDJ way (see snapPhaseJogDelta).
  const inverted = -raw
  const capped = clamp(inverted, -PHASE_WHEEL_MAX_STEP_PX, PHASE_WHEEL_MAX_STEP_PX)
  const soft = softPhaseJogPixels(capped)
  const scales = PHASE_JOG_FEEL_SCALES[feel] ?? PHASE_JOG_FEEL_SCALES.normal
  const base = altKey
    ? PHASE_WHEEL_SUPERFINE_SCALE * scales.alt
    : PHASE_WHEEL_FINE_SCALE * scales.wheel
  return soft * base * resolveSensitivity(sensitivity)
}

/** Pointer drag pixels → geared jog pixels (same direction as the finger). */
export function phaseDragPixels(
  dx: number,
  feel: PhaseJogFeel = 'normal',
  sensitivity = 1,
): number {
  if (!Number.isFinite(dx) || !dx) return 0
  const scales = PHASE_JOG_FEEL_SCALES[feel] ?? PHASE_JOG_FEEL_SCALES.normal
  return softPhaseJogPixels(dx) * PHASE_DRAG_SCALE * scales.drag * resolveSensitivity(sensitivity)
}

/** Horizontal pixels → seconds, using the beats currently spanned by the strip. */
export function phaseNudgeSecFromPixels({
  pixels,
  widthPx,
  windowBeats,
  bpm,
}: {
  pixels: number
  widthPx: number
  windowBeats: number
  bpm: number
}): number {
  if (!Number.isFinite(pixels) || !pixels) return 0
  if (!(bpm > 0) || !(windowBeats > 0) || !(widthPx > 0)) return 0
  return (pixels / widthPx) * windowBeats * (60 / bpm)
}

/**
 * How displayed phase error moves when the deck's grid offset is nudged.
 * +1 → offset↑ raises err (live sync master); −1 → offset↑ lowers err
 * (idle sync / local grid).
 */
export type PhaseNudgePolarity = 1 | -1

/**
 * Magnetic center snap: when a jog step would cross or land inside the lock
 * band while moving toward zero, clamp the step so err lands exactly on 0.
 */
export function snapPhaseJogDelta({
  errSec,
  deltaSec,
  bpm,
  polarity = -1,
  snapBeatFrac = PHASE_JOG_SNAP_BEAT_FRAC,
}: {
  errSec: number | null | undefined
  deltaSec: number
  bpm: number
  polarity?: PhaseNudgePolarity
  snapBeatFrac?: number
}): { deltaSec: number; snapped: boolean } {
  if (!Number.isFinite(deltaSec) || !deltaSec) return { deltaSec: 0, snapped: false }
  if (!(bpm > 0) || errSec == null || !Number.isFinite(errSec)) {
    return { deltaSec, snapped: false }
  }
  if (!(snapBeatFrac > 0)) return { deltaSec, snapped: false }
  const snapSec = Math.max(0.001, (60 / bpm) * snapBeatFrac)
  // Already locked — let the DJ pull out of the magnet without fighting.
  if (Math.abs(errSec) <= snapSec * 0.35) {
    return { deltaSec, snapped: false }
  }
  const nextErr = errSec + polarity * deltaSec
  const crossed = Math.sign(errSec) !== 0 && Math.sign(nextErr) !== Math.sign(errSec)
  const towardZero = crossed || Math.abs(nextErr) < Math.abs(errSec) - 1e-12
  if (!towardZero) return { deltaSec, snapped: false }
  const inBand = Math.abs(nextErr) <= snapSec
  if (!crossed && !inBand) return { deltaSec, snapped: false }
  // polarity * deltaSnap = -errSec  →  deltaSnap = -errSec / polarity
  return { deltaSec: -errSec / polarity, snapped: true }
}

/**
 * Offset nudge that centers the displayed phase error (needle → 0).
 * polarity matches snapPhaseJogDelta.
 */
export function centerPhaseDeltaSec({
  errSec,
  polarity = -1,
}: {
  errSec: number | null | undefined
  polarity?: PhaseNudgePolarity
}): number {
  if (errSec == null || !Number.isFinite(errSec) || !errSec) return 0
  return -errSec / polarity
}
