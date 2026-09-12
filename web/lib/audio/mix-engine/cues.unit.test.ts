import { describe, expect, it } from 'vitest'
import { listDeckJumpCues, resolveHotCueTime } from './cues'

describe('resolveHotCueTime', () => {
  it('prefers a labeled player-bank slot', () => {
    const t = resolveHotCueTime(
      { hotCues: [1, 2, 3, 4] },
      [
        { timeSec: 8, label: 'Hot 1' },
        { timeSec: 24, label: 'Hot 2' },
      ],
      2,
    )
    expect(t).toBe(24)
  })

  it('falls back to DNA index when the bank is empty', () => {
    expect(resolveHotCueTime({ hotCues: [3.5, 11, 19] }, null, 3)).toBe(19)
  })
})

describe('listDeckJumpCues', () => {
  it('lists grid origin and labeled DNA roles', () => {
    expect(
      listDeckJumpCues({
        beatGridOffsetSec: 0.08,
        sonicDna: {
          hotCues: [
            { timeSec: 16, label: 'mix-in' },
            { timeSec: 64, label: 'drop' },
            { timeSec: 180, label: 'mix-out' },
          ],
        },
      }),
    ).toEqual([
      { id: 'first-downbeat', label: 'First downbeat', timeSec: 0.08 },
      { id: 'mix-in', label: 'Mix-in', timeSec: 16 },
      { id: 'drop', label: 'Drop', timeSec: 64 },
      { id: 'mix-out', label: 'Mix-out', timeSec: 180 },
    ])
  })

  it('omits missing analysis cues', () => {
    expect(listDeckJumpCues({})).toEqual([])
  })
})
