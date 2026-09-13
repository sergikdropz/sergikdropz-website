import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PHASE_METER_OPTIONS,
  parsePhaseMeterOptions,
  resolvePhaseMeterWindowBeats,
} from './waveform-overlays'

describe('DEFAULT_PHASE_METER_OPTIONS', () => {
  it('matches the factory DJ phase-meter menu', () => {
    expect(DEFAULT_PHASE_METER_OPTIONS).toMatchObject({
      windowId: 'bar-4',
      showBeats: true,
      showBars: true,
      showPhrases: false,
      showMs: false,
      jogFeel: 'coarse',
      jogSensitivity: 4,
      centerSnap: true,
      quantize: 'phrase',
      phraseBars: 8,
    })
  })
})

describe('parsePhaseMeterOptions', () => {
  it('fills missing fields from factory defaults', () => {
    expect(parsePhaseMeterOptions({ windowId: 'beat-1' })).toMatchObject({
      windowId: 'beat-1',
      jogFeel: 'coarse',
      jogSensitivity: 4,
      quantize: 'phrase',
    })
  })

  it('accepts CDJ 2/4/8 bar windows', () => {
    expect(parsePhaseMeterOptions({ windowId: 'bar-2' }).windowId).toBe('bar-2')
    expect(parsePhaseMeterOptions({ windowId: 'bar-4' }).windowId).toBe('bar-4')
    expect(parsePhaseMeterOptions({ windowId: 'bar-8' }).windowId).toBe('bar-8')
  })

  it('rejects junk and returns defaults', () => {
    expect(parsePhaseMeterOptions(null)).toEqual(DEFAULT_PHASE_METER_OPTIONS)
    expect(parsePhaseMeterOptions({ jogFeel: 'nope', jogSensitivity: -3 }).jogFeel).toBe(
      'coarse',
    )
  })
})

describe('resolvePhaseMeterWindowBeats', () => {
  it('maps 2/4/8 bar CDJ presets to full-strip beat counts', () => {
    expect(resolvePhaseMeterWindowBeats('bar-2', 4)).toBe(16) // ±2 bars
    expect(resolvePhaseMeterWindowBeats('bar-4', 4)).toBe(32) // ±4 bars
    expect(resolvePhaseMeterWindowBeats('bar-8', 4)).toBe(64) // ±8 bars
  })
})
