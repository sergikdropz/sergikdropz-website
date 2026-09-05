/**
 * Residual kick-onset align: grid snap gets you to a 16th; this closes ±20 ms
 * using waveform peak energy around the planned mix time.
 */

export type MixPeakSample = number | { positive?: number; negative?: number; rms?: number }

function nearestOnsetResidualLocal(
  timeSec: number,
  onsetsSec: number[] | null | undefined,
  windowSec = 0.028,
): number {
  if (!onsetsSec?.length || !Number.isFinite(timeSec)) return 0
  const window = Math.max(0.012, Math.min(0.05, windowSec))
  let best = 0
  let bestAbs = window + 1
  for (const o of onsetsSec) {
    if (!Number.isFinite(o)) continue
    const d = o - timeSec
    const a = Math.abs(d)
    if (a <= window && a < bestAbs) {
      bestAbs = a
      best = d
    }
  }
  return bestAbs <= window ? best : 0
}

function sampleAmp(s: MixPeakSample): number {
  if (typeof s === 'number') return Math.abs(s)
  const p = Math.abs(Number(s.positive) || 0)
  const n = Math.abs(Number(s.negative) || 0)
  const r = Math.abs(Number(s.rms) || 0)
  return Math.max(p, n, r)
}

/**
 * Seconds from `timeSec` to the nearest energy peak in ±windowSec.
 * Positive => peak is later than the grid time (incoming should seek forward).
 */
export function kickOnsetResidualSec(params: {
  timeSec: number
  peaks: MixPeakSample[] | null | undefined
  durationSec: number
  windowSec?: number
}): number {
  const peaks = params.peaks
  const dur = params.durationSec
  if (!peaks?.length || !(dur > 0) || !Number.isFinite(params.timeSec)) return 0
  const window = Math.max(0.012, Math.min(0.045, params.windowSec ?? 0.028))
  const t = Math.max(0, Math.min(dur - 1e-4, params.timeSec))
  const n = peaks.length
  const i0 = Math.max(0, Math.floor(((t - window) / dur) * n))
  const i1 = Math.min(n - 1, Math.ceil(((t + window) / dur) * n))
  let bestI = Math.round((t / dur) * n)
  let bestAmp = -1
  for (let i = i0; i <= i1; i++) {
    const amp = sampleAmp(peaks[i]!)
    if (amp > bestAmp) {
      bestAmp = amp
      bestI = i
    }
  }
  if (bestAmp < 0.02) return 0
  const peakT = (bestI / Math.max(1, n - 1)) * dur
  const residual = peakT - t
  return Math.max(-window, Math.min(window, residual))
}

/** Nudge incoming so its peak lands with outgoing's peak (capped ±20 ms). */
export function transientPocketNudgeSec(params: {
  outgoingTimeSec: number
  incomingTimeSec: number
  outgoingPeaks?: MixPeakSample[] | null
  incomingPeaks?: MixPeakSample[] | null
  outgoingDurationSec?: number
  incomingDurationSec?: number
}): number {
  const outR = kickOnsetResidualSec({
    timeSec: params.outgoingTimeSec,
    peaks: params.outgoingPeaks,
    durationSec: params.outgoingDurationSec ?? 0,
  })
  const inR = kickOnsetResidualSec({
    timeSec: params.incomingTimeSec,
    peaks: params.incomingPeaks,
    durationSec: params.incomingDurationSec ?? 0,
  })
  return Math.max(-0.02, Math.min(0.02, outR - inR))
}

/**
 * Dual-grid residual: kick (downbeat) + snare/clap (backbeat).
 * Positive = incoming is early vs outgoing pocket (seek incoming forward).
 */
export function dualOnsetResidualNudgeSec(params: {
  outgoingTimeSec: number
  incomingTimeSec: number
  outgoingKickOnsets?: number[] | null
  incomingKickOnsets?: number[] | null
  outgoingSnareOnsets?: number[] | null
  incomingSnareOnsets?: number[] | null
  /** Weight snare/clap pocket (0–1). FoF pairs ~0.45; others ~0.15. */
  snareWeight?: number
  windowSec?: number
  maxAbsSec?: number
}): number {
  const window = params.windowSec ?? 0.028
  const maxAbs = params.maxAbsSec ?? 0.02
  const snareW = Math.max(0, Math.min(1, params.snareWeight ?? 0.35))
  const kickW = 1 - snareW * 0.55

  const outKick = nearestOnsetResidualLocal(
    params.outgoingTimeSec,
    params.outgoingKickOnsets,
    window,
  )
  const inKick = nearestOnsetResidualLocal(
    params.incomingTimeSec,
    params.incomingKickOnsets,
    window,
  )
  const kickNudge = outKick - inKick

  const outSnare = nearestOnsetResidualLocal(
    params.outgoingTimeSec,
    params.outgoingSnareOnsets,
    window,
  )
  const inSnare = nearestOnsetResidualLocal(
    params.incomingTimeSec,
    params.incomingSnareOnsets,
    window,
  )
  const snareNudge = outSnare - inSnare

  const hasKick =
    (params.outgoingKickOnsets?.length ?? 0) >= 4 ||
    (params.incomingKickOnsets?.length ?? 0) >= 4
  const hasSnare =
    (params.outgoingSnareOnsets?.length ?? 0) >= 4 ||
    (params.incomingSnareOnsets?.length ?? 0) >= 4

  let nudge = 0
  if (hasKick && hasSnare) {
    nudge = kickNudge * kickW + snareNudge * snareW
  } else if (hasKick) {
    nudge = kickNudge
  } else if (hasSnare) {
    nudge = snareNudge
  }
  return Math.max(-maxAbs, Math.min(maxAbs, nudge))
}
