/**
 * Mix style + creative technique presets for Auto DJ.
 */

import type { MixIntelligence } from './mix-intelligence'
import type { EnergyCurve } from '@/lib/audio/auto-dj-preferences'
import type { MixStyle, MixTrackRef } from './types'
import { extractMeasured } from '@/lib/audio/sonic-dna-quality'

/** Primary mix style (UI row 1). */
export type MixStylePreset =
  | 'crossfade'
  | 'filter-eq'
  | 'cutout-filter'
  | 'bass-swap'
  | 'echo-out'
  | 'strip-tease'
  | 'backspin'

/** Sub-technique modifier (UI row 2). */
export type MixTechnique =
  | 'auto'
  | 'standard'
  | 'bass-swap'
  | 'vocal-blend'
  | 'filter-sweep'
  | 'strip-tease'
  | 'echo-tail'
  | 'drop-cut'
  | 'energy-build'
  | 'phrase-lock'
  | 'long-blend'

export const MIX_STYLE_PRESETS: Array<{ id: MixStylePreset; label: string; hint: string }> = [
  { id: 'crossfade', label: 'Smooth', hint: 'One handoff curve · incoming bass killed' },
  { id: 'filter-eq', label: 'Filter', hint: 'HPF/LPF + EQ sweep on shared progress' },
  { id: 'cutout-filter', label: 'Cut', hint: 'Late punch cut, then open incoming' },
  { id: 'bass-swap', label: 'Bass swap', hint: 'Aggressive low-end exchange' },
  { id: 'echo-out', label: 'Echo out', hint: 'Thin outgoing + synced echo tail' },
  { id: 'strip-tease', label: 'Strip tease', hint: 'Incoming waits, then filter opens' },
  { id: 'backspin', label: 'Backspin', hint: 'Outgoing hangs, late incoming bite' },
]

export const MIX_TECHNIQUES: Array<{ id: MixTechnique; label: string; hint: string }> = [
  { id: 'auto', label: 'DNA auto', hint: 'Sonic DNA picks phrase-lock / energy-build' },
  { id: 'standard', label: 'Standard', hint: 'Style only — one handoff curve' },
  { id: 'phrase-lock', label: 'Phrase lock', hint: 'Stronger vinyl-bend / kick lock' },
  { id: 'vocal-blend', label: 'Vocal blend', hint: 'Incoming waits so vocals do not collide' },
  { id: 'bass-swap', label: 'Bass swap', hint: 'Force aggressive low exchange' },
  { id: 'filter-sweep', label: 'Filter sweep', hint: 'Deep HPF/LPF ride (Filter engine)' },
  { id: 'strip-tease', label: 'Strip tease', hint: 'Delay incoming fade + filter open' },
  { id: 'echo-tail', label: 'Echo tail', hint: 'Outgoing echo send on the handoff' },
  { id: 'drop-cut', label: 'Drop cut', hint: 'Short late cut' },
  { id: 'energy-build', label: 'Energy build', hint: 'Incoming rises faster on the same curve' },
  { id: 'long-blend', label: 'Long blend', hint: 'Incoming stays quieter longer' },
]

/** Legacy transition mode persisted alongside mix presets (Auto DJ + DJ Mixer). */
export type TransitionMode = 'crossfade' | 'filter-eq' | 'cutout-filter'

/** Map persisted transition mode → engine mix style. */
export function transitionModeToMixStyle(mode: TransitionMode): MixStyle {
  switch (mode) {
    case 'filter-eq':
      return 'filter-eq'
    case 'cutout-filter':
      return 'cut'
    case 'crossfade':
    default:
      return 'crossfade'
  }
}

/** Map UI preset → engine MixStyle. */
export function presetToMixStyle(preset: MixStylePreset): MixStyle {
  switch (preset) {
    case 'filter-eq':
    case 'strip-tease':
    case 'echo-out':
      return 'filter-eq'
    case 'cutout-filter':
      return 'cut'
    case 'bass-swap':
      return 'bass-swap'
    case 'backspin':
      return 'crossfade'
    case 'crossfade':
    default:
      return 'crossfade'
  }
}

/** True when measured DNA indicates 4-on-the-floor / house / techno pocket. */
export function isFourOnFloorPocket(sonicDna: unknown): boolean {
  const measured = extractMeasured(sonicDna)
  if (!measured) return false
  const family = String(measured.drumFamily || '').toLowerCase()
  if (
    family.includes('four') ||
    family.includes('floor') ||
    family.includes('house') ||
    family.includes('techno')
  ) {
    return true
  }
  const kicks = measured.kickSteps || measured.kickPhraseSteps || []
  if (kicks.length >= 3) {
    const onFloor = [0, 4, 8, 12].filter((s) => kicks.includes(s)).length >= 3
    if (onFloor) return true
  }
  return false
}

const BROKEN_GROOVE_FAMILIES = [
  'breakbeat',
  'half-time',
  'halftime',
  'one-drop',
  'onedrop',
  'boom-bap',
  'boombap',
]

/** Breakbeat / half-time / one-drop — BeatSync kick-chase will flam. Use TempoSync. */
export function isBrokenGroovePocket(sonicDna: unknown): boolean {
  const measured = extractMeasured(sonicDna)
  if (!measured) return false
  const family = String(measured.drumFamily || '').toLowerCase()
  if (BROKEN_GROOVE_FAMILIES.some((name) => family.includes(name))) return true
  const feel = String(measured.timingFeel || '').toLowerCase()
  return feel.includes('half')
}

/** Resolve DNA auto techniques (phrase-lock, energy-build) from track pair quality. */
export function resolveEffectiveMixTechniques(
  techniques: MixTechnique[],
  outgoing: MixTrackRef,
  incoming: MixTrackRef,
): MixTechnique[] {
  if (!techniques.includes('auto')) {
    return techniques.filter((t) => t !== 'auto')
  }
  const outM = extractMeasured(outgoing.sonic_dna)
  const inM = extractMeasured(incoming.sonic_dna)
  const conf = Math.min(
    Number(outM?.bpmConfidence ?? 0.35) || 0.35,
    Number(inM?.bpmConfidence ?? 0.35) || 0.35,
  )
  const resolved: MixTechnique[] = []
  if (conf >= 0.62) resolved.push('phrase-lock')
  if (conf < 0.45) return resolved.length ? resolved : ['standard']
  const outE = typeof outgoing.energy_level === 'number' ? outgoing.energy_level : null
  const inE = typeof incoming.energy_level === 'number' ? incoming.energy_level : null
  if (outE != null && inE != null && inE - outE > 0.1) resolved.push('energy-build')
  if (resolved.length === 0) return ['standard']
  return resolved
}

/** Resolve engine style from preset + technique(s). transitionMode is legacy-only. */
export function resolveEffectiveMixStyle(
  preset: MixStylePreset,
  technique: MixTechnique | MixTechnique[],
  /** @deprecated Ignored unless techniques are auto/standard with no style override. */
  transitionMode?: TransitionMode,
): MixStyle {
  const techniques = Array.isArray(technique) ? technique : [technique]
  if (techniques.includes('bass-swap')) return 'bass-swap'
  if (techniques.includes('drop-cut')) return 'cut'
  if (
    techniques.some((t) =>
      t === 'filter-sweep' || t === 'strip-tease' || t === 'echo-tail',
    )
  ) {
    return 'filter-eq'
  }
  const fromPreset = presetToMixStyle(preset)
  if (fromPreset !== 'crossfade') return fromPreset
  if (
    transitionMode &&
    (techniques.includes('auto') ||
      techniques.includes('standard') ||
      techniques.length === 0)
  ) {
    return transitionModeToMixStyle(transitionMode)
  }
  return fromPreset
}

/** Apply one or more technique modifiers onto mix intelligence. */
export function applyTechniqueToIntelligence(
  intel: MixIntelligence,
  technique: MixTechnique | MixTechnique[],
  preset: MixStylePreset,
): MixIntelligence {
  const techniques = Array.isArray(technique) ? technique : [technique]
  if (techniques.includes('auto')) {
    return applySingleTechnique(intel, 'auto', preset)
  }
  let next = intel
  const active = techniques.filter((t) => t !== 'standard')
  if (active.length === 0) {
    return applySingleTechnique(next, 'standard', preset)
  }
  for (const t of active) {
    next = applySingleTechnique(next, t, preset)
  }
  return next
}

function applySingleTechnique(
  intel: MixIntelligence,
  technique: MixTechnique,
  preset: MixStylePreset,
): MixIntelligence {
  if (technique === 'auto' || technique === 'standard') {
    if (preset === 'strip-tease') {
      return { ...intel, incomingDelay: Math.max(intel.incomingDelay, 0.18), filterIntensity: 1.15 }
    }
    if (preset === 'echo-out') {
      return {
        ...intel,
        filterIntensity: 1.1,
        softTailStart: Math.max(0.75, intel.softTailStart - 0.06),
        echoSend: Math.max(intel.echoSend, 0.42),
        echoDelayBeats: 0.5,
      }
    }
    if (preset === 'backspin') {
      return { ...intel, softTailStart: 0.92, incomingDelay: 0.1 }
    }
    return intel
  }

  const next = { ...intel }
  switch (technique) {
    case 'phrase-lock':
      next.microStrength = Math.min(0.97, intel.microStrength + 0.14)
      break
    case 'vocal-blend':
      next.incomingDelay = Math.max(intel.incomingDelay, 0.1)
      next.filterIntensity = intel.filterIntensity * 0.92
      next.microStrength = Math.max(0.55, intel.microStrength - 0.04)
      break
    case 'bass-swap':
      next.filterIntensity = Math.max(intel.filterIntensity, 0.85)
      next.incomingDelay = Math.max(intel.incomingDelay, 0.06)
      break
    case 'filter-sweep':
      next.filterIntensity = Math.max(intel.filterIntensity, 1.25)
      break
    case 'strip-tease':
      next.incomingDelay = Math.max(intel.incomingDelay, 0.22)
      next.filterIntensity = Math.max(intel.filterIntensity, 1.1)
      break
    case 'echo-tail':
      next.filterIntensity = Math.max(intel.filterIntensity, 1.05)
      next.softTailStart = Math.max(0.78, intel.softTailStart - 0.05)
      next.echoSend = Math.max(intel.echoSend, 0.38)
      next.echoDelayBeats = 1
      break
    case 'drop-cut':
      next.softTailStart = 0.94
      next.incomingDelay = 0.14
      break
    case 'energy-build':
      next.energyScale = Math.max(intel.energyScale, 1.1)
      next.incomingDelay = Math.max(intel.incomingDelay, 0.08)
      break
    case 'long-blend':
      next.energyScale = Math.max(intel.energyScale, 1.08)
      next.softTailStart = Math.max(0.8, intel.softTailStart - 0.04)
      break
    default:
      break
  }
  return next
}

/** Apply energy-curve preference on top of mix intelligence. */
export function applyEnergyCurveToIntelligence(
  intel: MixIntelligence,
  curve: EnergyCurve,
): MixIntelligence {
  if (curve === 'build') {
    return {
      ...intel,
      energyScale: Math.max(intel.energyScale, 1.1),
      incomingDelay: Math.max(intel.incomingDelay, 0.06),
    }
  }
  if (curve === 'drop') {
    return {
      ...intel,
      softTailStart: Math.min(0.96, intel.softTailStart + 0.06),
      incomingDelay: Math.max(intel.incomingDelay, 0.1),
    }
  }
  return intel
}
