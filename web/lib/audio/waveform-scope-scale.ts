/**
 * Scope amplitude scaling inspired by MiniMeters' open-source stack
 * (Preferences → opensource.html):
 * - Paul Mineiro fasterlog2 (fastapprox) — log-domain level mapping
 * - MiniMeters Waveform "Scaled" vs "Linear" display modes
 *
 * We use these for accurate tape/oscilloscope readings so quiet material stays
 * visible without painting a bright filled "background" blob.
 */

/** Mineiro fasterlog2 (BSD) — float bit-hack approx of log2(x) for x > 0. */
export function fasterLog2(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return -Infinity
  // IEEE-754 float view
  const f32 = new Float32Array(1)
  const u32 = new Uint32Array(f32.buffer)
  f32[0] = x
  // y = reinterpret_cast bits as float magnitude proxy
  let y = u32[0]
  y *= 1.1920928955078125e-7 // 1/(1<<23)
  return y - 126.94201586
}

const LOG2_10 = Math.LOG2E * Math.LN10 // log2(10)

/** Approximate 20*log10(x) via fasterlog2. */
export function fasterDbFs(linear: number): number {
  const x = Math.max(1e-12, linear)
  return (20 * fasterLog2(x)) / LOG2_10
}

export type ScopeDisplayScale = 'scaled' | 'linear'

/**
 * Map linear peak [0..1] → display height [0..1].
 * - scaled: MiniMeters Scaled — lift quiet samples (log/dB window)
 * - linear: 1:1 peak mapping (true oscilloscope proportions)
 */
export function scopeAmplitude(
  linear: number,
  scale: ScopeDisplayScale = 'scaled',
  options?: { floorDb?: number; ceilingDb?: number }
): number {
  const v = Math.max(0, Math.min(1, linear))
  if (scale === 'linear') return v

  const floorDb = options?.floorDb ?? -54
  const ceilingDb = options?.ceilingDb ?? 0
  const db = fasterDbFs(Math.max(1e-8, v))
  const t = (db - floorDb) / Math.max(1e-6, ceilingDb - floorDb)
  return Math.max(0, Math.min(1, t))
}
