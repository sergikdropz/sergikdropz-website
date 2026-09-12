import { describe, expect, it } from 'vitest'
import {
  resolvePreAudibleNudge,
  PRE_AUDIBLE_LOCK_SEC,
  SILENT_VINYL_BEND_MAX,
} from './pre-audible-nudge'

describe('pre-audible nudge', () => {
  it('seeks a 40ms silent residual (audible window would skip <22ms only)', () => {
    const n = resolvePreAudibleNudge({
      phaseErrSec: 0.04,
      bpm: 128,
      silent: true,
    })
    expect(n.seekDeltaSec).toBeCloseTo(0.04, 3)
    expect(n.locked).toBe(false)
  })

  it('seeks a 120ms silent residual up to half beat', () => {
    const n = resolvePreAudibleNudge({
      phaseErrSec: 0.12,
      bpm: 128,
      silent: true,
    })
    expect(n.seekDeltaSec).toBeCloseTo(0.12, 3)
  })

  it('does not seek a half-beat miss — that would flip the phrase', () => {
    const n = resolvePreAudibleNudge({
      phaseErrSec: 0.26,
      bpm: 120,
      silent: true,
    })
    expect(n.seekDeltaSec).toBeNull()
    expect(n.bendMultiplier).not.toBe(1)
  })

  it('marks lock inside 8ms', () => {
    const n = resolvePreAudibleNudge({
      phaseErrSec: PRE_AUDIBLE_LOCK_SEC / 2,
      bpm: 128,
      silent: true,
    })
    expect(n.locked).toBe(true)
    expect(n.bendMultiplier).toBe(1)
  })

  it('bends harder than ±1.8% while silent when seek is skipped', () => {
    const n = resolvePreAudibleNudge({
      phaseErrSec: 0.26,
      bpm: 120,
      silent: true,
    })
    expect(n.seekDeltaSec).toBeNull()
    expect(Math.abs(n.bendMultiplier - 1)).toBeGreaterThan(0.018)
    expect(n.bendMultiplier).toBeGreaterThanOrEqual(1 - SILENT_VINYL_BEND_MAX)
  })

  it('keeps the small audible seek window when not silent', () => {
    const n = resolvePreAudibleNudge({
      phaseErrSec: 0.04,
      bpm: 128,
      silent: false,
    })
    expect(n.seekDeltaSec).toBeCloseTo(0.04, 3)
    const tiny = resolvePreAudibleNudge({
      phaseErrSec: 0.015,
      bpm: 128,
      silent: false,
    })
    expect(tiny.seekDeltaSec).toBeNull()
  })
})
