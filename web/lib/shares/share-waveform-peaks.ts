/** Peak tape helpers shared by the share dock and story-clip pickers. */

export function downsamplePeaks(peaks: number[], buckets: number): number[] {
  if (peaks.length <= buckets) return peaks
  const out: number[] = new Array(buckets)
  const step = peaks.length / buckets
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * step)
    const end = Math.max(start + 1, Math.floor((i + 1) * step))
    let max = 0
    for (let j = start; j < end && j < peaks.length; j++) {
      const v = Math.abs(peaks[j]!)
      if (v > max) max = v
    }
    out[i] = max
  }
  return out
}

export function normalizePeaks(peaks: number[]): number[] {
  let max = 0
  for (const p of peaks) {
    const v = Math.abs(p)
    if (v > max) max = v
  }
  if (max <= 0) return peaks.map(() => 0.12)
  return peaks.map((p) => Math.max(0.1, Math.abs(p) / max))
}

export function coercePeaks(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length < 16) return null
  const peaks: number[] = []
  for (const value of raw) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      peaks.push(value)
      continue
    }
    if (value && typeof value === 'object') {
      const row = value as { positive?: number; rms?: number; negative?: number }
      const n = Number(row.positive ?? row.rms ?? row.negative)
      if (Number.isFinite(n)) peaks.push(n)
    }
  }
  return peaks.length >= 16 ? peaks : null
}
