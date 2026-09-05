import { describe, expect, it } from 'vitest'
import {
  deriveMixingRecommendations,
  ensurePhraseSteps,
  expandBarStepsToPhrase,
  quantizeToDnaGrid,
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

  it('prefers confident DNA BPM near UI tempo', () => {
    expect(
      resolvePlaybackBpm(
        {
          bpm: 120,
          sonic_dna: { measured: { bpm: 124, bpmConfidence: 0.85 } },
        },
        120
      )
    ).toBe(124)
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
