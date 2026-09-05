/**
 * Sonic DNA → playback stretch policy.
 * Decides native vs enhanced WASM formant path; never runs WASM at analysis time.
 */

import { profileFromSonicDna } from '@/lib/audio/waveform-intelligence'
import { extractMeasured } from '@/lib/audio/sonic-dna-quality'
import type { MixTrackRef } from './types'

export type StretchTier = 'native' | 'enhanced' | 'wasm'

export type StretchPolicy = {
  tier: StretchTier
  /** Max |rate − 1| before capping slider / mix rate */
  maxSafeRateDelta: number
  /** Use WASM formant worklet on incoming deck during mix glide */
  wasmOnMixGlide: boolean
  /** Stronger formant EQ compensation multiplier */
  formantGain: number
  /** Tempo slew smoothing (lower = smoother, less chop) */
  tempoSlew: number
  reason: string
}

const NATIVE_THRESHOLD = 0.035
const ENHANCED_THRESHOLD = 0.06

function readVocalWeight(track: MixTrackRef): number {
  const profile = track.sonic_dna ? profileFromSonicDna(track.sonic_dna) : null
  if (profile) return profile.spectralBias.vocals
  const measured = extractMeasured(track.sonic_dna)
  const entries = measured?.instrumentUsage?.entries ?? []
  if (entries.some((e) => e.category === 'vocals')) return 0.4
  return Math.min(0.25, Number(measured?.spectral?.relative?.presence ?? 0) * 0.35)
}

function readTransientWeight(track: MixTrackRef): number {
  const profile = track.sonic_dna ? profileFromSonicDna(track.sonic_dna) : null
  if (profile) return profile.spectralBias.kicks + profile.spectralBias.hats * 0.6
  const rel = extractMeasured(track.sonic_dna)?.spectral?.relative ?? {}
  return Math.min(0.6, (Number(rel.kick) || 0) * 0.5 + (Number(rel.air) || 0) * 0.4)
}

function hasReliableGrid(track: MixTrackRef): boolean {
  const off = track.beat_grid_offset
  return typeof off === 'number' && Number.isFinite(off) && off >= 0.012
}

/** Resolve stretch tier for a deck at a target playback rate. */
export function resolveStretchPolicy(
  track: MixTrackRef | null | undefined,
  targetRate: number,
  ctx?: { mixGlide?: boolean; incoming?: boolean }
): StretchPolicy {
  const rate = Number.isFinite(targetRate) && targetRate > 0 ? targetRate : 1
  const delta = Math.abs(rate - 1)
  const vocal = track ? readVocalWeight(track) : 0
  const transient = track ? readTransientWeight(track) : 0.3
  const gridOk = track ? hasReliableGrid(track) : false

  if (delta < NATIVE_THRESHOLD) {
    return {
      tier: 'native',
      maxSafeRateDelta: 0.5,
      wasmOnMixGlide: false,
      formantGain: 1,
      tempoSlew: 0.018,
      reason: 'within native window',
    }
  }

  const vocalHeavy = vocal > 0.28
  const percussive = transient > 0.35 && vocal < 0.2
  const needsWasm = delta >= ENHANCED_THRESHOLD || (vocalHeavy && delta >= 0.045)
  const tier: StretchTier = needsWasm ? 'wasm' : 'enhanced'

  let maxSafe = vocalHeavy ? 0.1 : percussive ? 0.14 : 0.12
  if (!gridOk) maxSafe = Math.min(maxSafe, 0.08)

  const wasmOnMixGlide = Boolean(
    ctx?.mixGlide && ctx?.incoming && tier === 'wasm' && gridOk
  )

  return {
    tier,
    maxSafeRateDelta: maxSafe,
    wasmOnMixGlide,
    formantGain: tier === 'wasm' ? 1.35 : 1.15,
    tempoSlew: tier === 'wasm' ? 0.012 : 0.015,
    reason: vocalHeavy
      ? 'vocal-forward — HQ formant'
      : percussive
        ? 'percussive — native+enhanced'
        : needsWasm
          ? 'large tempo delta'
          : 'moderate stretch',
  }
}

/** Clamp rate to policy-safe range. */
export function clampRateToPolicy(rate: number, policy: StretchPolicy): number {
  const lo = 1 - policy.maxSafeRateDelta
  const hi = 1 + policy.maxSafeRateDelta
  return Math.max(lo, Math.min(hi, rate))
}
