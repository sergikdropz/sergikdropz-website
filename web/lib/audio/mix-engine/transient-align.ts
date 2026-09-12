/**
 * Residual kick-onset align: grid snap gets you to a 16th; this closes ±20 ms
 * using waveform peak energy around the planned mix time.
 */

export type MixPeakSample = number | { positive?: number; negative?: number; rms?: number }

function nearestOnsetResidualLocal(
  timeSec: number,
  onsetsSec: number[] | null | undefined,
  windowSec = 0.028,
): number | null {
  if (!onsetsSec?.length || !Number.isFinite(timeSec)) return null
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
  return bestAbs <= window ? best : null
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
 * `null` = no paired onset in the window (do not treat as a 0 lock).
 */
export type OnsetPocketResidual = {
  kickSec: number | null
  clapSec: number | null
}

function pairOnsetResidual(
  outgoingTimeSec: number,
  incomingTimeSec: number,
  outgoingOnsets: number[] | null | undefined,
  incomingOnsets: number[] | null | undefined,
  windowSec: number,
): number | null {
  const out = nearestOnsetResidualLocal(outgoingTimeSec, outgoingOnsets, windowSec)
  const inn = nearestOnsetResidualLocal(incomingTimeSec, incomingOnsets, windowSec)
  if (out == null || inn == null) return null
  return out - inn
}

export function measureOnsetPocketResidual(params: {
  outgoingTimeSec: number
  incomingTimeSec: number
  outgoingKickOnsets?: number[] | null
  incomingKickOnsets?: number[] | null
  outgoingSnareOnsets?: number[] | null
  incomingSnareOnsets?: number[] | null
  kickWindowSec?: number
  clapWindowSec?: number
}): OnsetPocketResidual {
  const kickWindow = params.kickWindowSec ?? 0.032
  const clapWindow = params.clapWindowSec ?? 0.036
  const hasKick =
    (params.outgoingKickOnsets?.length ?? 0) >= 4 ||
    (params.incomingKickOnsets?.length ?? 0) >= 4
  const hasClap =
    (params.outgoingSnareOnsets?.length ?? 0) >= 4 ||
    (params.incomingSnareOnsets?.length ?? 0) >= 4
  return {
    kickSec: hasKick
      ? pairOnsetResidual(
          params.outgoingTimeSec,
          params.incomingTimeSec,
          params.outgoingKickOnsets,
          params.incomingKickOnsets,
          kickWindow,
        )
      : null,
    clapSec: hasClap
      ? pairOnsetResidual(
          params.outgoingTimeSec,
          params.incomingTimeSec,
          params.outgoingSnareOnsets,
          params.incomingSnareOnsets,
          clapWindow,
        )
      : null,
  }
}

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
  const maxAbs = params.maxAbsSec ?? 0.02
  const snareW = Math.max(0, Math.min(1, params.snareWeight ?? 0.35))
  const kickW = 1 - snareW * 0.55
  const pocket = measureOnsetPocketResidual({
    ...params,
    kickWindowSec: params.windowSec,
    clapWindowSec: params.windowSec,
  })

  let nudge = 0
  if (pocket.kickSec != null && pocket.clapSec != null) {
    nudge = pocket.kickSec * kickW + pocket.clapSec * snareW
  } else if (pocket.kickSec != null) {
    nudge = pocket.kickSec
  } else if (pocket.clapSec != null) {
    nudge = pocket.clapSec
  }
  return Math.max(-maxAbs, Math.min(maxAbs, nudge))
}
