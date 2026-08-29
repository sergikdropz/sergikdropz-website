import { describe, expect, it } from 'vitest'
import {
  phraseBoundarySec,
  phraseIndexAt,
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
})
