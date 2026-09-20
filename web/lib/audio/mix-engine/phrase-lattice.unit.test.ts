import { describe, expect, it } from 'vitest'
import {
  phraseBoundarySec,
  phraseIndexAt,
  phrasePhaseErrorSec,
  fusePhraseBeatError,
  incomingCueAtOutgoingPhrase,
  incomingTimeAfterPhraseSeek,
  snapToFileStartPhrase,
  toPhaseOnlyOffsetSec,
} from './phrase-lattice'
import { analyzePhraseSections } from './phrase-sections'

describe('phrase-lattice', () => {
  it('counts phrases from file start', () => {
    const bpm = 120
    // 8 bars × 4 beats × 0.5s = 16s per phrase
    expect(phraseBoundarySec(0, bpm)).toBe(0)
    expect(phraseBoundarySec(1, bpm)).toBeCloseTo(16, 5)
    expect(phraseIndexAt(0, bpm)).toBe(0)
    expect(phraseIndexAt(15.9, bpm)).toBe(0)
    expect(phraseIndexAt(16, bpm)).toBe(1)
  })

  it('snaps to file-start lattice ignoring large absolute offsets', () => {
    const bpm = 120
    expect(snapToFileStartPhrase(3.2, bpm, { preferEarlier: true })).toBe(0)
    expect(snapToFileStartPhrase(18, bpm)).toBeCloseTo(16, 5)
  })

  it('matches incoming phrase-1 bar to outgoing phrase phase', () => {
    const bpm = 120
    // 8 bars = 16s. Outgoing 4s into its cell → incoming at 4s of phrase 1.
    expect(
      incomingCueAtOutgoingPhrase({
        outgoingTimeSec: 64 + 4,
        outgoingBpm: bpm,
        incomingBpm: bpm,
      }),
    ).toBeCloseTo(4, 5)
    expect(
      incomingCueAtOutgoingPhrase({
        outgoingTimeSec: 64,
        outgoingBpm: bpm,
        incomingBpm: bpm,
      }),
    ).toBeCloseTo(0, 5)
    const err = phrasePhaseErrorSec({
      outgoingTimeSec: 68,
      outgoingBpm: bpm,
      incomingTimeSec: 4,
      incomingBpm: bpm,
    })
    expect(Math.abs(err)).toBeLessThan(0.01)
    const slipped = phrasePhaseErrorSec({
      outgoingTimeSec: 68,
      outgoingBpm: bpm,
      incomingTimeSec: 0.1,
      incomingBpm: bpm,
    })
    expect(slipped).toBeCloseTo(-3.9, 1)
    expect(
      incomingTimeAfterPhraseSeek({
        incomingTimeSec: 0.1,
        incomingBpm: bpm,
        outgoingBpm: bpm,
        phraseErrMasterSec: slipped,
      }),
    ).toBeCloseTo(4, 1)
  })

  it('phase fold never exceeds one beat', () => {
    expect(toPhaseOnlyOffsetSec(48.25, 0.5)).toBeLessThan(0.5)
  })
})

describe('analyzePhraseSections', () => {
  it('keeps intro before drop on a sparse-then-dense track', () => {
    const bpm = 120
    const durationSec = 96 // 6 phrases @ 16s
    const n = 2400
    const peaks = Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * durationSec
      // Quiet intro ~0–16s, build 16–32, drop 32+
      if (t < 16) return 0.05
      if (t < 32) return 0.25
      return 0.85
    })
    const kicks: number[] = []
    for (let t = 32; t < durationSec; t += 0.5) kicks.push(t)

    const sections = analyzePhraseSections({
      peaks,
      durationSec,
      bpm,
      kickOnsetSec: kicks,
    })

    expect(sections.introEndSec).toBeLessThanOrEqual(sections.dropStartSec)
    expect(sections.dropStartSec).toBeGreaterThanOrEqual(16)
    expect(sections.introEndPhrase).toBeLessThanOrEqual(sections.dropPhrase)
    // Phrase lattice from 0
    expect(sections.dropStartSec % 16).toBeCloseTo(0, 5)
  })

  it('fuses large phrase error with beat pocket for chase', () => {
    const beat = 0.5
    // On-phrase → beat wins
    expect(
      fusePhraseBeatError({ beatPhaseSec: 0.02, phrasePhaseSec: 0.04, beatSec: beat }),
    ).toBeCloseTo(0.02, 5)
    // Off-phrase cell → blend toward phrase
    const fused = fusePhraseBeatError({
      beatPhaseSec: 0.01,
      phrasePhaseSec: 0.8,
      beatSec: beat,
    })
    expect(Math.abs(fused)).toBeGreaterThan(0.2)
    expect(Math.abs(fused)).toBeLessThanOrEqual(beat * 1.5)
  })
})
