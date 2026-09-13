/**
 * Per-zoom draw budgets for the canvas waveform engine.
 * Overview (zoomed out) favors SoundCloud-style dense filled silhouette.
 * Zoomed decks favor peak spikes + onset ticks (CDJ detail view).
 *
 * Column count is capped to ~CSS width × DPR so we keep a high-res tape in
 * memory but never paint more columns than the screen can resolve.
 */

export type WaveformDrawBudget = {
  /** Max columns / samples to paint in the visible window. */
  columns: number
  /** Draw sixteenth-note grid lines (tight zoom). */
  sixteenths: boolean
  /** Draw half-beat grid lines. */
  halfBeats: boolean
  /** Draw per-beat lines (vs bar/8-bar only). */
  beatLines: boolean
  /** Prefer continuous envelope fill over discrete columns. */
  continuous: boolean
  /** Full-track / wide overview — SoundCloud-style readable mass. */
  overview: boolean
  /** Paint Peak hairlines on top of RMS body (CDJ dual envelope). */
  peakSpikes: boolean
  /** Paint DNA/kick/snare/clap/hat onset ticks on the tape. */
  onsetTicks: boolean
}

export type WaveformDrawBudgetOpts = {
  /** CSS pixel width of the canvas. When set, columns ≈ width × dpr. */
  cssWidth?: number
  /** devicePixelRatio (clamped to 2 internally). */
  dpr?: number
}

/** Soft caps used when no CSS width is known (tests / SSR). */
function tierSoftCap(visibleBars: number): number {
  if (visibleBars <= 0) return 1600
  if (visibleBars <= 8) return 2048
  if (visibleBars <= 16) return 1800
  if (visibleBars <= 32) return 1400
  if (visibleBars <= 64) return 720
  return 560
}

function zoomColumnFactor(visibleBars: number): number {
  if (visibleBars <= 0) return 1
  if (visibleBars <= 8) return 1.35
  if (visibleBars <= 16) return 1.2
  return 1.05
}

/** Hard ceiling — denser than a typical retina Now Playing strip is wasted fill. */
export const WAVEFORM_COLUMNS_HARD_MAX = 4096

/** 0 = full track; otherwise bars visible. */
export function waveformDrawBudget(
  visibleBars: number,
  opts?: WaveformDrawBudgetOpts
): WaveformDrawBudget {
  const softCap = tierSoftCap(visibleBars)
  const overview = visibleBars <= 0 || visibleBars > 32
  const flags = {
    sixteenths: visibleBars > 0 && visibleBars <= 8,
    halfBeats: visibleBars > 0 && visibleBars <= 32,
    beatLines: visibleBars > 0,
    continuous: true,
    overview,
    // Overview: soft dual envelope; zoom: hard peak spikes + onset ticks
    peakSpikes: true,
    onsetTicks: !overview || visibleBars === 0,
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
