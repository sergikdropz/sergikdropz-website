import { describe, expect, it } from 'vitest'
import {
  parseAutoDJConfig,
  resolveIncomingRateForStrategy,
  DEFAULT_AUTO_DJ_CONFIG,
} from './auto-dj-preferences'

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
})
