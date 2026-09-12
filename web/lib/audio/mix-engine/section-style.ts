/**
 * Section-aware Auto DJ style. User mix style is a cap unless Smooth + auto.
 */

import { resolvePlaybackBpm } from '@/lib/audio/sonic-dna-mix'
import type { MixStylePreset, MixTechnique } from './mix-techniques'
import { presetToMixStyle, resolveEffectiveMixStyle } from './mix-techniques'
import { suggestMixStyle } from './mix-intelligence'
import {
  fallbackSections,
  sectionAtSec,
  type PhraseSectionId,
  type PhraseSectionMap,
} from './phrase-sections'
import type { MixStyle, MixTrackRef } from './types'

const STYLE_RANK: Record<MixStyle, number> = {
  crossfade: 0,
  'filter-eq': 1,
  'bass-swap': 2,
  cut: 3,
}

function capStyle(suggested: MixStyle, cap: MixStyle): MixStyle {
  return STYLE_RANK[suggested] <= STYLE_RANK[cap] ? suggested : cap
}

function readDuration(track: MixTrackRef): number {
  const d = Number(track.duration ?? track.waveformDurationSec)
  return d > 0 ? d : 180
}

function readDnaSections(track: MixTrackRef): PhraseSectionMap {
  const bpm = resolvePlaybackBpm(track) ?? track.bpm ?? 120
  const duration = readDuration(track)
  const base = fallbackSections(duration, bpm)
  const dna = track.sonic_dna
  if (!dna || typeof dna !== 'object') return base
  const root = dna as Record<string, unknown>
  const creative =
    (root.creative as Record<string, unknown> | undefined) ||
    (root.v2 as Record<string, unknown> | undefined) ||
    root
  const segments =
    (creative.segments as Record<string, unknown> | undefined) ||
    (root.segments as Record<string, unknown> | undefined)
  if (!segments || typeof segments !== 'object') return base
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const introEndSec = num(segments.introEndSec) ?? (num(segments.introEndRatio) != null
    ? duration * Number(segments.introEndRatio)
    : base.introEndSec)
  const dropStartSec = num(segments.dropStartSec) ?? (num(segments.dropRatio) != null
    ? duration * Number(segments.dropRatio)
    : base.dropStartSec)
  const breakStartSec = num(segments.breakStartSec) ?? (num(segments.breakRatio) != null
    ? duration * Number(segments.breakRatio)
    : base.breakStartSec)
  const outroStartSec = num(segments.outroStartSec) ?? (num(segments.outroStartRatio) != null
    ? duration * Number(segments.outroStartRatio)
    : base.outroStartSec)
  return {
    ...base,
    introEndSec,
    buildStartSec: introEndSec,
    dropStartSec: Math.max(introEndSec, dropStartSec),
    breakStartSec,
    outroStartSec: Math.max(dropStartSec, outroStartSec),
  }
}

export function outgoingSectionAt(
  outgoing: MixTrackRef,
  timeSec: number,
): PhraseSectionId {
  return sectionAtSec(readDnaSections(outgoing), timeSec)
}

export function styleFromOutgoingSection(section: PhraseSectionId): MixStyle {
  // Canonical Auto DJ OUT is always the last N bars (= outro). That blend
  // must stay Smooth — complementary bass on one handoff curve.
  if (section === 'outro' || section === 'intro') return 'crossfade'
  if (section === 'drop') return 'bass-swap'
  if (section === 'build' || section === 'break') return 'filter-eq'
  return 'crossfade'
}

export function resolveSectionAwareMixStyle(params: {
  outgoing: MixTrackRef
  incoming: MixTrackRef
  outSec: number
  userStyle: MixStylePreset
  techniques: MixTechnique[]
  currentStyle?: MixStyle
  sectionStyle?: boolean
}): MixStyle {
  const techniqueStyle = resolveEffectiveMixStyle(params.userStyle, params.techniques)
  const userMapped = presetToMixStyle(params.userStyle)
  const allowAuto =
    params.sectionStyle !== false &&
    (params.userStyle === 'crossfade' || params.techniques.includes('auto'))

  if (!allowAuto) {
    return params.currentStyle ?? techniqueStyle
  }

  const section = outgoingSectionAt(params.outgoing, params.outSec)
  const fromSection = styleFromOutgoingSection(section)
  // Phrase-out / intro: honor the user's Smooth handoff. DNA energy hints
  // must not rewrite every mix to Filter.
  if (section === 'outro' || section === 'intro') {
    return params.currentStyle ?? techniqueStyle
  }
  const fromDna = suggestMixStyle(params.outgoing, params.incoming, 'crossfade')
  const suggested =
    STYLE_RANK[fromSection] >= STYLE_RANK[fromDna] ? fromSection : fromDna

  // Techniques that override style (bass-swap / drop-cut / filter sweep) still win.
  if (
    params.techniques.includes('bass-swap') ||
    params.techniques.includes('drop-cut') ||
    params.techniques.some((t) => t === 'filter-sweep' || t === 'strip-tease' || t === 'echo-tail')
  ) {
    return techniqueStyle
  }

  const cap = userMapped === 'crossfade' ? 'cut' : userMapped
  return capStyle(suggested, cap)
}
