/**
 * Sonic DNA intelligence for all mix styles — EQ, filter, gain, phase, stretch.
 */

import { eqBiasFromDna, resolvePlaybackBpm } from '@/lib/audio/sonic-dna-mix'
import { profileFromSonicDna } from '@/lib/audio/waveform-intelligence'
import { energyOverlapFactor } from './plan-from-dna'
import { isFourOnFloorPocket } from './mix-techniques'
import { resolveStretchPolicy, type StretchPolicy } from './stretch-policy'
import type { MixStyle, MixTrackRef } from './types'

export type MixIntelligence = {
  outBias: { low: number; mid: number; high: number }
  inBias: { low: number; mid: number; high: number }
  vocalWeight: number
  transientWeight: number
  energyDelta: number
  energyScale: number
  bpmDelta: number
  /** Phase micro-correction strength multiplier */
  microStrength: number
  /** Soft-tail start (0–1 mix progress) */
  softTailStart: number
  /** Outgoing HPF sweep intensity 0–1 */
  filterIntensity: number
  /** Delay incoming fade (0–0.3 progress) when bass-heavy */
  incomingDelay: number
  outgoingStretch: StretchPolicy
  incomingStretch: StretchPolicy
  suggestedStyle?: MixStyle
  /** Pre-fader delay send 0–1 */
  echoSend: number
  echoDelayBeats: 0.5 | 1
  /** Extra outgoing low cut during overlap (dB) */
  lowDuckDb: number
}

function readEnergy(track: MixTrackRef): number | null {
  if (typeof track.energy_level === 'number') return track.energy_level
  return null
}

/**
 * DNA style hint for UI / intelligence only.
 * Never rewrite a live Smooth plan — Auto DJ honors the user's mix style.
 */
export function suggestMixStyle(
  outgoing: MixTrackRef,
  incoming: MixTrackRef,
  userStyle: MixStyle
): MixStyle {
  if (userStyle !== 'crossfade') return userStyle

  const outE = readEnergy(outgoing)
  const inE = readEnergy(incoming)
  const outProfile = outgoing.sonic_dna ? profileFromSonicDna(outgoing.sonic_dna) : null
  const inProfile = incoming.sonic_dna ? profileFromSonicDna(incoming.sonic_dna) : null

  const outBpm = resolvePlaybackBpm(outgoing) ?? outgoing.bpm ?? 120
  const inBpm = resolvePlaybackBpm(incoming) ?? incoming.bpm ?? 120
  const bpmDelta = Math.abs(outBpm - inBpm) / Math.max(outBpm, inBpm)

  const outVocal = outProfile?.spectralBias.vocals ?? 0
  const inVocal = inProfile?.spectralBias.vocals ?? 0
  const vocalMix = Math.max(outVocal, inVocal)

  const fourOnFloor =
    isFourOnFloorPocket(outgoing.sonic_dna) && isFourOnFloorPocket(incoming.sonic_dna)

  if (fourOnFloor && bpmDelta < 0.06 && vocalMix < 0.28) return 'bass-swap'
  if (bpmDelta > 0.08 && vocalMix < 0.25) return 'bass-swap'
  if (outE != null && inE != null && inE - outE > 0.15) return 'filter-eq'
  if (vocalMix > 0.35) return 'filter-eq'
  return 'crossfade'
}

/** Build intelligence profile for a transition. */
export function buildMixIntelligence(params: {
  outgoing: MixTrackRef
  incoming: MixTrackRef
  style: MixStyle
  outgoingRate?: number
  incomingTargetRate?: number
}): MixIntelligence {
  const outProfile = params.outgoing.sonic_dna ? profileFromSonicDna(params.outgoing.sonic_dna) : null
  const inProfile = params.incoming.sonic_dna ? profileFromSonicDna(params.incoming.sonic_dna) : null

  const outBpm = resolvePlaybackBpm(params.outgoing) ?? params.outgoing.bpm ?? 120
  const inBpm = resolvePlaybackBpm(params.incoming) ?? params.incoming.bpm ?? 120
  const bpmDelta = Math.abs(outBpm - inBpm) / Math.max(outBpm, inBpm)

  const outE = readEnergy(params.outgoing)
  const inE = readEnergy(params.incoming)
  const energyDelta = outE != null && inE != null ? inE - outE : 0

  const vocalWeight = Math.max(outProfile?.spectralBias.vocals ?? 0, inProfile?.spectralBias.vocals ?? 0)
  const transientWeight = Math.max(
    (outProfile?.spectralBias.kicks ?? 0) + (outProfile?.spectralBias.hats ?? 0) * 0.5,
    (inProfile?.spectralBias.kicks ?? 0) + (inProfile?.spectralBias.hats ?? 0) * 0.5
  )

  const outRate = params.outgoingRate ?? 1
  const inTarget = params.incomingTargetRate ?? 1

  const style = params.style
  let microStrength = style === 'crossfade' ? 0.68 : style === 'filter-eq' ? 0.72 : 0.58
  if (bpmDelta > 0.06) microStrength += 0.05
  if (vocalWeight > 0.3) microStrength -= 0.04
  microStrength = Math.max(0.45, Math.min(0.88, microStrength))

  const isSmooth = style === 'crossfade'
  let softTailStart = style === 'cut' ? 0.9 : style === 'filter-eq' ? 0.88 : 0.88
  if (!isSmooth && energyDelta < -0.1) softTailStart -= 0.04

  let filterIntensity = style === 'filter-eq' || style === 'cut' ? 1 : isSmooth ? 0 : 0.55
  if (!isSmooth && vocalWeight > 0.3) filterIntensity += 0.15
  if (style === 'bass-swap') filterIntensity = 0.75

  const incomingDelay =
    isSmooth
      ? 0
      : (inProfile?.spectralBias.bass ?? 0) > 0.35 && style !== 'cut'
        ? 0.08
        : 0

  return {
    outBias: eqBiasFromDna(params.outgoing.sonic_dna),
    inBias: eqBiasFromDna(params.incoming.sonic_dna),
    vocalWeight,
    transientWeight,
    energyDelta,
    energyScale: energyOverlapFactor(params.outgoing, params.incoming),
    bpmDelta,
    microStrength,
    softTailStart,
    filterIntensity,
    incomingDelay,
    outgoingStretch: resolveStretchPolicy(params.outgoing, outRate),
    incomingStretch: (() => {
      const policy = resolveStretchPolicy(params.incoming, inTarget, {
        mixGlide: true,
        incoming: true,
      })
      if (isSmooth) {
        policy.tempoSlew = Math.min(policy.tempoSlew, 0.012)
      }
      return policy
    })(),
    suggestedStyle: suggestMixStyle(params.outgoing, params.incoming, style),
    echoSend: 0,
    echoDelayBeats: 0.5,
    lowDuckDb: isSmooth
      ? 0
      : isFourOnFloorPocket(params.outgoing.sonic_dna) &&
          isFourOnFloorPocket(params.incoming.sonic_dna)
        ? 8
        : 4,
  }
}
