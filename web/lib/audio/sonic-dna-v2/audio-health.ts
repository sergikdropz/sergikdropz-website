/**
 * Audio health gate — fail fast on silence / empty peaks before expensive analysis.
 */

export type AudioHealthResult = {
  ok: boolean
  score: number
  issues: string[]
}

export function assessAudioHealth(input: {
  peaks?: number[] | null
  durationSec?: number | null
}): AudioHealthResult {
  const issues: string[] = []
  const peaks = Array.isArray(input.peaks) ? input.peaks : null
  const duration = Number(input.durationSec)

  if (Number.isFinite(duration) && duration > 0 && duration < 5) {
    issues.push('Duration under 5s — unlikely a full track.')
  }
  if (!peaks || peaks.length < 8) {
    issues.push('Missing or tiny waveform — decode may have failed.')
    return { ok: false, score: 0.1, issues }
  }

  const abs = peaks.map((n) => Math.abs(Number(n) || 0))
  const peak = Math.max(...abs)
  const mean = abs.reduce((s, n) => s + n, 0) / abs.length
  if (peak < 0.02) issues.push('Near-silent peak level.')
  if (mean < 0.005) issues.push('Near-silent average energy.')
  const clipped = abs.filter((n) => n >= 0.98).length / abs.length
  if (clipped > 0.35) issues.push('Possible heavy clipping (>35% near-full samples).')

  const score = Math.max(
    0,
    Math.min(1, 1 - issues.length * 0.25 + (peak > 0.1 ? 0.2 : 0) + (mean > 0.02 ? 0.2 : 0)),
  )
  return { ok: issues.length === 0 || (peak >= 0.05 && mean >= 0.01), score, issues }
}
