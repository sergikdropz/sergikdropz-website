import { describe, expect, it } from 'vitest'
import {
  alignBeatGridFromPeaks,
  alignHintsFromMeasured,
  BARS_PER_PHRASE,
  beatIndexAt,
  beatPeriodSec,
  beatPhaseSec,
  buildAlignPhraseTemplate,
  buildAlignStepTemplate,
  classifyBeatIndex,
  forEachBeatInWindow,
  resolveAlignBpm,
  setDownbeatAt,
  STEPS_PER_BAR,
  STEPS_PER_PHRASE,
} from './beat-grid'

describe('beatPeriodSec / phase', () => {
  it('converts BPM to period', () => {
    expect(beatPeriodSec(120)).toBeCloseTo(0.5, 8)
    expect(beatPeriodSec(0)).toBeNull()
  })

  it('wraps phase into [0, beat)', () => {
    expect(beatPhaseSec(1.25, 0.5)).toBeCloseTo(0.25, 8)
    expect(beatPhaseSec(-0.1, 0.5)).toBeCloseTo(0.4, 8)
  })
})

describe('phrase hierarchy', () => {
  it('labels section / phrase / bar / beat from the downbeat', () => {
    expect(classifyBeatIndex(0, 4)).toBe('section')
    expect(classifyBeatIndex(32, 4)).toBe('phrase')
    expect(classifyBeatIndex(4, 4)).toBe('bar')
    expect(classifyBeatIndex(5, 4)).toBe('beat')
  })

  it('setDownbeatAt stores phase so the playhead sits on a beat line', () => {
    const beat = 0.5
    const offset = setDownbeatAt(12.34, beat)
    expect(offset).toBeLessThan(beat)
    expect(offset).toBeCloseTo(12.34 % beat, 5)
    // Playhead lands on a beat line of the phase-only grid
    const phase = ((12.34 - offset) % beat + beat) % beat
    expect(phase).toBeLessThan(1e-9)
  })
})

describe('forEachBeatInWindow', () => {
  it('emits beats only inside the visible window', () => {
    const times: number[] = []
    forEachBeatInWindow(1.0, 2.6, 0.1, 0.5, (t) => times.push(t))
    expect(times[0]).toBeCloseTo(1.1, 8)
    expect(times[times.length - 1]).toBeCloseTo(2.6, 8)
  })
})

describe('Sonic DNA align priors', () => {
  it('resolves BPM toward confident DNA tempo', () => {
    const hints = alignHintsFromMeasured({
      bpm: 124,
      bpmConfidence: 0.82,
      drumFamily: 'four-on-the-floor',
      kickSteps: [0, 4, 8, 12],
      snareSteps: [4, 12],
      fourRatio: 0.55,
    })
    expect(resolveAlignBpm(120, hints)).toBeCloseTo(124, 5)
  })

  it('uses half-time effective pulse when DNA marks it', () => {
    const hints = alignHintsFromMeasured({
      bpm: 140,
      bpmConfidence: 0.8,
      effectiveBpm: 70,
      timingFeel: 'half-time',
      drumFamily: 'half-time',
      kickSteps: [0],
      snareSteps: [8],
    })
    expect(resolveAlignBpm(70, hints)).toBeCloseTo(70, 5)
  })

  it('weights kick steps higher for four-on-the-floor', () => {
    const hints = alignHintsFromMeasured({
      bpm: 128,
      bpmConfidence: 0.9,
      drumFamily: 'four-on-the-floor',
      kickSteps: [0, 4, 8, 12],
      snareSteps: [4, 12],
      fourRatio: 0.6,
      spectral: { relative: { kick: 0.35 } },
    })
    const tmpl = buildAlignStepTemplate(hints)
    expect(tmpl[0]!).toBeGreaterThan(tmpl[2]!)
    expect(tmpl[0]!).toBeGreaterThan(tmpl[1]!)
  })

  it('builds an 8-bar × 16-step phrase template', () => {
    const hints = alignHintsFromMeasured({
      bpm: 120,
      bpmConfidence: 0.9,
      drumFamily: 'four-on-the-floor',
      kickSteps: [0, 4, 8, 12],
      snareSteps: [4, 12],
      stepsPerBar: STEPS_PER_BAR,
      phraseBars: BARS_PER_PHRASE,
    })
    const phrase = buildAlignPhraseTemplate(hints)
    expect(phrase.length).toBe(STEPS_PER_PHRASE)
    expect(phrase[0]!).toBeGreaterThan(phrase[STEPS_PER_BAR]!)
  })

  it('prefers DSP phrase steps over tiled bar pocket', () => {
    const hints = alignHintsFromMeasured({
      bpm: 90,
      bpmConfidence: 0.9,
      drumFamily: 'boom-bap',
      kickSteps: [0],
      snareSteps: [8],
      kickPhraseSteps: [0, 64],
      snarePhraseSteps: [8, 72],
      stepsPerBar: 16,
      phraseBars: 8,
    })
    const phrase = buildAlignPhraseTemplate(hints)
    expect(phrase[0]!).toBeGreaterThan(0)
    expect(phrase[64]!).toBeGreaterThan(0)
    expect(phrase[8]!).toBeGreaterThan(0)
  })
})

describe('alignBeatGridFromPeaks', () => {
  it('locks phase to a synthetic kick train', () => {
    const bpm = 120
    const beat = 60 / bpm
    const durationSec = 32
    const n = 1600
    const peaks = Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * durationSec
      const phase = ((t % beat) + beat) % beat
      return phase < 0.045 ? 0.9 : 0.05
    })
    const aligned = alignBeatGridFromPeaks({ peaks, durationSec, bpm, beatsPerBar: 4 })
    expect(aligned).not.toBeNull()
    expect(aligned!.lock).toBeGreaterThan(0.2)
    expect(Math.abs(aligned!.bpm - bpm)).toBeLessThan(1.5)
    const period = 60 / aligned!.bpm
    let hits = 0
    for (let k = 0; k < 16; k++) {
      const t = aligned!.offsetSec + k * period
      const idx = Math.min(n - 1, Math.max(0, Math.round((t / durationSec) * n - 0.5)))
      if (peaks[idx]! > 0.5) hits++
    }
    expect(hits).toBeGreaterThanOrEqual(10)
    const phase = beatPhaseSec(aligned!.offsetSec, beat)
    expect(phase < 0.08 || phase > beat - 0.08).toBe(true)
  })

  it('uses Sonic DNA boom-bap pocket to prefer the true downbeat over beat 2', () => {
    const bpm = 90
    const beat = 60 / bpm
    const bar = beat * 4
    const durationSec = 48
    const n = 2400
    const peaks = Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * durationSec
      const phase = ((t % bar) + bar) % bar
      const step = (phase / bar) * 16
      if (step < 0.35 || step > 15.65) return 1.0
      if (step > 7.65 && step < 8.35) return 0.95
      if (step > 3.65 && step < 4.35) return 0.35
      return 0.04
    })

    const withDna = alignBeatGridFromPeaks({
      peaks,
      durationSec,
      bpm: 88,
      beatsPerBar: 4,
      sonicDna: {
        measured: {
          bpm: 90,
          bpmConfidence: 0.9,
          drumFamily: 'boom-bap',
          kickSteps: [0],
          snareSteps: [8],
          fourRatio: 0.15,
          timingFeel: 'full-time',
          stepsPerBar: 16,
          phraseBars: 8,
        },
      },
    })

    expect(withDna).not.toBeNull()
    expect(Math.abs(withDna!.bpm - 90)).toBeLessThan(0.5)

    const barPhase = (t: number) => ((t % bar) + bar) % bar
    const dnaPhase = barPhase(withDna!.offsetSec)
    expect(dnaPhase < beat * 0.35 || dnaPhase > bar - beat * 0.35).toBe(true)
  })

  it('locks phrase downbeat when DNA provides 8-bar phrase steps', () => {
    const bpm = 120
    const beat = 60 / bpm
    const bar = beat * 4
    const phrase = bar * 8
    const durationSec = phrase * 3
    const n = 2400
    const peaks = Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * durationSec
      const p = ((t % phrase) + phrase) % phrase
      if (p < 0.06) return 1.0
      const phase = ((t % beat) + beat) % beat
      return phase < 0.04 ? 0.25 : 0.03
    })

    const aligned = alignBeatGridFromPeaks({
      peaks,
      durationSec,
      bpm: 118,
      beatsPerBar: 4,
      sonicDna: {
        measured: {
          bpm: 120,
          bpmConfidence: 0.92,
          drumFamily: 'four-on-the-floor',
          kickSteps: [0, 4, 8, 12],
          snareSteps: [4, 12],
          kickPhraseSteps: [0],
          snarePhraseSteps: [4, 12],
          stepsPerBar: 16,
          phraseBars: 8,
          fourRatio: 0.5,
        },
      },
    })

    expect(aligned).not.toBeNull()
    const phrasePhase = ((aligned!.offsetSec % phrase) + phrase) % phrase
    expect(phrasePhase < beat * 0.4 || phrasePhase > phrase - beat * 0.4).toBe(true)
  })

  it('locks four-on-the-floor with DNA kick steps even when intro is sparse', () => {
    const bpm = 124
    const beat = 60 / bpm
    const durationSec = 40
    const n = 2000
    const peaks = Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * durationSec
      if (t < 2.5) return 0.02
      const phase = ((t % beat) + beat) % beat
      return phase < 0.04 ? 0.85 : 0.06
    })

    const aligned = alignBeatGridFromPeaks({
      peaks,
      durationSec,
      bpm: 120,
      beatsPerBar: 4,
      sonicDna: {
        measured: {
          bpm: 124,
          bpmConfidence: 0.88,
          drumFamily: 'four-on-the-floor',
          kickSteps: [0, 4, 8, 12],
          snareSteps: [4, 12],
          fourRatio: 0.52,
          spectral: { relative: { kick: 0.3 } },
          stepsPerBar: 16,
          phraseBars: 8,
        },
      },
    })

    expect(aligned).not.toBeNull()
    expect(aligned!.bpm).toBeCloseTo(124, 5)
    expect(aligned!.offsetSec).toBeGreaterThanOrEqual(2.0)
    const phase = beatPhaseSec(aligned!.offsetSec, beat)
    expect(phase < 0.08 || phase > beat - 0.08).toBe(true)
  })
})
