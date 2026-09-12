import { describe, expect, it } from 'vitest'
import {
  barAlignedFadeProgress,
  createIntegratedMediaClock,
  followHeardMedia,
  integrateMediaSec,
  overlapBarSec,
  sampleOverlapClock,
  snapshotIntegratedMedia,
} from './overlap-clock'

describe('overlap-clock', () => {
  it('uses 2s bars at 120 BPM', () => {
    expect(overlapBarSec(120)).toBeCloseTo(2, 5)
  })

  it('lands fade exactly on bar lines (bass knee at bar 4 of 8)', () => {
    expect(barAlignedFadeProgress(0, 8)).toBe(0)
    expect(barAlignedFadeProgress(4, 8)).toBeCloseTo(0.5, 5)
    expect(barAlignedFadeProgress(8, 8)).toBe(1)
    const midBar = barAlignedFadeProgress(0.5, 8)
    expect(midBar).toBeGreaterThan(0)
    expect(midBar).toBeLessThan(1 / 8)
  })

  it('keeps tempo continuous while fade sits on the lattice', () => {
    const barSec = 2
    const mixSec = 16
    const atBar4 = sampleOverlapClock({
      mediaElapsedSec: 4 * barSec,
      bpm: 120,
      mixSec,
      overlapBars: 8,
    })
    expect(atBar4.raw).toBeCloseTo(0.5, 5)
    expect(atBar4.tempo).toBe(atBar4.raw)
    expect(atBar4.fade).toBeCloseTo(0.5, 5)
    expect(atBar4.eq).toBe(atBar4.fade)
    expect(atBar4.barIndex).toBe(4)
    expect(atBar4.done).toBe(false)

    const mid = sampleOverlapClock({
      mediaElapsedSec: 4 * barSec + 0.4,
      bpm: 120,
      mixSec,
      overlapBars: 8,
    })
    expect(mid.tempo).toBeGreaterThan(atBar4.tempo)
    expect(mid.fade).toBeGreaterThan(atBar4.fade)
    expect(mid.fade).toBeLessThan(5 / 8)
  })

  it('finishes at the last bar of the audible mix', () => {
    const end = sampleOverlapClock({
      mediaElapsedSec: 16,
      bpm: 120,
      mixSec: 16,
      overlapBars: 8,
    })
    expect(end.done).toBe(true)
    expect(end.fade).toBe(1)
    expect(end.raw).toBe(1)
  })

  it('integrates media on the shared ctx clock', () => {
    const clock = createIntegratedMediaClock(10, 1, 1.05)
    expect(integrateMediaSec(clock, 3)).toBeCloseTo(10 + 2 * 1.05, 5)
    const next = snapshotIntegratedMedia(clock, 3, 1.1)
    expect(next.mediaSec).toBeCloseTo(12.1, 5)
    expect(next.rate).toBe(1.1)
    expect(integrateMediaSec(next, 4)).toBeCloseTo(12.1 + 1.1, 5)
  })

  it('follows the audible playhead without copying jitter 1:1', () => {
    const followed = followHeardMedia(10, 10.04, 0.12)
    expect(followed).toBeGreaterThan(10)
    expect(followed).toBeLessThan(10.02)
  })
})
