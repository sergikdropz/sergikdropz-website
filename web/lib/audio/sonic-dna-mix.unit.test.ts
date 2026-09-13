import { describe, expect, it } from 'vitest'
import {
  deriveMixingRecommendations,
  ensurePhraseSteps,
  expandBarStepsToPhrase,
  quantizeToDnaGrid,
  quantizeModeForVisibleBars,
  quantizePointerToVisibleGrid,
  rankDnaTracks,
  resolvePlaybackBpm,
  scoreDnaCompatibility,
  secondsToNextPhraseBoundary,
} from './sonic-dna-mix'

describe('expandBarStepsToPhrase / ensurePhraseSteps', () => {
  it('tiles 16-step kicks across 8 bars', () => {
    expect(expandBarStepsToPhrase([0, 4])).toEqual([
      0, 4, 16, 20, 32, 36, 48, 52, 64, 68, 80, 84, 96, 100, 112, 116,
    ])
  })

  it('fills missing phrase steps from bar pocket', () => {
    const ensured = ensurePhraseSteps({
      kickSteps: [0, 8],
      snareSteps: [4],
    })
    expect(ensured.phraseBars).toBe(8)
    expect(ensured.kickPhraseSteps?.[0]).toBe(0)
    expect(ensured.kickPhraseSteps).toContain(64)
    expect(ensured.snarePhraseSteps).toContain(4)
  })

  it('backfills kickOnsetSec from kick steps when missing', () => {
    const ensured = ensurePhraseSteps({
      bpm: 120,
      kickSteps: [0, 4, 8, 12],
      window: { startSec: 0, endSec: 8 },
      gridOffsetSec: 0,
    })
    expect(ensured.kickOnsetSec?.length).toBeGreaterThanOrEqual(4)
    expect(ensured.kickOnsetSec?.[0]).toBeCloseTo(0, 5)
  })

  it('merges clap steps into snare pocket for alignment', () => {
    const ensured = ensurePhraseSteps({
      kickSteps: [0, 4, 8, 12],
      snareSteps: [4],
      clapSteps: [12],
      clapPhraseSteps: [12, 76],
    })
    expect(ensured.snareSteps).toEqual(expect.arrayContaining([4, 12]))
    expect(ensured.snarePhraseSteps).toEqual(expect.arrayContaining([4, 12, 76]))
  })
})

describe('resolvePlaybackBpm', () => {
  it('honors half-time effective pulse', () => {
    const bpm = resolvePlaybackBpm({
      bpm: 140,
      sonic_dna: {
        measured: {
          bpm: 140,
          bpmConfidence: 0.9,
          effectiveBpm: 70,
          timingFeel: 'half-time',
        },
      },
    })
    expect(bpm).toBe(70)
  })

  it('prefers admin catalog override over nearby DNA so decks stay aligned', () => {
    expect(
      resolvePlaybackBpm(
        {
          bpm: 125,
          metadata: { catalog_overrides: { bpm: 125 } },
          sonic_dna: { measured: { bpm: 124, bpmConfidence: 0.85 } },
        },
        124
      )
    ).toBe(125)
  })

  it('uses measured BPM when catalog is stale (Para Papa 125 vs 123.05)', () => {
    expect(
      resolvePlaybackBpm({
        bpm: 125,
        sonic_dna: { measured: { bpm: 123.05, bpmConfidence: 0.66 } },
      }),
    ).toBeCloseTo(123.05, 5)
  })
})

describe('scoreDnaCompatibility', () => {
  it('scores matching pocket + camelot higher than random', () => {
    const current = {
      id: 'a',
      bpm: 124,
      sonic_dna: {
        measured: {
          bpm: 124,
          bpmConfidence: 0.9,
          camelot: '6A',
          drumFamily: 'four-on-the-floor',
          kickSteps: [0, 4, 8, 12],
          snareSteps: [4, 12],
          fourRatio: 0.5,
        },
      },
    }
    const good = {
      id: 'b',
      bpm: 125,
      sonic_dna: {
        measured: {
          bpm: 125,
          bpmConfidence: 0.9,
          camelot: '6A',
          drumFamily: 'four-on-the-floor',
          kickSteps: [0, 4, 8, 12],
          snareSteps: [4, 12],
          fourRatio: 0.48,
        },
      },
    }
    const bad = {
      id: 'c',
      bpm: 90,
      sonic_dna: {
        measured: {
          bpm: 90,
          bpmConfidence: 0.9,
          camelot: '1B',
          drumFamily: 'boom-bap',
          kickSteps: [0],
          snareSteps: [8],
          fourRatio: 0.1,
        },
      },
    }
    expect(scoreDnaCompatibility(current, good).total).toBeGreaterThan(
      scoreDnaCompatibility(current, bad).total
    )
  })
})

describe('rankDnaTracks', () => {
  it('orders compatible DNA tracks before incompatible ones', () => {
    const current = {
      id: 'a',
      bpm: 124,
      sonic_dna: {
        measured: {
          bpm: 124,
          bpmConfidence: 0.9,
          camelot: '6A',
          drumFamily: 'four-on-the-floor',
          kickSteps: [0, 4, 8, 12],
          snareSteps: [4, 12],
          fourRatio: 0.5,
        },
      },
    }
    const good = {
      id: 'b',
      bpm: 125,
      sonic_dna: {
        measured: {
          bpm: 125,
          camelot: '6A',
          drumFamily: 'four-on-the-floor',
          kickSteps: [0, 4, 8, 12],
          snareSteps: [4, 12],
          fourRatio: 0.48,
        },
      },
    }
    const bad = {
      id: 'c',
      bpm: 90,
      sonic_dna: {
        measured: {
          bpm: 90,
          camelot: '1A',
          drumFamily: 'boom-bap',
          kickSteps: [0],
          snareSteps: [8],
          fourRatio: 0.1,
        },
      },
    }
    const ranked = rankDnaTracks(current, [bad, good], { limit: 2 })
    expect(ranked[0]?.track.id).toBe('b')
    expect(ranked[0]!.score.total).toBeGreaterThan(ranked[1]!.score.total)
  })
})

describe('deriveMixingRecommendations', () => {
  it('derives keys from measured camelot when mixing block missing', () => {
    const rec = deriveMixingRecommendations({
      bpm: 122,
      sonic_dna: {
        measured: {
          bpm: 122,
          camelot: '8A',
          drumFamily: 'four-on-the-floor',
        },
      },
    })
    expect(rec?.source).toBe('derived')
    expect(rec?.compatibleKeys).toContain('8A')
    expect(rec?.bpmRange?.min).toBeLessThan(122)
  })
})

describe('quantize / phrase boundary', () => {
  it('snaps to nearest kick on DNA phrase grid', () => {
    const t = quantizeToDnaGrid({
      timeSec: 0.2,
      bpm: 120,
      offsetSec: 0,
      mode: 'kick',
      sonicDna: {
        measured: {
          bpm: 120,
          kickSteps: [0, 4, 8, 12],
          kickPhraseSteps: [0, 4, 8, 12],
          stepsPerBar: 16,
          phraseBars: 8,
        },
      },
    })
    expect(t).toBeCloseTo(0, 2)
  })

  it('snaps to 16-bar section lines', () => {
    // 120 BPM → bar 2s, section 32s
    expect(quantizeToDnaGrid({ timeSec: 10, bpm: 120, offsetSec: 0, mode: 'section' })).toBeCloseTo(0, 5)
    expect(quantizeToDnaGrid({ timeSec: 20, bpm: 120, offsetSec: 0, mode: 'section' })).toBeCloseTo(32, 5)
  })

  it('picks coarser snap modes as the tape zooms out', () => {
    expect(quantizeModeForVisibleBars(1)).toBe('none')
    expect(quantizeModeForVisibleBars(4)).toBe('sixteenth')
    expect(quantizeModeForVisibleBars(8)).toBe('sixteenth')
    expect(quantizeModeForVisibleBars(16)).toBe('half-beat')
    expect(quantizeModeForVisibleBars(32)).toBe('half-beat')
    expect(quantizeModeForVisibleBars(48)).toBe('bar')
    expect(quantizeModeForVisibleBars(96)).toBe('phrase')
    expect(quantizeModeForVisibleBars(0)).toBe('section')
  })

  it('snaps pointer to the nearest visible grid line at each zoom', () => {
    const free = quantizePointerToVisibleGrid({
      timeSec: 0.083,
      bpm: 120,
      offsetSec: 0,
      visibleBars: 1,
    })
    expect(free).toBeCloseTo(0.083, 5)

    const sixteenth = quantizePointerToVisibleGrid({
      timeSec: 0.08,
      bpm: 120,
      offsetSec: 0,
      visibleBars: 4,
    })
    // 120 BPM → beat 0.5s → 16th = 0.125s
    expect(sixteenth).toBeCloseTo(0.125, 5)

    const half = quantizePointerToVisibleGrid({
      timeSec: 0.2,
      bpm: 120,
      offsetSec: 0,
      visibleBars: 16,
    })
    expect(half).toBeCloseTo(0.25, 5)

    const bar = quantizePointerToVisibleGrid({
      timeSec: 1.1,
      bpm: 120,
      offsetSec: 0,
      visibleBars: 48,
    })
    expect(bar).toBeCloseTo(2, 5)

    const phrase = quantizePointerToVisibleGrid({
      timeSec: 10,
      bpm: 120,
      offsetSec: 0,
      visibleBars: 96,
    })
    expect(phrase).toBeCloseTo(16, 5)

    const overview = quantizePointerToVisibleGrid({
      timeSec: 10,
      bpm: 120,
      offsetSec: 0,
      visibleBars: 0,
    })
    expect(overview).toBeCloseTo(16, 5)
  })

  it('computes time to next phrase boundary from offset', () => {
    // 120 BPM → beat 0.5, bar 2, phrase 16s
    const rem = secondsToNextPhraseBoundary({
      timeSec: 4,
      bpm: 120,
      offsetSec: 0,
      phraseBars: 8,
      beatsPerBar: 4,
    })
    expect(rem).toBeCloseTo(12, 5)
  })
})
