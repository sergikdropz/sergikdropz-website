import { describe, expect, it } from 'vitest'
import {
  parseAutoDJConfig,
  resolveIncomingRateForStrategy,
  beatCorrectFlags,
  withPhaseMeterGridAlign,
  DEFAULT_AUTO_DJ_CONFIG,
} from './auto-dj-preferences'
import { phaseMeterWindowToGridAlign } from './waveform-overlays'

describe('resolveIncomingRateForStrategy', () => {
  const beatmatchRate = 0.94
  const sliderRate = 1.06

  it('handoff (match-outgoing) settles on incoming native BPM', () => {
    expect(
      resolveIncomingRateForStrategy({
        strategy: 'match-outgoing',
        beatmatchRate,
        sliderRate,
      }),
    ).toBe(1)
  })

  it('native also settles on 1.0', () => {
    expect(
      resolveIncomingRateForStrategy({ strategy: 'native', beatmatchRate, sliderRate }),
    ).toBe(1)
  })

  it('honors only the tempo slider for manual', () => {
    expect(
      resolveIncomingRateForStrategy({ strategy: 'manual', beatmatchRate, sliderRate }),
    ).toBeCloseTo(sliderRate, 5)
  })

  it('falls back for nonsense manual slider', () => {
    expect(
      resolveIncomingRateForStrategy({
        strategy: 'manual',
        beatmatchRate,
        sliderRate: -1,
      }),
    ).toBe(1)
  })
})

describe('parseAutoDJConfig', () => {
  it('round-trips a known bpmStrategy', () => {
    expect(parseAutoDJConfig({ bpmStrategy: 'native' }).bpmStrategy).toBe('native')
  })

  it('falls back to the default for an unknown bpmStrategy', () => {
    expect(parseAutoDJConfig({ bpmStrategy: 'nope' }).bpmStrategy).toBe(
      DEFAULT_AUTO_DJ_CONFIG.bpmStrategy,
    )
  })

  it('defaults to BeatSync per DJ doctrine', () => {
    expect(DEFAULT_AUTO_DJ_CONFIG.syncMode).toBe('beat-sync')
  })

  it('round-trips syncMode', () => {
    expect(parseAutoDJConfig({ syncMode: 'tempo-sync' }).syncMode).toBe('tempo-sync')
    expect(parseAutoDJConfig({ syncMode: 'nope' }).syncMode).toBe(
      DEFAULT_AUTO_DJ_CONFIG.syncMode,
    )
  })

  it('returns defaults for junk input', () => {
    expect(parseAutoDJConfig(null)).toEqual(DEFAULT_AUTO_DJ_CONFIG)
    expect(parseAutoDJConfig('nope')).toEqual(DEFAULT_AUTO_DJ_CONFIG)
  })

  it('defaults Smooth techniques to standard (not DNA auto)', () => {
    expect(DEFAULT_AUTO_DJ_CONFIG.mixStyle).toBe('crossfade')
    expect(DEFAULT_AUTO_DJ_CONFIG.mixTechniques).toEqual(['standard'])
  })

  it('round-trips sectionStyle', () => {
    expect(DEFAULT_AUTO_DJ_CONFIG.sectionStyle).toBe(true)
    expect(parseAutoDJConfig({ sectionStyle: false }).sectionStyle).toBe(false)
  })

  it('round-trips blendQuantize, beatCorrect, and autoCorrectWeakMixes', () => {
    expect(DEFAULT_AUTO_DJ_CONFIG.blendQuantize).toBe('phrase')
    expect(DEFAULT_AUTO_DJ_CONFIG.beatCorrect).toBe('phase-kick')
    expect(DEFAULT_AUTO_DJ_CONFIG.autoCorrectWeakMixes).toBe(true)
    expect(parseAutoDJConfig({ blendQuantize: 'bar' }).blendQuantize).toBe('bar')
    expect(parseAutoDJConfig({ beatCorrect: 'phase' }).beatCorrect).toBe('phase')
    expect(parseAutoDJConfig({ beatCorrect: 'grid' }).beatCorrect).toBe('grid')
    expect(parseAutoDJConfig({ beatCorrect: 'grid-bar' }).beatCorrect).toBe('grid-bar')
    expect(parseAutoDJConfig({ beatCorrect: 'grid-phrase' }).beatCorrect).toBe('grid-phrase')
    expect(parseAutoDJConfig({ beatCorrect: 'grid-phase' }).beatCorrect).toBe('grid-phase')
    expect(parseAutoDJConfig({ beatCorrect: 'grid-kick' }).beatCorrect).toBe('grid-kick')
    expect(parseAutoDJConfig({ beatCorrect: 'grid-bar-kick' }).beatCorrect).toBe('grid-bar-kick')
    expect(parseAutoDJConfig({ beatCorrect: 'grid-phrase-kick' }).beatCorrect).toBe(
      'grid-phrase-kick',
    )
    expect(parseAutoDJConfig({ beatCorrect: 'grid-phase-kick' }).beatCorrect).toBe(
      'grid-phase-kick',
    )
    expect(parseAutoDJConfig({ cuePriority: 'hot-cue-3' }).cuePriority).toBe('hot-cue-3')
    expect(parseAutoDJConfig({ cuePriority: 'memory-cue' }).cuePriority).toBe('memory-cue')
    expect(parseAutoDJConfig({ autoCorrectWeakMixes: false }).autoCorrectWeakMixes).toBe(false)
    expect(parseAutoDJConfig({ blendQuantize: 'nope' }).blendQuantize).toBe('phrase')
    expect(parseAutoDJConfig({ beatCorrect: 'nope' }).beatCorrect).toBe('phase-kick')
  })

  it('round-trips creativeMode', () => {
    expect(DEFAULT_AUTO_DJ_CONFIG.creativeMode).toBe(false)
    expect(parseAutoDJConfig({ creativeMode: true }).creativeMode).toBe(true)
  })

  it('maps beatCorrect modes onto vinyl / kick / grid flags', () => {
    expect(beatCorrectFlags('off')).toEqual({ vinylBend: false, kickCorrect: false, gridAlign: null })
    expect(beatCorrectFlags('grid')).toEqual({ vinylBend: false, kickCorrect: false, gridAlign: 'beat' })
    expect(beatCorrectFlags('grid-bar')).toEqual({ vinylBend: false, kickCorrect: false, gridAlign: 'bar' })
    expect(beatCorrectFlags('grid-phrase')).toEqual({
      vinylBend: false,
      kickCorrect: false,
      gridAlign: 'phrase',
    })
    expect(beatCorrectFlags('phase')).toEqual({ vinylBend: true, kickCorrect: false, gridAlign: null })
    expect(beatCorrectFlags('phase-kick')).toEqual({
      vinylBend: true,
      kickCorrect: true,
      gridAlign: null,
    })
    expect(beatCorrectFlags('grid-phase')).toEqual({
      vinylBend: true,
      kickCorrect: false,
      gridAlign: 'beat',
    })
    expect(beatCorrectFlags('grid-kick')).toEqual({
      vinylBend: false,
      kickCorrect: true,
      gridAlign: 'beat',
    })
    expect(beatCorrectFlags('grid-bar-kick')).toEqual({
      vinylBend: false,
      kickCorrect: true,
      gridAlign: 'bar',
    })
    expect(beatCorrectFlags('grid-phrase-kick')).toEqual({
      vinylBend: false,
      kickCorrect: true,
      gridAlign: 'phrase',
    })
    expect(beatCorrectFlags('grid-phase-kick')).toEqual({
      vinylBend: true,
      kickCorrect: true,
      gridAlign: 'beat',
    })
  })

  it('withPhaseMeterGridAlign keeps vinyl/kick and forces meter lattice', () => {
    expect(phaseMeterWindowToGridAlign('beat-1')).toBe('beat')
    expect(phaseMeterWindowToGridAlign('bar-1')).toBe('bar')
    expect(phaseMeterWindowToGridAlign('phrase-1')).toBe('phrase')

    expect(withPhaseMeterGridAlign('phase-kick', 'bar')).toBe('grid-bar-kick')
    expect(withPhaseMeterGridAlign('phase', 'phrase')).toBe('grid-phrase')
    expect(withPhaseMeterGridAlign('off', 'beat')).toBe('grid')
    expect(withPhaseMeterGridAlign('grid-phrase', 'beat')).toBe('grid')
    // Plan stamping restores vinyl from the user's Beat correct prefs.
    expect(beatCorrectFlags('phase-kick').vinylBend).toBe(true)
    expect(beatCorrectFlags(withPhaseMeterGridAlign('phase-kick', 'bar')).gridAlign).toBe('bar')
  })

  it('keeps transitionMode only as legacy parse fallback', () => {
    expect(DEFAULT_AUTO_DJ_CONFIG.transitionMode).toBe('crossfade')
    expect(parseAutoDJConfig({ mixStyle: 'filter-eq' }).transitionMode).toBe('filter-eq')
    expect(parseAutoDJConfig({ transitionMode: 'cutout-filter' }).transitionMode).toBe(
      'cutout-filter',
    )
  })
})
