import { describe, expect, it } from 'vitest'
import {
  isUnsetOffset,
  readDnaBeatPhaseSec,
  resolveMixGridOffset,
} from './grid-offset'
import { toPhaseOnlyOffsetSec } from './phrase-lattice'

describe('toPhaseOnlyOffsetSec', () => {
  it('folds absolute kick times into within-beat phase', () => {
    expect(toPhaseOnlyOffsetSec(3.2, 0.5)).toBeCloseTo(0.2, 5)
    expect(toPhaseOnlyOffsetSec(0, 0.5)).toBe(0)
    expect(toPhaseOnlyOffsetSec(0.18, 0.5)).toBeCloseTo(0.18, 5)
  })
})

describe('resolveMixGridOffset', () => {
  it('prefers stored phase when it agrees with peak alignment', () => {
    const bpm = 120
    const beat = 60 / bpm
    const durationSec = 32
    const n = 1600
    const truePhase = 0.18
    const peaks = Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * durationSec
      const phase = ((t - truePhase) % beat + beat) % beat
      return phase < 0.045 ? 0.9 : 0.05
    })
    const offset = resolveMixGridOffset(
      {
        id: 'a',
        file: '/a.mp3',
        bpm,
        beat_grid_offset: truePhase,
        sonic_dna: {
          measured: {
            bpm,
            bpmConfidence: 0.85,
            drumFamily: 'four-on-the-floor',
            kickSteps: [0, 4, 8, 12],
            snareSteps: [4, 12],
          },
        },
      },
      { peaks, durationSec },
    )
    expect(offset).toBeLessThan(beat)
    expect(offset).toBeCloseTo(truePhase, 1)
  })

  it('folds legacy absolute stored offset into phase', () => {
    const offset = resolveMixGridOffset({
      id: 'a',
      file: '/a.mp3',
      bpm: 120,
      beat_grid_offset: 3.2,
    })
    expect(offset).toBeCloseTo(0.2, 5)
    expect(offset).toBeLessThan(0.5)
  })

  it('returns phase 0 when unset', () => {
    expect(resolveMixGridOffset({ id: 'a', file: '/a.mp3', bpm: 120 })).toBe(0)
  })

  it('reads DNA kick as phase, not absolute lattice origin', () => {
    const phase = readDnaBeatPhaseSec(
      {
        measured: {
          bpm: 120,
          gridOffsetSec: 3.2,
          kickOnsetSec: [3.2, 3.7, 4.2, 4.7],
        },
      },
      0.5,
    )
    expect(phase).toBeCloseTo(0.2, 5)
  })

  it('isUnsetOffset treats 0 as valid phase', () => {
    expect(isUnsetOffset(0)).toBe(false)
    expect(isUnsetOffset(null)).toBe(true)
    expect(isUnsetOffset(undefined)).toBe(true)
  })
})
