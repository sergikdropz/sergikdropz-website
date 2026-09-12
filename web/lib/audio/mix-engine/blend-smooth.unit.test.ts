import { describe, expect, it } from 'vitest'
import {
  bassOpenU,
  complementaryMidDb,
  echoSendAtProgress,
  filterSettleTowardOpen,
  handoffSettleMs,
  preferLongSmoothOverlap,
  smoothIncomingDelay,
  BASS_INCOMING_KNEE,
} from './blend-smooth'

describe('blend-smooth', () => {
  it('sets Smooth incoming delay from vocal / bass weight', () => {
    expect(smoothIncomingDelay({})).toBe(0.04)
    expect(smoothIncomingDelay({ vocalWeight: 0.3 })).toBe(0.06)
    expect(smoothIncomingDelay({ incomingBass: 0.4 })).toBe(0.06)
    expect(smoothIncomingDelay({ vocalWeight: 0.5 })).toBe(0.08)
  })

  it('holds incoming bass until the mid-blend knee', () => {
    expect(bassOpenU(0.49)).toBe(0)
    expect(bassOpenU(BASS_INCOMING_KNEE)).toBe(0)
    expect(bassOpenU(0.7)).toBeGreaterThan(0.5)
    expect(bassOpenU(1)).toBeCloseTo(1, 5)
  })

  it('ducks complementary mids only when vocals are present', () => {
    expect(complementaryMidDb(0.5, 0.5, 0)).toEqual({ out: 0, inn: 0 })
    const mid = complementaryMidDb(0.5, 0.5, 0.4)
    expect(mid.out).toBeLessThan(-2)
    expect(mid.inn).toBeLessThan(-2)
  })

  it('prefers 16-bar overlap for ΔBPM or drop, never when quality-gated', () => {
    expect(preferLongSmoothOverlap({ bpmRelDelta: 0.05 })).toBe(true)
    expect(preferLongSmoothOverlap({ outgoingSection: 'drop' })).toBe(true)
    expect(preferLongSmoothOverlap({ bpmRelDelta: 0.02 })).toBe(false)
    expect(preferLongSmoothOverlap({ bpmRelDelta: 0.08, qualityGated: true })).toBe(false)
  })

  it('kills echo over the last beat of the mix', () => {
    const mid = echoSendAtProgress({
      echoSend: 1,
      outgoingGain: 0,
      progress: 0.5,
      mixSec: 16,
      beatSec: 0.5,
    })
    const late = echoSendAtProgress({
      echoSend: 1,
      outgoingGain: 0,
      progress: 1,
      mixSec: 16,
      beatSec: 0.5,
    })
    expect(mid).toBeCloseTo(1, 5)
    expect(late).toBeCloseTo(0, 5)
  })

  it('settles filter/EQ on one beat of master tempo', () => {
    expect(handoffSettleMs(120)).toBeCloseTo(500, 0)
    expect(handoffSettleMs(60)).toBe(800)
    expect(handoffSettleMs(200)).toBeGreaterThanOrEqual(180)
  })

  it('opens filters over the last bar', () => {
    const mid = filterSettleTowardOpen({ lpfHz: 800, hpfHz: 200, progress: 0.5 })
    const end = filterSettleTowardOpen({ lpfHz: 800, hpfHz: 200, progress: 1 })
    expect(mid.lpfHz).toBe(800)
    expect(end.lpfHz).toBeCloseTo(20000, 0)
    expect(end.hpfHz).toBeCloseTo(20, 0)
  })
})
