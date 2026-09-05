/**
 * Mix fade curves — style-aware, click-safe gain envelopes.
 * Filter-style EQ automation for shared-bus DJ filter mixes.
 */

import type { MixIntelligence } from './mix-intelligence'
import type { MixStyle } from './types'

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

/** Quintic smootherstep — flatter near 0 and 1 than classic smoothstep. */
export function smootherstep(x: number): number {
  const t = clamp01(x)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** Classic smoothstep. */
export function smoothstep(x: number): number {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}

/** Equal-power pair for x in [0,1] (0=all out, 1=all in). */
export function equalPowerGains(x: number): { a: number; b: number } {
  const t = clamp01(x)
  return {
    a: Math.cos(t * Math.PI * 0.5),
    b: Math.sin(t * Math.PI * 0.5),
  }
}

/**
 * Style-shaped dual-deck gains.
 * `a` = outgoing, `b` = incoming. Always ends at a≈0, b≈1.
 */
export function styleMixGains(
  style: MixStyle | undefined,
  rawProgress: number,
  intel?: MixIntelligence
): { a: number; b: number } {
  const x = clamp01(rawProgress)
  const delay = intel?.incomingDelay ?? 0
  const energyScale = intel?.energyScale ?? 1
  const inProgress = clamp01(Math.max(0, x - delay) / Math.max(1e-6, 1 - delay))
  // Higher energyScale lengthens the incoming fade-in during the overlap.
  const inX =
    energyScale > 1.02
      ? clamp01(Math.pow(inProgress, 1 / energyScale))
      : inProgress
  const energy = intel?.energyDelta ?? 0

  switch (style) {
    case 'cut': {
      const hold = energy > 0.1 ? 0.62 : 0.55
      const shaped = smootherstep(Math.max(0, (x - hold) / (1 - hold)))
      return equalPowerGains(shaped)
    }
    case 'filter-eq': {
      const delayHold = delay > 0.01 ? 0.2 : 0
      const outT = smootherstep(Math.max(0, (x - 0.08) / 0.92))
      const inT = smootherstep(Math.max(0, (inX - delayHold) / Math.max(0.55, 1 - delayHold)))
      const out = Math.cos(outT * Math.PI * 0.5)
      const inn = Math.sin(inT * Math.PI * 0.5)
      const mid = Math.sin(clamp01((x - 0.1) / 0.55) * Math.PI)
      const scoop = 1 - (0.07 + (intel?.vocalWeight ?? 0) * 0.03) * mid
      return { a: out * scoop, b: inn * scoop }
    }
    case 'bass-swap': {
      const outT = smootherstep(Math.pow(x, 0.82 + (intel?.transientWeight ?? 0) * 0.08))
      const inT = smootherstep(Math.min(1, inX * (1.06 + energy * 0.12)))
      return {
        a: Math.cos(outT * Math.PI * 0.5),
        b: Math.sin(inT * Math.PI * 0.5),
      }
    }
    case 'crossfade':
    default:
      return equalPowerGains(smootherstep(x))
  }
}

export type FilterMixEqGains = { low: number; mid: number; high: number }

/**
 * Intelligence-aware per-deck EQ for every mix style.
 */
export function intelligentDeckMixAtProgress(params: {
  progress: number
  style: MixStyle
  outBias?: FilterMixEqGains
  inBias?: FilterMixEqGains
  intel?: MixIntelligence
}): { outgoing: FilterMixEqGains; incoming: FilterMixEqGains } {
  const x = clamp01(params.progress)
  const outBase = params.outBias ?? { low: 0, mid: 0, high: 0 }
  const inBase = params.inBias ?? { low: 0, mid: 0, high: 0 }
  const vocal = params.intel?.vocalWeight ?? 0
  const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t)

  if (params.style === 'filter-eq' || params.style === 'cut') {
    const bus = filterMixEqAtProgress({
      progress: x,
      from: outBase,
      to: inBase,
      mode: params.style === 'cut' ? 'cut' : 'filter-eq',
    })
    const vBoost = vocal * 2.5
    return {
      outgoing: {
        low: bus.low - vBoost,
        mid: bus.mid - vBoost * 0.4,
        high: bus.high + vBoost * 0.3,
      },
      incoming: {
        low: inBase.low + lerp(-8, inBase.low, x),
        mid: inBase.mid,
        high: inBase.high + x * 2,
      },
    }
  }

  if (params.style === 'bass-swap') {
    return crossfadeDeckEqAtProgress({
      progress: x,
      style: 'bass-swap',
      outBias: outBase,
      inBias: inBase,
    })
  }

  return crossfadeDeckEqAtProgress({
    progress: x,
    style: 'crossfade',
    outBias: outBase,
    inBias: inBase,
  })
}

/**
 * Per-deck EQ during overlap — outgoing bass swap + incoming build.
 */
export function crossfadeDeckEqAtProgress(params: {
  progress: number
  style?: MixStyle
  outBias?: FilterMixEqGains
  inBias?: FilterMixEqGains
}): { outgoing: FilterMixEqGains; incoming: FilterMixEqGains } {
  const x = clamp01(params.progress)
  const outBase = params.outBias ?? { low: 0, mid: 0, high: 0 }
  const inBase = params.inBias ?? { low: 0, mid: 0, high: 0 }
  const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t)

  if (params.style === 'bass-swap') {
    const swap = smootherstep(Math.max(0, (x - 0.08) / 0.72))
    return {
      outgoing: {
        low: outBase.low - swap * 14,
        mid: outBase.mid - swap * 2.5,
        high: outBase.high + swap * 1.5,
      },
      incoming: {
        low: inBase.low - (1 - swap) * 10 + swap * 2,
        mid: inBase.mid + swap * 1.5,
        high: inBase.high + swap * 2,
      },
    }
  }

  // Smooth: one shallow bass handoff. No mid scoop / air lift / extra duck.
  const swap = smootherstep(x)
  return {
    outgoing: {
      low: lerp(outBase.low, outBase.low - 8, swap),
      mid: outBase.mid,
      high: outBase.high,
    },
    incoming: {
      low: lerp(inBase.low - 6, inBase.low, swap),
      mid: inBase.mid,
      high: inBase.high,
    },
  }
}

/**
 * Shared-bus EQ automation for Filter / Cut mix styles.
 * Mimics a DJ filter: open (kill low / lift air) → hold → open into incoming pocket.
 */
export function filterMixEqAtProgress(params: {
  progress: number
  from: FilterMixEqGains
  to: FilterMixEqGains
  mode?: 'filter-eq' | 'cut'
}): FilterMixEqGains {
  const x = clamp01(params.progress)
  const { from, to } = params
  const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t)

  if (params.mode === 'cut') {
    // Punchy cutout: deep scoop around the bite, then snap to incoming bias
    const kill = Math.sin(Math.min(1, x / 0.4) * Math.PI)
    const open = smootherstep(Math.max(0, (x - 0.38) / 0.62))
    return {
      low: lerp(from.low, to.low, open) - kill * 26,
      mid: lerp(from.mid, to.mid, open) - kill * 9,
      high: lerp(from.high, to.high, open) + kill * 2.5,
    }
  }

  // Classic filter mix on a shared EQ bus:
  // 1) Open outgoing (HPF feel)  2) Hold mid scoop  3) Open into incoming DNA
  const openOut = smootherstep(Math.min(1, x / 0.36))
  const hold = Math.sin(clamp01((x - 0.1) / 0.52) * Math.PI)
  const openIn = smootherstep(Math.max(0, (x - 0.4) / 0.6))
  const residual = (1 - openIn) * openOut

  const lowKill = residual * 18 + hold * 7
  const midScoop = residual * 4.5 + hold * 3.5
  const highLift = residual * 3.2 + hold * 1.2

  return {
    low: lerp(from.low, to.low, openIn) - lowKill,
    mid: lerp(from.mid, to.mid, openIn) - midScoop,
    high: lerp(from.high, to.high, openIn) + highLift,
  }
}

/**
 * Tail guard: once past `start`, force outgoing toward silence so pause() is click-free.
 * Late start so Smooth is one fade, not a double cliff.
 */
export function applySoftTail(
  gains: { a: number; b: number },
  rawProgress: number,
  start = 0.88
): { a: number; b: number } {
  if (rawProgress < start) return gains
  const u = clamp01((rawProgress - start) / (1 - start))
  const tail = smootherstep(u)
  return {
    a: gains.a * (1 - tail),
    // Fully open incoming through the tail — no energy dip at handoff
    b: gains.b + (1 - gains.b) * tail,
  }
}
