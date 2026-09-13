import { describe, expect, it } from 'vitest'
import { fasterDbFs, fasterLog2, scopeAmplitude } from './waveform-scope-scale'

describe('fasterLog2 (Mineiro / MiniMeters OSS)', () => {
  it('approximates Math.log2 for typical amplitude range', () => {
    for (const x of [0.001, 0.01, 0.1, 0.5, 1]) {
      expect(Math.abs(fasterLog2(x) - Math.log2(x))).toBeLessThan(0.08)
    }
  })

  it('maps full scale near 0 dBFS', () => {
    expect(Math.abs(fasterDbFs(1))).toBeLessThan(0.5)
    expect(fasterDbFs(0.001)).toBeLessThan(-55)
  })
})

describe('scopeAmplitude', () => {
  it('keeps linear 1:1', () => {
    expect(scopeAmplitude(0.25, 'linear')).toBeCloseTo(0.25, 5)
    expect(scopeAmplitude(0.9, 'linear')).toBeCloseTo(0.9, 5)
  })

  it('Scaled mode lifts quiet material (MiniMeters Scaled)', () => {
    const quiet = scopeAmplitude(0.05, 'scaled')
    expect(quiet).toBeGreaterThan(0.05)
    expect(scopeAmplitude(1, 'scaled')).toBeCloseTo(1, 2)
    expect(scopeAmplitude(0, 'scaled')).toBe(0)
  })
})
