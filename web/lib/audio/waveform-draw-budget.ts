/**
 * Per-zoom draw budgets for the canvas waveform engine.
 * Overview (zoomed out) favors SoundCloud-style dense filled silhouette.
 *
 * Column count is capped to ~CSS width × DPR so we keep a high-res tape in
 * memory but never paint more columns than the screen can resolve.
 */

export type WaveformDrawBudget = {
  /** Max columns / samples to paint in the visible window. */
  columns: number
  /** Draw half-beat grid lines. */
  halfBeats: boolean
  /** Draw per-beat lines (vs bar/8-bar only). */
  beatLines: boolean
  /** Prefer continuous envelope fill over discrete columns. */
  continuous: boolean
  /** Full-track / wide overview — SoundCloud-style readable mass. */
  overview: boolean
}

export type WaveformDrawBudgetOpts = {
  /** CSS pixel width of the canvas. When set, columns ≈ width × dpr. */
  cssWidth?: number
  /** devicePixelRatio (clamped to 2 internally). */
  dpr?: number
}

/** Soft caps used when no CSS width is known (tests / SSR). */
function tierSoftCap(visibleBars: number): number {
  if (visibleBars <= 0) return 1400
  if (visibleBars <= 8) return 1600
  if (visibleBars <= 16) return 1400
  if (visibleBars <= 32) return 1200
  if (visibleBars <= 64) return 560
  return 480
}

function zoomColumnFactor(visibleBars: number): number {
  if (visibleBars <= 0) return 1
  if (visibleBars <= 8) return 1.2
  if (visibleBars <= 16) return 1.1
  return 1
}

/** Hard ceiling — denser than a typical retina Now Playing strip is wasted fill. */
export const WAVEFORM_COLUMNS_HARD_MAX = 2048

/** 0 = full track; otherwise bars visible. */
export function waveformDrawBudget(
  visibleBars: number,
  opts?: WaveformDrawBudgetOpts
): WaveformDrawBudget {
  const softCap = tierSoftCap(visibleBars)
  const flags = {
    halfBeats: visibleBars > 0 && visibleBars <= 32,
    beatLines: visibleBars > 0,
    continuous: true,
    overview: visibleBars <= 0 || visibleBars > 32,
  }

  const cssWidth = opts?.cssWidth
  if (cssWidth != null && cssWidth > 0) {
    const dpr = Math.min(2, Math.max(1, opts?.dpr ?? 1))
    const pixels = Math.ceil(cssWidth * dpr)
    const desired = Math.ceil(pixels * zoomColumnFactor(visibleBars))
    return {
      columns: Math.max(160, Math.min(WAVEFORM_COLUMNS_HARD_MAX, desired)),
      ...flags,
    }
  }

  return { columns: softCap, ...flags }
}
