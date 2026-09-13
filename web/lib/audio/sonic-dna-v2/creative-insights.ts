/**
 * Creative insights derived from measured + waveform — grounded claims only.
 * Segment boundaries snap to the file-start 8-bar phrase lattice.
 */

import type { WaveformStats } from './waveform-stage'
import type { PocketFingerprint } from './pocket-fingerprint'
import {
  analyzePhraseSections,
  fallbackSections,
  toLegacySegmentRatios,
  type PhraseSectionMap,
} from '@/lib/audio/mix-engine/phrase-sections'
import { snapToFileStartPhrase } from '@/lib/audio/mix-engine/phrase-lattice'

export type SegmentMap = {
  introEndRatio: number
  dropRatio: number
  breakRatio: number | null
  outroStartRatio: number
  mixInBars: 8 | 16 | 32
  mixOutBars: 8 | 16 | 32
  /** Absolute section starts on file-start phrase lattice (optional). */
  introEndSec?: number
  dropStartSec?: number
  breakStartSec?: number | null
  outroStartSec?: number
  introEndPhrase?: number
  dropPhrase?: number
  breakPhrase?: number | null
  outroPhrase?: number
}

export type FloorHypothesis = {
  label: 'warm-up' | 'peak-warehouse' | 'after-hours' | 'tool' | 'unknown'
  confidence: number
  reason: string
}

export type CreativeInsights = {
  segments: SegmentMap
  tensionPeakRatio: number
  floor: FloorHypothesis
  vocalPresence: number
  silenceRatio: number
  mixNotes: string
}

export function buildSegmentMap(
  stats: WaveformStats | null | undefined,
  bpm: number | null | undefined,
  opts?: {
    durationSec?: number | null
    peaks?: Array<number | { positive?: number; negative?: number; rms?: number }> | null
    kickOnsetSec?: number[]
    snareClapOnsetSec?: number[]
  },
): SegmentMap {
  const tempo = Number(bpm) || 120
  const duration = opts?.durationSec && opts.durationSec > 0 ? opts.durationSec : null

  if (opts?.peaks?.length && duration) {
    const sections = analyzePhraseSections({
      peaks: opts.peaks,
      durationSec: duration,
      bpm: tempo,
      kickOnsetSec: opts.kickOnsetSec,
      snareClapOnsetSec: opts.snareClapOnsetSec,
    })
    return toLegacySegmentRatios(sections)
  }

  if (duration) {
    const dropHint = stats?.dropRatio ?? 0.28
    const introHint = Math.max(0.02, Math.min(0.35, dropHint > 0.05 ? dropHint * 0.85 : 0.1))
    const introEndSec = snapToFileStartPhrase(duration * introHint, tempo, {
      preferEarlier: true,
    })
    const dropStartSec = snapToFileStartPhrase(
      duration * Math.max(introHint, dropHint),
      tempo,
      { preferEarlier: false },
    )
    const outroStartSec = snapToFileStartPhrase(duration * 0.82, tempo, {
      preferEarlier: true,
    })
    const breakStartSec =
      dropHint > 0.2
        ? snapToFileStartPhrase((dropStartSec + outroStartSec) / 2, tempo, {
            preferEarlier: true,
          })
        : null
    const sections: PhraseSectionMap = {
      ...fallbackSections(duration, tempo),
      introEndSec,
      buildStartSec: introEndSec,
      dropStartSec: Math.max(introEndSec, dropStartSec),
      breakStartSec,
      outroStartSec: Math.max(dropStartSec, outroStartSec),
      introEndRatio: round3(introEndSec / duration),
      dropRatio: round3(Math.max(introEndSec, dropStartSec) / duration),
      breakRatio: breakStartSec != null ? round3(breakStartSec / duration) : null,
      outroStartRatio: round3(Math.max(dropStartSec, outroStartSec) / duration),
    }
    return toLegacySegmentRatios(sections)
  }

  // No duration — ratio-only legacy path (still better than fixed outro 0.82 alone).
  const drop = stats?.dropRatio ?? 0.12
  const introEndRatio = Math.max(0.02, Math.min(0.35, drop > 0.05 ? drop * 0.85 : 0.1))
  const outroStartRatio = 0.82
  const mixInBars: SegmentMap['mixInBars'] = tempo >= 140 ? 16 : tempo <= 100 ? 32 : 16
  const mixOutBars: SegmentMap['mixOutBars'] = tempo >= 140 ? 16 : 32
  return {
    introEndRatio: round3(introEndRatio),
    dropRatio: round3(Math.max(introEndRatio, drop)),
    breakRatio: drop > 0.2 ? round3((drop + outroStartRatio) / 2) : null,
    outroStartRatio,
    mixInBars,
    mixOutBars,
  }
}

export function buildFloorHypothesis(input: {
  bpm?: number | null
  drumFamily?: string | null
  energy?: number | null
  dynamics?: WaveformStats['dynamicsLabel'] | null
}): FloorHypothesis {
  const bpm = Number(input.bpm)
  const drums = String(input.drumFamily || '').toLowerCase()
  const energy = Number(input.energy)
  if (!Number.isFinite(bpm)) {
    return { label: 'unknown', confidence: 0.2, reason: 'No measured BPM yet.' }
  }
  if (drums.includes('one-drop') || (bpm >= 70 && bpm <= 95 && input.dynamics === 'intimate')) {
    return {
      label: 'after-hours',
      confidence: 0.72,
      reason: `Measured ${Math.round(bpm)} BPM with spacious/one-drop pocket — cooldown / after-hours floor.`,
    }
  }
  if (bpm >= 118 && bpm <= 132 && (drums.includes('four') || drums.includes('house'))) {
    return {
      label: energy >= 3.5 ? 'peak-warehouse' : 'warm-up',
      confidence: 0.7,
      reason: `House-range ${Math.round(bpm)} BPM four-on-the-floor — ${energy >= 3.5 ? 'peak warehouse' : 'warm-up'} hypothesis.`,
    }
  }
  if (bpm >= 160 && bpm <= 180) {
    return {
      label: 'peak-warehouse',
      confidence: 0.68,
      reason: `Jungle/DnB tempo ${Math.round(bpm)} BPM — peak-energy warehouse hypothesis.`,
    }
  }
  if (drums.includes('sparse') || input.dynamics === 'intimate') {
    return {
      label: 'tool',
      confidence: 0.55,
      reason: 'Sparse / intimate dynamics — likely a tool or transition cut.',
    }
  }
  return {
    label: 'warm-up',
    confidence: 0.45,
    reason: `Default floor read from ${Math.round(bpm)} BPM / ${drums || 'unknown drums'}.`,
  }
}

export function estimateVocalPresence(measured: {
  unpitched?: boolean
  instruments?: Array<{ id?: string; role?: string; confidence?: number }>
} | null): number {
  if (!measured) return 0
  if (measured.unpitched) return 0.05
  const vocals = (measured.instruments || []).filter((i) =>
    /vocal|voice|speech|topline/i.test(`${i.id || ''} ${i.role || ''}`),
  )
  if (!vocals.length) return 0.15
  return Math.min(
    1,
    vocals.reduce((s, i) => s + (Number(i.confidence) || 0.5), 0) / Math.max(1, vocals.length),
  )
}

export function buildCreativeInsights(input: {
  measured?: {
    bpm?: number | null
    drumFamily?: string | null
    unpitched?: boolean
    instruments?: Array<{ id?: string; role?: string; confidence?: number }>
    kickOnsetSec?: number[]
    snareClapOnsetSec?: number[]
  } | null
  waveformStats?: WaveformStats | null
  energy?: number | null
  pocket?: PocketFingerprint | null
  durationSec?: number | null
  peaks?: Array<number | { positive?: number; negative?: number; rms?: number }> | null
}): CreativeInsights {
  const segments = buildSegmentMap(input.waveformStats, input.measured?.bpm, {
    durationSec: input.durationSec,
    peaks: input.peaks,
    kickOnsetSec: input.measured?.kickOnsetSec,
    snareClapOnsetSec: input.measured?.snareClapOnsetSec,
  })
  const floor = buildFloorHypothesis({
    bpm: input.measured?.bpm,
    drumFamily: input.measured?.drumFamily,
    energy: input.energy,
    dynamics: input.waveformStats?.dynamicsLabel,
  })
  const vocalPresence = estimateVocalPresence(input.measured || null)
  const silenceRatio = input.waveformStats
    ? round3(Math.max(0, 1 - input.waveformStats.mean * 2.2))
    : 0
  const mixNotes = `Mix-in ~${segments.mixInBars} bars · mix-out ~${segments.mixOutBars} bars · drop ~${Math.round(segments.dropRatio * 100)}%${
    input.pocket ? ` · pocket ${input.pocket.drumFamily}@${input.pocket.bpmBucket}` : ''
  }`

  return {
    segments,
    tensionPeakRatio: round3(Math.min(0.95, segments.dropRatio + 0.12)),
    floor,
    vocalPresence: round3(vocalPresence),
    silenceRatio,
    mixNotes,
  }
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}
