const DEFAULT_MIN = 64
const DEFAULT_MAX = 8192

/** Keep finite peak samples and cap length so a rescan cannot write a huge blob. */
export function sanitizeWaveformPeaks(
  raw: unknown,
  opts?: { min?: number; max?: number },
): number[] | null {
  if (!Array.isArray(raw)) return null
  const min = opts?.min ?? DEFAULT_MIN
  const max = opts?.max ?? DEFAULT_MAX
  const peaks: number[] = []
  for (const value of raw) {
    const n = Number(value)
    if (!Number.isFinite(n)) continue
    peaks.push(n)
  }
  if (peaks.length < min) return null
  if (peaks.length <= max) return peaks
  const step = peaks.length / max
  const downsampled: number[] = []
  for (let i = 0; i < max; i++) {
    downsampled.push(peaks[Math.min(peaks.length - 1, Math.floor(i * step))])
  }
  return downsampled
}
