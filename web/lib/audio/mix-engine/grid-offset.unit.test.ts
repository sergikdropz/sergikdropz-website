import { describe, expect, it } from 'vitest'
import {
  isUnsetOffset,
  playbackGridPhaseSec,
  readDnaBeatPhaseSec,
  resolveMixGridOffset,
} from './grid-offset'
import { toPhaseOnlyOffsetSec, wrapOffsetSec } from './phrase-lattice'

describe('toPhaseOnlyOffsetSec', () => {
  it('folds absolute kick times into within-beat phase', () => {
    expect(toPhaseOnlyOffsetSec(3.2, 0.5)).toBeCloseTo(0.2, 5)
    expect(toPhaseOnlyOffsetSec(0, 0.5)).toBe(0)
    expect(toPhaseOnlyOffsetSec(0.18, 0.5)).toBeCloseTo(0.18, 5)
  })
})

describe('wrapOffsetSec', () => {
  it('wraps into an arbitrary CDJ jog window', () => {
    expect(wrapOffsetSec(0.52, 8)).toBeCloseTo(0.52, 8)
    expect(wrapOffsetSec(8.02, 8)).toBeCloseTo(0.02, 8)
    expect(wrapOffsetSec(-0.1, 8)).toBeCloseTo(7.9, 8)
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

  it('keeps a stored half-beat phase (catalog wins over peak snap)', () => {
    const bpm = 125
    const beat = 60 / bpm
    const durationSec = 24
    const n = 1400
    const truePhase = 0.08
    const stored = truePhase + beat * 0.5
    const peaks = Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * durationSec
      const phase = ((t - truePhase) % beat + beat) % beat
      return phase < 0.04 ? 0.9 : 0.05
    })
    const offset = resolveMixGridOffset(
      {
        id: 'a',
        file: '/a.mp3',
        bpm,
        beat_grid_offset: stored,
      },
      { peaks, durationSec },
    )
    expect(offset).toBeCloseTo(toPhaseOnlyOffsetSec(stored, beat), 5)
  })

  it('keeps a user-nudged manual phase instead of re-snapping to peaks', () => {
    const bpm = 128
    const beat = 60 / bpm
    const durationSec = 24
    const n = 1200
    const truePhase = 0.04
    const manual = 0.056
    const peaks = Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * durationSec
      const phase = ((t - truePhase) % beat + beat) % beat
      return phase < 0.04 ? 0.9 : 0.05
    })
    const offset = resolveMixGridOffset(
      {
        id: 'a',
        file: '/a.mp3',
        bpm,
        beat_grid_offset: manual,
        sonic_dna: { measured: { bpm, gridOffsetSec: manual, gridManual: true }, gridManual: true },
      },
      { peaks, durationSec },
    )
    expect(offset).toBeCloseTo(manual, 3)
  })

  it('keeps catalog phase 0 (CDJ file-start downbeat) instead of peak override', () => {
    const bpm = 120
    const beat = 60 / bpm
    const durationSec = 24
    const n = 1200
    const truePhase = 0.2
    const peaks = Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * durationSec
      const phase = ((t - truePhase) % beat + beat) % beat
      return phase < 0.04 ? 0.9 : 0.05
    })
    const offset = resolveMixGridOffset(
      {
        id: 'a',
        file: '/a.mp3',
        bpm,
        beat_grid_offset: 0,
      },
      { peaks, durationSec },
    )
    expect(offset).toBe(0)
  })

  it('peak-aligns only when catalog phase is unset', () => {
    const bpm = 120
    const beat = 60 / bpm
    const durationSec = 24
    const n = 1200
    const truePhase = 0.2
    const peaks = Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * durationSec
      const phase = ((t - truePhase) % beat + beat) % beat
      return phase < 0.04 ? 0.9 : 0.05
    })
    const offset = resolveMixGridOffset(
      {
        id: 'a',
        file: '/a.mp3',
        bpm,
      },
      { peaks, durationSec },
    )
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

  it('ignores analysis-window gridOffsetSec (mid-track 60s slice)', () => {
    const phase = readDnaBeatPhaseSec(
      {
        measured: {
          bpm: 123.05,
          gridOffsetSec: 50.69,
          window: { startSec: 50.69, endSec: 110.69, reason: 'mid-track-60s' },
          kickOnsetSec: [50.69, 51.18, 51.66],
        },
      },
      60 / 123.05,
    )
    expect(phase).toBeNull()
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

describe('playbackGridPhaseSec', () => {
  it('folds a legacy first-kick offset so IN stays at phrase 1', () => {
    expect(
      playbackGridPhaseSec({
        bpm: 120,
        beat_grid_offset: 3.2,
      }),
    ).toBeCloseTo(0.2, 5)
  })
})
