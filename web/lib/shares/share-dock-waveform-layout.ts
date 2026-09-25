/** Locked CSS height for the share dock waveform row (mobile / sm+). */
export const SHARE_DOCK_WAVEFORM_HEIGHT_PX = 44
export const SHARE_DOCK_WAVEFORM_HEIGHT_PX_SM = 48

export function shareDockWaveformCssHeight(): number {
  if (typeof window === 'undefined') return SHARE_DOCK_WAVEFORM_HEIGHT_PX
  return window.matchMedia('(min-width: 640px)').matches
    ? SHARE_DOCK_WAVEFORM_HEIGHT_PX_SM
    : SHARE_DOCK_WAVEFORM_HEIGHT_PX
}

/** Ignore sub-pixel / mobile chrome jitter when sizing the share dock waveform. */
export function shareWaveformLayoutChanged(
  prevW: number,
  prevH: number,
  nextW: number,
  nextH: number,
  thresholdPx = 2,
): boolean {
  if (prevW <= 0 || prevH <= 0) return true
  return Math.abs(nextW - prevW) >= thresholdPx || Math.abs(nextH - prevH) >= thresholdPx
}

export function targetBarCount(cssW: number): number {
  return Math.max(80, Math.min(240, Math.floor(cssW / 2.5)))
}
