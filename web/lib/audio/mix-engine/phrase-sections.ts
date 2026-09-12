/**
 * Phrase-binned structure map: intro → build → drop → breakdown → outro.
 * All boundaries snap to the file-start 8-bar lattice (not first-kick origin).
 */

import { BARS_PER_PHRASE } from '@/lib/audio/beat-grid'
import {
  phraseBoundarySec,
  phraseIndexAt,
  phrasePeriodSec,
  snapToFileStartPhrase,
} from './phrase-lattice'

export type PhraseSectionMap = {
  introEndSec: number
  buildStartSec: number
  dropStartSec: number
  breakStartSec: number | null
  outroStartSec: number
  introEndPhrase: number
  dropPhrase: number
  breakPhrase: number | null
  outroPhrase: number
  /** Backward-compatible ratios (0–1 of duration). */
  introEndRatio: number
  dropRatio: number
  breakRatio: number | null
  outroStartRatio: number
  mixInBars: 8 | 16 | 32
  mixOutBars: 8 | 16 | 32
}

export type PhraseSectionInput = {
  peaks: Array<number | { positive?: number; negative?: number; rms?: number }>
  durationSec: number
  bpm: number
  kickOnsetSec?: number[]
  snareClapOnsetSec?: number[]
  phraseBars?: number
}

function peakAmp(p: number | { positive?: number; negative?: number; rms?: number }): number {
  if (typeof p === 'number') return Math.abs(p)
  const pos = Math.abs(Number(p.positive) || 0)
  const neg = Math.abs(Number(p.negative) || 0)
  const rms = Math.abs(Number(p.rms) || 0)
  return Math.max(pos, neg, rms)
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

function mixBarsForTempo(bpm: number): { mixInBars: 8 | 16 | 32; mixOutBars: 8 | 16 | 32 } {
  const tempo = Number(bpm) || 120
  return {
    mixInBars: tempo >= 140 ? 16 : tempo <= 100 ? 32 : 16,
    mixOutBars: tempo >= 140 ? 16 : 32,
  }
}

function countOnsetsInRange(onsets: number[], start: number, end: number): number {
  let n = 0
  for (const t of onsets) {
    if (t >= start && t < end) n++
  }
  return n
}

/**
 * Analyze intro / build / drop / breakdown / outro on the file-start phrase lattice.
 */
export function analyzePhraseSections(input: PhraseSectionInput): PhraseSectionMap {
  const bpm = input.bpm > 0 ? input.bpm : 120
  const phraseBars = input.phraseBars && input.phraseBars > 0 ? input.phraseBars : BARS_PER_PHRASE
  const duration = Math.max(0, input.durationSec)
  const phraseSec = phrasePeriodSec(bpm, phraseBars) || 16
  const bars = mixBarsForTempo(bpm)
  const nPeaks = input.peaks?.length ?? 0

  if (!(duration > 0) || nPeaks < 8) {
    return fallbackSections(duration, bpm, bars)
  }

  const phraseCount = Math.max(1, Math.ceil(duration / phraseSec))
  const energy: number[] = new Array(phraseCount).fill(0)
  const kickDensity: number[] = new Array(phraseCount).fill(0)
  const snareDensity: number[] = new Array(phraseCount).fill(0)

  const kicks = (input.kickOnsetSec || []).filter((t) => Number.isFinite(t) && t >= 0)
  const snares = (input.snareClapOnsetSec || []).filter((t) => Number.isFinite(t) && t >= 0)

  for (let i = 0; i < phraseCount; i++) {
    const start = i * phraseSec
    const end = Math.min(duration, (i + 1) * phraseSec)
    const i0 = Math.max(0, Math.floor((start / duration) * nPeaks))
    const i1 = Math.min(nPeaks, Math.ceil((end / duration) * nPeaks))
    let sum = 0
    let count = 0
    for (let p = i0; p < i1; p++) {
      sum += peakAmp(input.peaks[p]!)
      count++
    }
    energy[i] = count > 0 ? sum / count : 0
    const span = Math.max(1e-6, end - start)
    kickDensity[i] = countOnsetsInRange(kicks, start, end) / (span / phraseSec)
    snareDensity[i] = countOnsetsInRange(snares, start, end) / (span / phraseSec)
  }

  const sortedE = [...energy].sort((a, b) => a - b)
  const medianE = sortedE[Math.floor(sortedE.length / 2)] || 0
  const p90E = sortedE[Math.floor(sortedE.length * 0.9)] || medianE
  const silenceFloor = Math.max(0.04, medianE * 0.35)
  const kickMin = kicks.length >= 4 ? 1.5 : 0.5

  // Intro end: first phrase with sustained groove (energy + kicks when available).
  let introPhrase = 0
  for (let i = 0; i < phraseCount; i++) {
    const hasGroove =
      energy[i]! >= Math.max(silenceFloor, medianE * 0.55) &&
      (kicks.length < 4 || kickDensity[i]! >= kickMin)
    if (hasGroove) {
      introPhrase = i
      break
    }
    introPhrase = i
  }
  // If groove is immediately present, intro is still at least empty — keep phrase 0 as intro end = 0 or first phrase.
  if (introPhrase === 0 && energy[0]! >= medianE * 0.7) {
    introPhrase = 0
  }

  // Drop: strongest post-intro energy jump / high kick pocket.
  let dropPhrase = Math.min(phraseCount - 1, Math.max(introPhrase, 1))
  let bestDropScore = -1
  const searchFrom = Math.max(0, introPhrase)
  const searchTo = Math.max(searchFrom + 1, Math.floor(phraseCount * 0.72))
  for (let i = searchFrom; i < searchTo; i++) {
    const prev = i > 0 ? energy[i - 1]! : energy[i]! * 0.5
    const delta = energy[i]! - prev
    const score =
      energy[i]! * 1.2 +
      Math.max(0, delta) * 2.5 +
      kickDensity[i]! * 0.15 +
      snareDensity[i]! * 0.08
    const highEnough = energy[i]! >= Math.max(p90E * 0.72, medianE * 1.05)
    if (highEnough && score > bestDropScore) {
      bestDropScore = score
      dropPhrase = i
    }
  }
  if (bestDropScore < 0) {
    // Fallback: first phrase after intro with energy lift.
    for (let i = searchFrom; i < searchTo; i++) {
      if (energy[i]! >= medianE * 1.15) {
        dropPhrase = i
        break
      }
    }
  }

  // Build = region between intro end and drop (at least empty if drop is next).
  if (dropPhrase <= introPhrase) {
    dropPhrase = Math.min(phraseCount - 1, introPhrase + 1)
  }

  // Breakdown: multi-phrase dip after drop.
  let breakPhrase: number | null = null
  const dropMean = energy[dropPhrase] || medianE
  const afterDrop = dropPhrase + 1
  const breakSearchEnd = Math.min(phraseCount - 1, Math.floor(phraseCount * 0.88))
  for (let i = afterDrop; i < breakSearchEnd; i++) {
    const thin =
      energy[i]! < dropMean * 0.55 &&
      (kicks.length < 4 || kickDensity[i]! < kickDensity[dropPhrase]! * 0.55)
    const nextThin =
      i + 1 < phraseCount &&
      energy[i + 1]! < dropMean * 0.62
    if (thin && (nextThin || energy[i]! < dropMean * 0.4)) {
      breakPhrase = i
      break
    }
  }

  // Outro: last ~18% or last thinning phrases, snapped.
  let outroPhrase = Math.max(
    (breakPhrase ?? dropPhrase) + 1,
    Math.floor(phraseCount * 0.82),
  )
  for (let i = phraseCount - 1; i > (breakPhrase ?? dropPhrase); i--) {
    if (energy[i]! < medianE * 0.7 || kickDensity[i]! < kickMin * 0.5) {
      outroPhrase = i
    } else {
      break
    }
  }
  outroPhrase = Math.min(phraseCount - 1, Math.max(outroPhrase, (breakPhrase ?? dropPhrase) + 1))

  const introEndSec = phraseBoundarySec(introPhrase, bpm, phraseBars)
  const dropStartSec = phraseBoundarySec(dropPhrase, bpm, phraseBars)
  const breakStartSec =
    breakPhrase != null ? phraseBoundarySec(breakPhrase, bpm, phraseBars) : null
  const outroStartSec = phraseBoundarySec(outroPhrase, bpm, phraseBars)
  const buildStartSec = introEndSec

  return {
    introEndSec,
    buildStartSec,
    dropStartSec,
    breakStartSec,
    outroStartSec,
    introEndPhrase: introPhrase,
    dropPhrase,
    breakPhrase,
    outroPhrase,
    introEndRatio: duration > 0 ? round3(introEndSec / duration) : 0,
    dropRatio: duration > 0 ? round3(dropStartSec / duration) : 0,
    breakRatio: breakStartSec != null && duration > 0 ? round3(breakStartSec / duration) : null,
    outroStartRatio: duration > 0 ? round3(outroStartSec / duration) : 0.82,
    ...bars,
  }
}

/** Ratio-only fallback when peaks are missing (still phrase-snapped when duration+bpm known). */
export function fallbackSections(
  durationSec: number,
  bpm: number,
  bars?: { mixInBars: 8 | 16 | 32; mixOutBars: 8 | 16 | 32 },
): PhraseSectionMap {
  const mix = bars ?? mixBarsForTempo(bpm)
  const duration = Math.max(0, durationSec)
  const introEndSec =
    duration > 0
      ? snapToFileStartPhrase(duration * 0.1, bpm, { preferEarlier: true })
      : 0
  const dropStartSec =
    duration > 0
      ? snapToFileStartPhrase(duration * 0.28, bpm, { preferEarlier: false })
      : 0
  const outroStartSec =
    duration > 0
      ? snapToFileStartPhrase(duration * 0.82, bpm, { preferEarlier: true })
      : 0
  const breakStartSec =
    duration > 0
      ? snapToFileStartPhrase((dropStartSec + outroStartSec) / 2, bpm, { preferEarlier: true })
      : null

  return {
    introEndSec,
    buildStartSec: introEndSec,
    dropStartSec: Math.max(introEndSec, dropStartSec),
    breakStartSec,
    outroStartSec: Math.max(dropStartSec, outroStartSec),
    introEndPhrase: phraseIndexAt(introEndSec, bpm),
    dropPhrase: phraseIndexAt(Math.max(introEndSec, dropStartSec), bpm),
    breakPhrase: breakStartSec != null ? phraseIndexAt(breakStartSec, bpm) : null,
    outroPhrase: phraseIndexAt(Math.max(dropStartSec, outroStartSec), bpm),
    introEndRatio: duration > 0 ? round3(introEndSec / duration) : 0.1,
    dropRatio: duration > 0 ? round3(Math.max(introEndSec, dropStartSec) / duration) : 0.28,
    breakRatio:
      breakStartSec != null && duration > 0 ? round3(breakStartSec / duration) : null,
    outroStartRatio: duration > 0 ? round3(Math.max(dropStartSec, outroStartSec) / duration) : 0.82,
    ...mix,
  }
}

export type PhraseSectionId = 'intro' | 'build' | 'drop' | 'break' | 'outro'

/** Which arrangement section contains `timeSec`. */
export function sectionAtSec(map: PhraseSectionMap, timeSec: number): PhraseSectionId {
  const t = Number.isFinite(timeSec) ? timeSec : 0
  if (t >= map.outroStartSec) return 'outro'
  if (map.breakStartSec != null && t >= map.breakStartSec) return 'break'
  if (t >= map.dropStartSec) return 'drop'
  if (t >= map.buildStartSec) return 'build'
  return 'intro'
}

/** Map PhraseSectionMap → legacy SegmentMap shape used by creative insights. */
export function toLegacySegmentRatios(sections: PhraseSectionMap): {
  introEndRatio: number
  dropRatio: number
  breakRatio: number | null
  outroStartRatio: number
  mixInBars: 8 | 16 | 32
  mixOutBars: 8 | 16 | 32
  introEndSec: number
  dropStartSec: number
  breakStartSec: number | null
  outroStartSec: number
  introEndPhrase: number
  dropPhrase: number
  breakPhrase: number | null
  outroPhrase: number
} {
  return {
    introEndRatio: sections.introEndRatio,
    dropRatio: sections.dropRatio,
    breakRatio: sections.breakRatio,
    outroStartRatio: sections.outroStartRatio,
    mixInBars: sections.mixInBars,
    mixOutBars: sections.mixOutBars,
    introEndSec: sections.introEndSec,
    dropStartSec: sections.dropStartSec,
    breakStartSec: sections.breakStartSec,
    outroStartSec: sections.outroStartSec,
    introEndPhrase: sections.introEndPhrase,
    dropPhrase: sections.dropPhrase,
    breakPhrase: sections.breakPhrase,
    outroPhrase: sections.outroPhrase,
  }
}
