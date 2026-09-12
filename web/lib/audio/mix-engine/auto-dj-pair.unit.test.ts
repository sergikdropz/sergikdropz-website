import { describe, expect, it } from 'vitest'
import {
  pickTrustedAutoDjTrack,
  scoreAutoDjPair,
  resolvePairBpm,
  diagnoseAutoDjPickStall,
  qualitySoftBpmRel,
  BPM_SOFT_REL,
  BPM_COMPAT_REL,
} from './auto-dj-pair'

const lockedDnaAt = (bpm: number) => ({
  gridLocked: true,
  measured: { gridLocked: true, gridLockScore: 0.8, bpm, bpmConfidence: 0.9 },
})
const lockedDna = lockedDnaAt(128)

describe('resolvePairBpm', () => {
  it('prefers catalog BPM when DNA disagrees beyond soft %', () => {
    expect(
      resolvePairBpm({
        id: 'wide',
        bpm: 160,
        sonic_dna: lockedDnaAt(128),
      }),
    ).toBe(160)
  })
})

describe('scoreAutoDjPair', () => {
  it('refuses BeatSync when a grid is missing', () => {
    const score = scoreAutoDjPair({
      outgoing: { id: 'a', bpm: 128, sonic_dna: lockedDna, beat_grid_offset: 0.02 },
      incoming: { id: 'b', bpm: 128, sonic_dna: {} },
      syncMode: 'beat-sync',
    })
    expect(score.reject).toBe(true)
    expect(score.rejectReason).toMatch(/grid unlocked/i)
  })

  it('soft-prefers pairs inside 4% BPM', () => {
    const tight = scoreAutoDjPair({
      outgoing: { id: 'a', bpm: 128, sonic_dna: lockedDna, beat_grid_offset: 0 },
      incoming: { id: 'b', bpm: 130, sonic_dna: lockedDnaAt(130), beat_grid_offset: 0 },
      syncMode: 'beat-sync',
    })
    const wide = scoreAutoDjPair({
      outgoing: { id: 'a', bpm: 128, sonic_dna: lockedDna, beat_grid_offset: 0 },
      incoming: { id: 'c', bpm: 134, sonic_dna: lockedDnaAt(134), beat_grid_offset: 0 },
      syncMode: 'beat-sync',
    })
    expect(tight.bpmRel ?? 1).toBeLessThanOrEqual(BPM_SOFT_REL)
    expect(wide.bpmRel ?? 0).toBeGreaterThan(BPM_SOFT_REL)
    expect(wide.bpmRel ?? 1).toBeLessThanOrEqual(BPM_COMPAT_REL)
    expect(tight.total).toBeGreaterThan(wide.total)
  })

  it('soft-penalizes peak-only kicks on an unlocked grid', () => {
    const stored = scoreAutoDjPair({
      outgoing: { id: 'a', bpm: 128, sonic_dna: lockedDna, beat_grid_offset: 0 },
      incoming: {
        id: 'b',
        bpm: 128,
        sonic_dna: {
          measured: {
            bpm: 128,
            bpmConfidence: 0.9,
            kickOnsetSec: [0, 0.47, 0.94, 1.41, 1.88],
          },
        },
        beat_grid_offset: 0,
      },
      syncMode: 'beat-sync',
    })
    const peakOnly = scoreAutoDjPair({
      outgoing: { id: 'a', bpm: 128, sonic_dna: lockedDna, beat_grid_offset: 0 },
      incoming: { id: 'c', bpm: 128, sonic_dna: { measured: { bpm: 128 } }, beat_grid_offset: 0 },
      syncMode: 'beat-sync',
    })
    expect(peakOnly.why).toMatch(/peak-only kicks/i)
    expect(peakOnly.total).toBeLessThan(stored.total)
  })

  it('penalizes a pair that just mixed poorly', () => {
    const base = {
      outgoing: { id: 'a', bpm: 128, sonic_dna: lockedDna, beat_grid_offset: 0 },
      incoming: { id: 'b', bpm: 128, sonic_dna: lockedDna, beat_grid_offset: 0 },
      syncMode: 'beat-sync' as const,
    }
    const ok = scoreAutoDjPair(base)
    const poor = scoreAutoDjPair({
      ...base,
      lastGrade: 'poor',
      lastIncomingId: 'b',
    })
    expect(poor.reject).toBe(true)
    expect(poor.rejectReason).toMatch(/avoid last incoming/i)
    expect(poor.total).toBeLessThan(ok.total)
  })

  it('tightens soft BPM after consecutive weak mixes', () => {
    const base = {
      outgoing: { id: 'a', bpm: 128, sonic_dna: lockedDna, beat_grid_offset: 0 },
      incoming: { id: 'b', bpm: 132, sonic_dna: lockedDnaAt(132), beat_grid_offset: 0 },
      syncMode: 'beat-sync' as const,
    }
    const normal = scoreAutoDjPair(base)
    const weak = scoreAutoDjPair({ ...base, consecutiveWeak: 2, lastGrade: 'fair' })
    expect(normal.reject).toBe(false)
    expect(weak.reject).toBe(true)
    expect(weak.rejectReason).toMatch(/after weak mix/i)
  })
})

describe('diagnoseAutoDjPickStall', () => {
  it('surfaces lock / remeasure / TempoSync hints', () => {
    const stall = diagnoseAutoDjPickStall({
      outgoing: { id: 'out', bpm: 128, sonic_dna: lockedDna, beat_grid_offset: 0 },
      candidates: [{ id: 'unlocked', bpm: 128, sonic_dna: {} }],
      syncMode: 'beat-sync',
    })
    expect(stall.rejectReason).toMatch(/grid unlocked|BeatSync/i)
    expect(stall.needsLockGrids).toBe(true)
    expect(stall.suggestTempoSync).toBe(true)
  })
})

describe('qualitySoftBpmRel', () => {
  it('narrows after weak mixes', () => {
    expect(qualitySoftBpmRel(0)).toBe(BPM_SOFT_REL)
    expect(qualitySoftBpmRel(1)).toBeLessThan(BPM_SOFT_REL)
    expect(qualitySoftBpmRel(2)).toBeLessThan(qualitySoftBpmRel(1))
  })
})

describe('pickTrustedAutoDjTrack', () => {
  it('skips BeatSync-unsafe candidates when a locked pair exists', () => {
    const pick = pickTrustedAutoDjTrack({
      outgoing: { id: 'out', bpm: 128, sonic_dna: lockedDna, beat_grid_offset: 0 },
      candidates: [
        { id: 'unlocked', bpm: 128, sonic_dna: {} },
        { id: 'safe', bpm: 129, sonic_dna: lockedDna, beat_grid_offset: 0.01 },
      ],
      syncMode: 'beat-sync',
    })
    expect(pick?.track.id).toBe('safe')
  })

  it('prefers a locked FoF neighbor over half-time hip-hop at the same BPM', () => {
    const fofDna = {
      gridLocked: true,
      measured: {
        gridLocked: true,
        gridLockScore: 0.8,
        bpm: 123,
        bpmConfidence: 0.9,
        drumFamily: 'four-on-the-floor',
      },
    }
    const trapDna = {
      gridLocked: true,
      measured: {
        gridLocked: true,
        gridLockScore: 0.8,
        bpm: 123,
        bpmConfidence: 0.9,
        drumFamily: 'half-time',
        timingFeel: 'half-time',
      },
    }
    const pick = pickTrustedAutoDjTrack({
      outgoing: { id: 'out', bpm: 123, sonic_dna: fofDna, beat_grid_offset: 0 },
      candidates: [
        { id: 'cosmic-cadillac', bpm: 123, sonic_dna: trapDna, beat_grid_offset: 0 },
        { id: 'house-neighbor', bpm: 123, sonic_dna: fofDna, beat_grid_offset: 0.01 },
      ],
      syncMode: 'beat-sync',
    })
    expect(pick?.track.id).toBe('house-neighbor')
  })

  it('does not fall back to a rejected pair when a FoF locked neighbor exists', () => {
    const fofDna = {
      gridLocked: true,
      measured: {
        gridLocked: true,
        gridLockScore: 0.8,
        bpm: 128,
        bpmConfidence: 0.9,
        drumFamily: 'four-on-the-floor',
      },
    }
    const pick = pickTrustedAutoDjTrack({
      outgoing: { id: 'out', bpm: 128, sonic_dna: fofDna, beat_grid_offset: 0 },
      candidates: [
        { id: 'wide-bpm', bpm: 160, sonic_dna: fofDna, beat_grid_offset: 0 },
        { id: 'safe', bpm: 129, sonic_dna: fofDna, beat_grid_offset: 0.01 },
      ],
      syncMode: 'beat-sync',
    })
    expect(pick?.track.id).toBe('safe')
  })
})
