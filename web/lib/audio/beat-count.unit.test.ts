import { describe, expect, it } from 'vitest'
import {
  bpmAgreement,
  bpmOctaveOptions,
  buildFullTrackSegments,
  consolidateSegmentBpmVotes,
  countBeatHits,
  detectFirstDropSec,
  formatBpmAccuracyNote,
  formatClock,
  pickBpmByBeatCount,
  formatTapTempoButtonLabel,
  recordTapTempo,
  scoreBpmSuggestionAccuracy,
  tapTempoDelta,
  TAP_TEMPO_SECTION_BEATS,
} from './beat-count'

describe('bpmOctaveOptions', () => {
  it('includes half and double in dance range', () => {
    expect(bpmOctaveOptions(103)).toEqual([52, 103, 206])
  })
})

describe('countBeatHits', () => {
  it('counts onsets that land on the beat grid', () => {
    const period = 60 / 120
    const onsets = Array.from({ length: 8 }, (_, i) => i * period)
    const { hits, expected } = countBeatHits(onsets, 120, 0, 7 * period, 0)
    expect(expected).toBe(8)
    expect(hits).toBe(8)
  })
})

describe('pickBpmByBeatCount', () => {
  it('prefers the octave with more grid hits', () => {
    const period = 60 / 103
    const onsets = Array.from({ length: 20 }, (_, i) => i * period)
    const ranked = pickBpmByBeatCount(onsets, [103], 0, 19 * period)
    expect(ranked[0].bpm).toBe(103)
    expect(ranked[0].hits).toBeGreaterThan(ranked.find((c) => c.bpm === 52)?.hits || 0)
  })
})

describe('recordTapTempo', () => {
  it('needs enough stable taps before producing BPM', () => {
    expect(recordTapTempo([], 1000).bpm).toBeNull()
    expect(recordTapTempo([1000], 1500).bpm).toBeNull()
  })

  it('updates BPM on every tap inside a 16-beat section', () => {
    const period = 500 // 120 BPM
    let state = recordTapTempo([], 0)
    for (let i = 1; i < 8; i++) {
      state = recordTapTempo(state.taps, i * period, state)
      expect(state.sectionBeat).toBe(i + 1)
      if (i >= 2) expect(state.bpm).toBe(120)
    }
  })

  it('locks a section at 16 beats and starts the next', () => {
    const period = 500
    let state = recordTapTempo([], 0)
    for (let i = 1; i < TAP_TEMPO_SECTION_BEATS; i++) {
      state = recordTapTempo(state.taps, i * period, state)
    }
    expect(state.sectionsCompleted).toBe(1)
    expect(state.sectionBpms).toEqual([120])
    expect(state.sectionBeat).toBe(1)
    expect(state.averageBpm).toBe(120)
  })

  it('rejects outlier intervals so a missed tap does not wreck the estimate', () => {
    // 128 BPM ≈ 468.75 ms
    const period = 60000 / 128
    const taps = [0, period, period * 2, period * 2 + period * 2.4, period * 4, period * 5, period * 6, period * 7]
    let state = recordTapTempo([], taps[0])
    for (let i = 1; i < taps.length; i++) {
      state = recordTapTempo(state.taps, taps[i], state)
    }
    expect(state.bpm).not.toBeNull()
    expect(Math.abs((state.bpm as number) - 128)).toBeLessThan(1.5)
  })
})

describe('formatTapTempoButtonLabel', () => {
  it('shows progress until a 16-beat section locks', () => {
    expect(formatTapTempoButtonLabel({ taps: [], bpm: null })).toBe('Tap')
    expect(formatTapTempoButtonLabel({ taps: [1], bpm: null })).toBe('Again')
    expect(formatTapTempoButtonLabel({ taps: [1, 2, 3], bpm: 120 })).toBe('3/16')
  })

  it('shows the locked BPM after a completed section', () => {
    expect(
      formatTapTempoButtonLabel({ taps: [1], bpm: 124.2, sectionsCompleted: 1 }),
    ).toBe('124.2')
  })
})

describe('tapTempoDelta', () => {
  it('reports signed 0.1 BPM delta vs catalog', () => {
    expect(tapTempoDelta(128.4, 128)).toBe(0.4)
    expect(tapTempoDelta(127.2, 128)).toBe(-0.8)
    expect(tapTempoDelta(null, 128)).toBeNull()
  })
})

describe('bpmAgreement / scoreBpmSuggestionAccuracy', () => {
  it('treats half/double as agreement', () => {
    expect(bpmAgreement(87.5, 175)).toBe(1)
    expect(bpmAgreement(120, 124)).toBeGreaterThan(0)
    expect(bpmAgreement(120, 140)).toBe(0)
  })

  it('ranks scan candidates using tap + measured agreement', () => {
    const scored = scoreBpmSuggestionAccuracy(
      [
        { bpm: 128, hits: 40, expected: 48, lock: 0.7 },
        { bpm: 64, hits: 30, expected: 48, lock: 0.9 },
        { bpm: 129, hits: 42, expected: 48, lock: 0.85 },
      ],
      { tapBpm: 128.5, measuredBpm: 128 },
    )
    expect(scored[0].bpm).toBe(129)
    expect(scored[0].tapAgree).toBeGreaterThan(0.8)
    expect(formatBpmAccuracyNote(scored[0])).toContain('accuracy')
    expect(formatBpmAccuracyNote(scored[0])).toContain('tap')
  })
})

describe('detectFirstDropSec', () => {
  it('finds the first sustained energy jump after a quiet intro', () => {
    const sampleRate = 1000
    const data = new Array(20 * sampleRate).fill(0.02)
    for (let i = 8 * sampleRate; i < data.length; i++) data[i] = 0.4
    expect(detectFirstDropSec(data, sampleRate)).toBeGreaterThanOrEqual(7.5)
    expect(detectFirstDropSec(data, sampleRate)).toBeLessThan(9)
  })

  it('returns 0 when the groove is already loud', () => {
    const sampleRate = 1000
    const data = new Array(12 * sampleRate).fill(0.35)
    expect(detectFirstDropSec(data, sampleRate)).toBe(0)
  })
})

describe('formatClock', () => {
  it('formats drop time as m:ss', () => {
    expect(formatClock(32)).toBe('0:32')
    expect(formatClock(75)).toBe('1:15')
  })
})

describe('full-track BPM segments', () => {
  it('covers the whole duration with overlapping windows', () => {
    const segments = buildFullTrackSegments(200)
    expect(segments.length).toBeGreaterThan(3)
    expect(segments[0].start).toBe(0)
    expect(segments[segments.length - 1].end).toBe(200)
  })

  it('consolidates segment votes toward the strongest BPM', () => {
    const ranked = consolidateSegmentBpmVotes(
      [
        { bpm: 123, hits: 40, expected: 48, lock: 40 / 48 },
        { bpm: 123, hits: 38, expected: 48, lock: 38 / 48 },
        { bpm: 246, hits: 20, expected: 48, lock: 20 / 48 },
      ],
      [
        { bpm: 123, hits: 180, expected: 220, lock: 180 / 220 },
        { bpm: 62, hits: 90, expected: 220, lock: 90 / 220 },
      ],
    )
    expect(ranked[0].bpm).toBe(123)
    expect(ranked[0].hits).toBeGreaterThan(100)
  })
})
