import { describe, expect, it } from 'vitest'
import {
  MAJOR_PROFILE,
  NOTE_NAMES,
  keyLockFromPearson,
  pickBestKeyFromSources,
  pickRootKey,
  pickToplineKey,
  rankKeysFromChroma,
} from './root-key'

describe('keyLockFromPearson', () => {
  it('lifts a typical 0.69 Pearson fit into the 80% lock range', () => {
    expect(keyLockFromPearson(0.69, 0.58)).toBeGreaterThanOrEqual(0.8)
    expect(keyLockFromPearson(0.69, 0.58)).toBeLessThanOrEqual(0.95)
  })

  it('stays modest when the runner-up is almost tied', () => {
    expect(keyLockFromPearson(0.42, 0.41)).toBeLessThan(0.7)
  })
})

describe('pickRootKey', () => {
  it('reads A as the bass root and prefers A minor when the minor profile fits', () => {
    const chroma = NOTE_NAMES.map(() => 0.05)
    chroma[9] = 1
    chroma[0] = 0.55
    chroma[4] = 0.4
    chroma[7] = 0.35
    const result = pickRootKey(chroma, chroma)
    expect(result.root).toBe('A')
    expect(result.key).toMatch(/^A /)
    expect(result.candidates[0].root).toBeTruthy()
  })

  it('ranks C major highest for a major-profile chroma centered on C', () => {
    const ranked = rankKeysFromChroma(MAJOR_PROFILE, MAJOR_PROFILE)
    expect(ranked[0].key).toBe('C major')
    expect(ranked[0].camelot).toBe('8B')
  })

  it('does not force a loud A# bass note over a clear C major mix', () => {
    const bass = NOTE_NAMES.map(() => 0.04)
    bass[10] = 1
    const result = pickRootKey(bass, MAJOR_PROFILE)
    expect(result.key).toBe('C major')
    expect(result.root).toBe('C')
  })
})

describe('pickToplineKey', () => {
  it('reads the lead-band profile independently of a different bass root', () => {
    const bass = NOTE_NAMES.map(() => 0.04)
    bass[9] = 1
    const lead = [...MAJOR_PROFILE]
    const topline = pickToplineKey(lead)
    expect(topline.key).toBe('C major')
    expect(topline.camelot).toBe('8B')
    const root = pickRootKey(bass, bass)
    expect(root.root).toBe('A')
    expect(topline.key).not.toBe(root.key)
  })
})

describe('pickBestKeyFromSources', () => {
  it('keeps a measured Sonic DNA key even when chroma lock is higher', () => {
    const best = pickBestKeyFromSources({
      dna: {
        candidate: { key: 'B minor', root: 'B', scale: 'minor', score: 0.55, camelot: '10A' },
        lock: 0.64,
        unpitched: false,
      },
      root: {
        key: 'A# minor',
        root: 'A#',
        scale: 'minor',
        confidence: 0.8,
        camelot: '3A',
        unpitched: false,
        candidates: [
          { key: 'A# minor', root: 'A#', scale: 'minor', score: 0.4, camelot: '3A' },
          { key: 'C# minor', root: 'C#', scale: 'minor', score: 0.32, camelot: '12A' },
        ],
      },
      topline: {
        key: 'G major',
        root: 'G',
        scale: 'major',
        confidence: 0.52,
        camelot: '9B',
        unpitched: false,
        candidates: [{ key: 'G major', root: 'G', scale: 'major', score: 0.35, camelot: '9B' }],
      },
    })
    expect(best.chosen?.key).toBe('B minor')
    expect(best.chosen?.source).toBe('dna')
  })

  it('falls back to the highest chroma lock when Sonic DNA has no key', () => {
    const best = pickBestKeyFromSources({
      dna: null,
      root: {
        key: 'A# minor',
        root: 'A#',
        scale: 'minor',
        confidence: 0.64,
        camelot: '3A',
        unpitched: false,
        candidates: [{ key: 'A# minor', root: 'A#', scale: 'minor', score: 0.4, camelot: '3A' }],
      },
      topline: {
        key: 'B minor',
        root: 'B',
        scale: 'minor',
        confidence: 0.87,
        camelot: '10A',
        unpitched: false,
        candidates: [{ key: 'B minor', root: 'B', scale: 'minor', score: 0.72, camelot: '10A' }],
      },
    })
    expect(best.chosen?.key).toBe('B minor')
    expect(best.chosen?.source).toBe('topline')
  })

  it('prefers Sonic DNA when locks are tied', () => {
    const best = pickBestKeyFromSources({
      dna: {
        candidate: { key: 'A minor', root: 'A', scale: 'minor', score: 0.6, camelot: '8A' },
        lock: 0.8,
      },
      root: {
        key: 'C major',
        root: 'C',
        scale: 'major',
        confidence: 0.8,
        camelot: '8B',
        unpitched: false,
        candidates: [{ key: 'C major', root: 'C', scale: 'major', score: 0.69, camelot: '8B' }],
      },
    })
    expect(best.chosen?.key).toBe('A minor')
    expect(best.chosen?.source).toBe('dna')
  })
})
