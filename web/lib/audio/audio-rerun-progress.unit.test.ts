import { describe, expect, it } from 'vitest'
import {
  advanceAudioRerunPercent,
  estimateAudioRerunProgress,
} from './audio-rerun-progress'

describe('estimateAudioRerunProgress', () => {
  it('stays near queued early, then climbs while analyzing without using DSP gates', () => {
    const started = 1_000_000
    const queued = estimateAudioRerunProgress({
      phase: 'queued',
      startedAtMs: started,
      nowMs: started + 2_000,
      status: 'pending',
    })
    expect(queued.percent).toBeLessThanOrEqual(12)
    expect(queued.label).toMatch(/Queued/i)

    const mid = estimateAudioRerunProgress({
      phase: 'analyzing',
      startedAtMs: started,
      nowMs: started + 30_000,
      status: 'processing',
    })
    expect(mid.percent).toBeGreaterThan(30)
    expect(mid.percent).toBeLessThan(90)
    expect(mid.label).toMatch(/Analyzing/i)

    // Must never equal DSP gate landmarks as a hard floor
    expect(mid.percent).not.toBe(33)
    expect(mid.percent).not.toBe(34)
    expect(mid.percent).not.toBe(45)
  })

  it('jumps to discrete post-analysis phases', () => {
    expect(estimateAudioRerunProgress({ phase: 'saving', startedAtMs: 0 }).percent).toBe(92)
    expect(estimateAudioRerunProgress({ phase: 'rewriting', startedAtMs: 0 }).percent).toBe(96)
    expect(estimateAudioRerunProgress({ phase: 'done', startedAtMs: 0 }).percent).toBe(100)
  })
})

describe('advanceAudioRerunPercent', () => {
  it('never decreases', () => {
    expect(advanceAudioRerunPercent(40, 25)).toBe(40)
    expect(advanceAudioRerunPercent(40, 55)).toBe(55)
  })
})
