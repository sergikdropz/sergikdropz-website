import { describe, expect, it } from 'vitest'
import { assessBeatSyncSafety, resolveHoldBeatmatch } from './bpm-guard'

const goodDna = {
  measured: { bpm: 124, bpmConfidence: 0.85, timingFeel: 'straight' },
}

const grid = { outgoingGridOffset: 0, incomingGridOffset: 0 }

describe('assessBeatSyncSafety', () => {
  it('allows BeatSync for confident matching BPMs with grids', () => {
    const s = assessBeatSyncSafety({
      syncMode: 'beat-sync',
      outgoingSonicDna: goodDna,
      incomingSonicDna: { measured: { bpm: 126, bpmConfidence: 0.8 } },
      outgoingBpm: 124,
      incomingBpm: 126,
      ...grid,
    })
    expect(s.ok).toBe(true)
    expect(s.forceTempoSync).toBe(false)
  })

  it('forces TempoSync when grids are missing', () => {
    const s = assessBeatSyncSafety({
      syncMode: 'beat-sync',
      outgoingSonicDna: goodDna,
      incomingSonicDna: goodDna,
      outgoingBpm: 124,
      incomingBpm: 124,
    })
    expect(s.forceTempoSync).toBe(true)
    expect(s.code).toBe('grids-unlocked')
  })

  it('forces TempoSync on low confidence', () => {
    const s = assessBeatSyncSafety({
      syncMode: 'beat-sync',
      outgoingSonicDna: { measured: { bpm: 120, bpmConfidence: 0.2 } },
      incomingSonicDna: goodDna,
      outgoingBpm: 120,
      incomingBpm: 124,
      ...grid,
    })
    expect(s.forceTempoSync).toBe(true)
    expect(s.code).toBe('low-confidence')
  })

  it('forces TempoSync on half-time feel', () => {
    const s = assessBeatSyncSafety({
      syncMode: 'beat-sync',
      outgoingSonicDna: {
        measured: {
          bpm: 140,
          effectiveBpm: 70,
          timingFeel: 'half-time',
          bpmConfidence: 0.9,
        },
      },
      incomingSonicDna: goodDna,
      outgoingBpm: 140,
      incomingBpm: 124,
      ...grid,
    })
    expect(s.code).toBe('half-time-feel')
    expect(s.forceTempoSync).toBe(true)
  })

  it('forces TempoSync on half-time drum family even without effectiveBpm', () => {
    const s = assessBeatSyncSafety({
      syncMode: 'beat-sync',
      outgoingSonicDna: {
        measured: {
          bpm: 123,
          bpmConfidence: 0.9,
          drumFamily: 'half-time',
          timingFeel: 'half-time',
        },
      },
      incomingSonicDna: goodDna,
      outgoingBpm: 123,
      incomingBpm: 123,
      ...grid,
    })
    expect(s.forceTempoSync).toBe(true)
    expect(s.code).toBe('half-time-feel')
  })

  it('forces TempoSync on breakbeat / one-drop pockets', () => {
    const s = assessBeatSyncSafety({
      syncMode: 'beat-sync',
      outgoingSonicDna: goodDna,
      incomingSonicDna: {
        measured: { bpm: 124, bpmConfidence: 0.9, drumFamily: 'breakbeat' },
      },
      outgoingBpm: 124,
      incomingBpm: 124,
      ...grid,
    })
    expect(s.forceTempoSync).toBe(true)
    expect(s.code).toBe('broken-groove')
  })

  it('forces TempoSync on pair octave mismatch', () => {
    const s = assessBeatSyncSafety({
      syncMode: 'beat-sync',
      outgoingSonicDna: goodDna,
      incomingSonicDna: { measured: { bpm: 248, bpmConfidence: 0.9 } },
      outgoingBpm: 124,
      incomingBpm: 248,
      ...grid,
    })
    expect(s.code).toBe('pair-octave')
  })
})

describe('resolveHoldBeatmatch', () => {
  it('holds when BeatSync is safe', () => {
    const { holdBeatmatch } = resolveHoldBeatmatch({
      syncMode: 'beat-sync',
      outgoingSonicDna: goodDna,
      incomingSonicDna: goodDna,
      outgoingBpm: 124,
      incomingBpm: 124,
      ...grid,
    })
    expect(holdBeatmatch).toBe(true)
  })

  it('never holds in tempo-sync mode', () => {
    const { holdBeatmatch } = resolveHoldBeatmatch({
      syncMode: 'tempo-sync',
      outgoingSonicDna: goodDna,
      incomingSonicDna: goodDna,
      outgoingBpm: 124,
      incomingBpm: 124,
      ...grid,
    })
    expect(holdBeatmatch).toBe(false)
  })
})
