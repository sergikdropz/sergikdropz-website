import { describe, expect, it } from 'vitest'
import { incomingBufferMediaTime, nextSharedClockWhen } from './shared-clock'

describe('shared clock', () => {
  it('schedules a short lead on the AudioContext clock', () => {
    expect(nextSharedClockWhen({ currentTime: 1.2 }, 0.04)).toBeCloseTo(1.24, 5)
  })

  it('maps buffer start to media time', () => {
    expect(
      incomingBufferMediaTime({
        cueSec: 8,
        startCtx: 10,
        nowCtx: 12,
        rate: 1.05,
      }),
    ).toBeCloseTo(8 + 2 * 1.05, 5)
  })

  it('snapshots media time before a rate change so bend does not rewrite history', () => {
    const afterBend = incomingBufferMediaTime({
      cueSec: 8,
      startCtx: 10,
      nowCtx: 12,
      rate: 1.05,
    })
    expect(
      incomingBufferMediaTime({
        cueSec: afterBend,
        startCtx: 12,
        nowCtx: 13,
        rate: 1,
      }),
    ).toBeCloseTo(afterBend + 1, 5)
  })
})
