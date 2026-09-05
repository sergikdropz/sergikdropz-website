import { describe, expect, it } from 'vitest'
import {
  buildMixPlan,
  deriveDeckCues,
  equalPowerGains,
  styleMixGains,
  applySoftTail,
  bpmRateRatio,
  mixIncomingRateRatio,
  phaseAlignSeekDelta,
  mixPocketAlignSeekDelta,
  resolveIncomingMixCue,
  beatPhaseErrorSec,
  snapToNearestPhraseBoundary,
  filterMixEqAtProgress,
  crossfadeDeckEqAtProgress,
  energyOverlapFactor,
  parseMixCues,
  cueByRole,
  kickOnsetResidualSec,
  transientPocketNudgeSec,
  harmonicPitchSemitones,
  formatMixQuality,
  alignMixOverlayToBeatGrid,
} from './index'

const outgoing = {
  id: 'out',
  file: '/a.mp3',
  bpm: 124,
  beat_grid_offset: 0.05,
  duration: 180,
  sonic_dna: {
    segments: {
      introEndRatio: 0.08,
      outroStartRatio: 0.82,
      mixInBars: 16,
      mixOutBars: 16,
    },
  },
}

const incoming = {
  id: 'in',
  file: '/b.mp3',
  bpm: 126,
  beat_grid_offset: 0.02,
  duration: 200,
  sonic_dna: {
    segments: {
      introEndRatio: 0.1,
      outroStartRatio: 0.85,
      mixInBars: 16,
      mixOutBars: 16,
    },
  },
}

describe('equalPowerGains', () => {
  it('is all A at 0 and all B at 1', () => {
    expect(equalPowerGains(0).a).toBeCloseTo(1, 5)
    expect(equalPowerGains(0).b).toBeCloseTo(0, 5)
    expect(equalPowerGains(1).a).toBeCloseTo(0, 5)
    expect(equalPowerGains(1).b).toBeCloseTo(1, 5)
  })

  it('crosses near equal power at midpoint', () => {
    const { a, b } = equalPowerGains(0.5)
    expect(a).toBeCloseTo(Math.SQRT1_2, 5)
    expect(b).toBeCloseTo(Math.SQRT1_2, 5)
  })
})

describe('styleMixGains / soft tail', () => {
  it('crossfade ends silent on outgoing', () => {
    const end = styleMixGains('crossfade', 1)
    expect(end.a).toBeLessThan(0.02)
    expect(end.b).toBeGreaterThan(0.98)
  })

  it('Smooth crossfade has no mid-mix energy dip', () => {
    const mid = styleMixGains('crossfade', 0.5)
    const expected = equalPowerGains(0.5)
    expect(mid.a).toBeCloseTo(expected.a, 5)
    expect(mid.b).toBeCloseTo(expected.b, 5)
  })

  it('filter-eq scoops mid energy', () => {
    const mid = styleMixGains('filter-eq', 0.5)
    expect(mid.a + mid.b).toBeLessThan(1.45)
  })

  it('filter-eq keeps outgoing louder early', () => {
    const early = styleMixGains('filter-eq', 0.2)
    expect(early.a).toBeGreaterThan(early.b)
    expect(early.a).toBeGreaterThan(0.7)
  })

  it('cut holds outgoing early', () => {
    const early = styleMixGains('cut', 0.3)
    expect(early.a).toBeGreaterThan(0.85)
    expect(early.b).toBeLessThan(0.2)
  })

  it('soft tail forces outgoing toward zero', () => {
    const base = { a: 0.2, b: 0.9 }
    const tailed = applySoftTail(base, 0.99, 0.88)
    expect(tailed.a).toBeLessThan(base.a)
    expect(tailed.a).toBeLessThan(0.05)
  })
})

describe('deriveDeckCues / buildMixPlan', () => {
  it('canonical OUT is last phrase depth (ignores DNA outroStartRatio)', () => {
    const cues = deriveDeckCues(outgoing, 8)
    const bpm = 124
    const barSec = (60 / bpm) * 4
    const phraseSec = barSec * 8
    // Last ~8 bars of 180s → near end, not ~82% (~147s)
    expect(cues.mixOutSec).toBeGreaterThan(180 - phraseSec * 1.5)
    expect(cues.mixOutSec).toBeLessThan(180)
    expect(cues.mixInSec).toBeCloseTo(0.05, 2)
  })

  it('uses DNA grid phase (not absolute kick) when beat_grid_offset unset', () => {
    const track = {
      id: 't',
      file: '/t.mp3',
      bpm: 120,
      duration: 200,
      sonic_dna: {
        measured: {
          bpm: 120,
          bpmConfidence: 0.9,
          gridOffsetSec: 3.2,
          kickOnsetSec: [3.2, 3.7, 4.2, 4.7],
        },
      },
    }
    const cues = deriveDeckCues(track, 8)
    // Phase of 3.2s @ 120 BPM = 0.2s — phrase 1 stays near track start
    expect(cues.gridOffsetSec).toBeCloseTo(0.2, 5)
    expect(cues.mixInSec).toBeLessThan(1)
  })

  it('legacy segment outro when canonicalPhraseCues=false', () => {
    const cues = deriveDeckCues(outgoing, 8, 8, undefined, 'dna-intro', 'hold', false)
    expect(cues.mixOutSec).toBeGreaterThan(100)
    expect(cues.mixOutSec).toBeLessThan(160)
  })

  it('snaps mix-in and mix-out to phrase boundaries', () => {
    const bpm = 124
    const barSec = (60 / bpm) * 4
    const phraseSec = barSec * 8 // always 8-bar kick/snare align
    const offset = 0.05
    const cues = deriveDeckCues(outgoing, 8)
    const relOut = cues.mixOutSec - offset
    const relIn = cues.mixInSec - offset
    expect(relOut / phraseSec).toBeCloseTo(Math.round(relOut / phraseSec), 5)
    expect(relIn / phraseSec).toBeCloseTo(Math.round(relIn / phraseSec), 5)
  })

  it('does not rewrite Smooth when autoStyle is set', () => {
    const plan = buildMixPlan({
      outgoing: { ...outgoing, energy_level: 0.4 },
      incoming: { ...incoming, energy_level: 0.9 },
      nowSec: 10,
      phraseBars: 8,
      outPhraseBars: 8,
      overlapBars: 8,
      style: 'crossfade',
      autoStyle: true,
      canonicalPhraseCues: true,
    })
    expect(plan).not.toBeNull()
    expect(plan!.style).toBe('crossfade')
    expect(plan!.reason).not.toMatch(/DNA→/)
  })

  it('plans last-phrase OUT and first-downbeat IN; lead-in does not move OUT', () => {
    const plan = buildMixPlan({
      outgoing,
      incoming,
      nowSec: 10,
      phraseBars: 8,
      outPhraseBars: 16,
      overlapBars: 8,
      style: 'crossfade',
      leadInSec: 2.5,
      canonicalPhraseCues: true,
    })
    expect(plan).not.toBeNull()
    const bpm = 124
    const barSec = (60 / bpm) * 4
    const offset = 0.05
    const idealOut = 180 - Math.max(barSec * 16, barSec * 8)
    expect(plan!.startAtOutgoingSec).toBeGreaterThan(idealOut - barSec * 2)
    expect(plan!.incomingStartSec).toBeLessThan(barSec * 2)
    expect(plan!.prepareLeadInSec).toBeCloseTo(2.5, 5)
    expect(plan!.mixOutMarkerSec).toBeCloseTo(plan!.startAtOutgoingSec, 5)
    // Lead-in must not pull OUT earlier than ~last 16 bars
    expect(plan!.startAtOutgoingSec).toBeGreaterThan(180 - barSec * 20)

    const phraseSec = barSec * 8
    const rel = plan!.startAtOutgoingSec - offset
    expect(rel / phraseSec).toBeCloseTo(Math.round(rel / phraseSec), 5)
  })

  it('plans phrase-length overlap before track end', () => {
    const plan = buildMixPlan({
      outgoing,
      incoming,
      nowSec: 10,
      phraseBars: 8,
      style: 'crossfade',
    })
    expect(plan).not.toBeNull()
    expect(plan!.mixDurationSec).toBeGreaterThanOrEqual(1.5)
    expect(plan!.startAtOutgoingSec + plan!.mixDurationSec).toBeLessThanOrEqual(180.01)
    expect(plan!.incomingStartSec).toBeGreaterThanOrEqual(0)
    expect(plan!.rateRatio).toBeGreaterThan(0.85)
    expect(plan!.rateRatio).toBeLessThan(1.15)

    const bpm = 124
    const phraseSec = (60 / bpm) * 4 * 8
    const offset = 0.05
    const rel = plan!.startAtOutgoingSec - offset
    expect(rel / phraseSec).toBeCloseTo(Math.round(rel / phraseSec), 5)
  })

  it('maps DJ overlap to 8/16 while OUT stays on 8-bar grid', () => {
    for (const [raw, expected] of [
      [16, 16],
      [32, 16],
    ] as const) {
      const plan = buildMixPlan({
        outgoing,
        incoming,
        nowSec: 10,
        overlapBars: raw,
        outPhraseBars: 8,
      })
      expect(plan).not.toBeNull()
      expect(plan!.overlapBars).toBe(expected)
      expect(plan!.outPhraseBars).toBe(8)
      const bpm = 124
      const alignSec = (60 / bpm) * 4 * 8
      const offset = 0.05
      const rel = plan!.startAtOutgoingSec - offset
      expect(rel / alignSec).toBeCloseTo(Math.round(rel / alignSec), 5)
    }
  })

  it('honors 16/24/32 bar mix-out sections on 8-bar DNA snap grid', () => {
    for (const bars of [16, 24, 32] as const) {
      const plan = buildMixPlan({
        outgoing,
        incoming,
        nowSec: 10,
        overlapBars: 8,
        outPhraseBars: bars,
      })
      expect(plan).not.toBeNull()
      expect(plan!.outPhraseBars).toBe(bars)
      const bpm = 124
      const phraseSec = (60 / bpm) * 4 * 8
      const offset = 0.05
      const rel = plan!.startAtOutgoingSec - offset
      expect(rel / phraseSec).toBeCloseTo(Math.round(rel / phraseSec), 5)
    }
  })

  it('creative mode can disable bar-in; DJ mode always uses phrase 1', () => {
    const creative = buildMixPlan({
      outgoing,
      incoming,
      nowSec: 10,
      overlapBars: 8,
      inPhraseBars: 0,
      canonicalPhraseCues: false,
      exactOverlap: false,
    })
    expect(creative).not.toBeNull()
    expect(creative!.inPhraseBars).toBe(0)

    const dj = buildMixPlan({
      outgoing,
      incoming,
      nowSec: 10,
      overlapBars: 8,
      inPhraseBars: 0,
      canonicalPhraseCues: true,
    })
    expect(dj).not.toBeNull()
    expect(dj!.inPhraseBars).toBe(8)
    expect(dj!.outPhraseBars).toBe(8)
  })

  it('beatmatch rate includes outgoing tempo slider', () => {
    const plan = buildMixPlan({
      outgoing,
      incoming,
      nowSec: 10,
      overlapBars: 8,
      outgoingPlaybackRate: 1.05,
    })
    expect(plan).not.toBeNull()
    const baseline = buildMixPlan({
      outgoing,
      incoming,
      nowSec: 10,
      overlapBars: 8,
      outgoingPlaybackRate: 1,
    })
    expect(plan!.rateRatio).toBeGreaterThan(baseline!.rateRatio)
  })

  it('still plans when already inside outro window', () => {
    const plan = buildMixPlan({
      outgoing,
      incoming,
      nowSec: 170,
      phraseBars: 8,
    })
    expect(plan).not.toBeNull()
    expect(plan!.startAtOutgoingSec).toBeGreaterThanOrEqual(169.5)
    expect(plan!.mixDurationSec).toBeLessThanOrEqual(Math.min(48, 180 - plan!.startAtOutgoingSec) + 0.01)
  })
})

describe('snapToNearestPhraseBoundary', () => {
  it('snaps midway times to nearest 8-bar line', () => {
    const bpm = 120
    const barSec = 0.5 * 4 // 2s
    const phraseSec = barSec * 8 // 16s
    const mid = phraseSec * 2 + phraseSec * 0.4 // closer to phrase 2
    const snapped = snapToNearestPhraseBoundary({
      timeSec: mid,
      bpm,
      offsetSec: 0,
      phraseBars: 8,
    })
    expect(snapped).toBeCloseTo(phraseSec * 2, 5)
  })
})

describe('filterMixEqAtProgress', () => {
  const from = { low: 0, mid: 0, high: 0 }
  const to = { low: 2, mid: 1, high: 1.5 }

  it('opens with a low kill then lands on incoming bias', () => {
    const mid = filterMixEqAtProgress({ progress: 0.3, from, to, mode: 'filter-eq' })
    expect(mid.low).toBeLessThan(from.low - 5)
    const end = filterMixEqAtProgress({ progress: 1, from, to, mode: 'filter-eq' })
    expect(end.low).toBeCloseTo(to.low, 1)
    expect(end.mid).toBeCloseTo(to.mid, 1)
    expect(end.high).toBeCloseTo(to.high, 1)
  })

  it('cut mode punches deeper mid-window', () => {
    const punch = filterMixEqAtProgress({ progress: 0.25, from, to, mode: 'cut' })
    const filterMid = filterMixEqAtProgress({ progress: 0.25, from, to, mode: 'filter-eq' })
    expect(punch.low).toBeLessThan(filterMid.low)
  })
})

describe('sync', () => {
  it('mixIncomingRateRatio respects outgoing playbackRate', () => {
    expect(mixIncomingRateRatio({ outgoingBpm: 128, incomingBpm: 128, outgoingPlaybackRate: 1.05 })).toBeCloseTo(
      1.05,
      2
    )
    expect(mixIncomingRateRatio({ outgoingBpm: 128, incomingBpm: 128, outgoingPlaybackRate: 1 })).toBeCloseTo(1, 2)
  })

  it('prefers half/double tempo for beatmatch rate', () => {
    expect(bpmRateRatio(128, 64)).toBeCloseTo(1, 3)
    expect(bpmRateRatio(100, 200)).toBeCloseTo(1, 3)
    expect(bpmRateRatio(120, 120)).toBe(1)
  })

  it('clamps extreme unmatched tempos', () => {
    expect(bpmRateRatio(140, 90)).toBeGreaterThanOrEqual(0.88)
    expect(bpmRateRatio(140, 90)).toBeLessThanOrEqual(1.12)
  })

  it('returns finite phase align delta within one beat', () => {
    const d = phaseAlignSeekDelta({
      outgoingTimeSec: 10,
      outgoingBpm: 120,
      incomingTimeSec: 2,
      incomingBpm: 120,
      phraseBars: 8,
    })
    expect(Number.isFinite(d)).toBe(true)
    expect(Math.abs(d)).toBeLessThanOrEqual(60 / 120 + 1e-6)
  })

  it('mixPocketAlignSeekDelta blends snare grid when DNA present', () => {
    const dna = {
      measured: {
        bpm: 124,
        kickSteps: [0, 4, 8, 12],
        snareSteps: [4, 12],
        bpmConfidence: 0.8,
      },
    }
    const d = mixPocketAlignSeekDelta({
      outgoingTimeSec: 10.02,
      outgoingBpm: 124,
      outgoingSonicDna: dna,
      incomingTimeSec: 2.01,
      incomingBpm: 124,
      incomingSonicDna: dna,
      phraseBars: 8,
    })
    expect(Number.isFinite(d)).toBe(true)
    expect(Math.abs(d)).toBeLessThanOrEqual((60 / 124) + 1e-6)
  })

  it('resolveIncomingMixCue keeps pocket lock when kick snap would drift', () => {
    const dna = {
      measured: {
        bpm: 120,
        kickSteps: [0, 4, 8, 12],
        snareSteps: [4, 12],
        clapSteps: [4, 12],
        bpmConfidence: 0.9,
      },
    }
    const cue = resolveIncomingMixCue({
      plannedIncomingSec: 8.07,
      outgoingTimeSec: 32.07,
      outgoingBpm: 120,
      outgoingOffsetSec: 0.04,
      outgoingSonicDna: dna,
      incomingBpm: 120,
      incomingOffsetSec: 0.04,
      incomingSonicDna: dna,
      phraseBars: 8,
      snareLock: true,
    })
    const phase = Math.abs(
      beatPhaseErrorSec({
        outgoingTimeSec: 32.07,
        outgoingBpm: 120,
        outgoingOffsetSec: 0.04,
        incomingTimeSec: cue,
        incomingBpm: 120,
        incomingOffsetSec: 0.04,
      }),
    )
    expect(phase).toBeLessThan(0.03)
  })
})

describe('crossfadeDeckEqAtProgress', () => {
  it('swaps outgoing bass mid-overlap on Smooth', () => {
    const early = crossfadeDeckEqAtProgress({ progress: 0.15, style: 'crossfade' })
    const mid = crossfadeDeckEqAtProgress({ progress: 0.55, style: 'crossfade' })
    const end = crossfadeDeckEqAtProgress({ progress: 1, style: 'crossfade' })
    expect(mid.outgoing.low).toBeLessThan(early.outgoing.low)
    expect(mid.incoming.low).toBeGreaterThan(early.incoming.low)
    expect(end.outgoing.low).toBeCloseTo(-8, 5)
    expect(end.incoming.low).toBeCloseTo(0, 5)
    expect(mid.outgoing.mid).toBe(0)
    expect(mid.outgoing.high).toBe(0)
  })

  it('applies aggressive bass swap style', () => {
    const mid = crossfadeDeckEqAtProgress({ progress: 0.5, style: 'bass-swap' })
    expect(mid.outgoing.low).toBeLessThan(-5)
  })
})

describe('energyOverlapFactor', () => {
  it('extends overlap for energy climb', () => {
    const out = { id: 'o', file: '/o.mp3', energy_level: 0.4 }
    const inT = { id: 'i', file: '/i.mp3', energy_level: 0.7 }
    expect(energyOverlapFactor(out, inT)).toBeGreaterThan(1)
  })

  it('shortens overlap for energy drop', () => {
    const out = { id: 'o', file: '/o.mp3', energy_level: 0.8 }
    const inT = { id: 'i', file: '/i.mp3', energy_level: 0.5 }
    expect(energyOverlapFactor(out, inT)).toBeLessThan(1)
  })
})

describe('labeled cues + section mix-in', () => {
  it('parseMixCues maps mix-in / drop labels', () => {
    const cues = parseMixCues({
      hotCues: [
        { timeSec: 32, label: 'Mix In' },
        { timeSec: 64, label: 'Drop' },
      ],
    })
    expect(cueByRole(cues, 'mix-in')?.timeSec).toBe(32)
    expect(cueByRole(cues, 'drop')?.timeSec).toBe(64)
  })

  it('deriveDeckCues prefers labeled mix-in', () => {
    const track = {
      id: 't',
      file: '/t.mp3',
      bpm: 120,
      beat_grid_offset: 0,
      duration: 200,
      sonic_dna: {
        segments: { introEndRatio: 0.1, outroStartRatio: 0.8 },
        hotCues: [{ timeSec: 16.0, label: 'mix-in' }],
        measured: { bpm: 120, bpmConfidence: 0.9 },
      },
    }
    const cues = deriveDeckCues(track, 8, 8, 0, 'dna-intro', 'hold')
    // May snap to phrase; should stay near labeled cue
    expect(Math.abs(cues.mixInSec - 16)).toBeLessThan(8)
  })

  it('energyCurve build uses dropRatio for mix-in', () => {
    const track = {
      id: 't',
      file: '/t.mp3',
      bpm: 120,
      beat_grid_offset: 0,
      duration: 200,
      sonic_dna: {
        segments: { introEndRatio: 0.08, outroStartRatio: 0.85, dropRatio: 0.4 },
        measured: { bpm: 120, bpmConfidence: 0.9 },
      },
    }
    const hold = deriveDeckCues(track, 8, 8, 0, 'dna-intro', 'hold', false)
    const build = deriveDeckCues(track, 8, 8, 0, 'dna-intro', 'build', false)
    expect(build.mixInSec).toBeGreaterThan(hold.mixInSec)
  })
})

describe('confidence gate', () => {
  it('disables phrase lock when BPM confidence is low', () => {
    const low = {
      ...outgoing,
      sonic_dna: {
        ...outgoing.sonic_dna,
        measured: { bpm: 124, bpmConfidence: 0.2 },
      },
    }
    const inn = {
      ...incoming,
      sonic_dna: {
        ...incoming.sonic_dna,
        measured: { bpm: 126, bpmConfidence: 0.2 },
      },
    }
    const plan = buildMixPlan({
      outgoing: low,
      incoming: inn,
      nowSec: 140,
      outPhraseBars: 16,
      inPhraseBars: 8,
      overlapBars: 8,
    })
    expect(plan).not.toBeNull()
    expect(plan!.phraseLock).toBe(false)
    // DJ doctrine still targets phrase-1 IN; phraseLock alone gates kick/snare snap.
    expect(plan!.inPhraseBars).toBe(8)
  })
})

describe('transient + harmonic pitch', () => {
  it('kickOnsetResidualSec finds nearby peak', () => {
    const peaks = Array.from({ length: 100 }, (_, i) => (i === 50 ? 1 : 0.01))
    const residual = kickOnsetResidualSec({
      timeSec: 49.5,
      peaks,
      durationSec: 100,
      windowSec: 0.03,
    })
    // peak at index 50 → t≈50.5 for n=100 with (i/(n-1))*dur
    expect(Math.abs(residual)).toBeGreaterThan(0)
    expect(Math.abs(residual)).toBeLessThanOrEqual(0.045)
  })

  it('transientPocketNudgeSec is capped ±20ms', () => {
    const peaks = Array.from({ length: 200 }, () => 0.01)
    peaks[100] = 1
    const n = transientPocketNudgeSec({
      outgoingTimeSec: 50,
      incomingTimeSec: 50,
      outgoingPeaks: peaks,
      incomingPeaks: peaks,
      outgoingDurationSec: 100,
      incomingDurationSec: 100,
    })
    expect(Math.abs(n)).toBeLessThanOrEqual(0.02)
  })

  it('harmonicPitchSemitones only applies for key-lock near keys', () => {
    const outDna = { measured: { camelot: '8A' } }
    const inDna = { measured: { camelot: '10A' } }
    expect(harmonicPitchSemitones(outDna, inDna, 'off')).toBe(0)
    expect(harmonicPitchSemitones(outDna, inDna, 'camelot')).toBe(0)
    const st = harmonicPitchSemitones(outDna, inDna, 'key-lock')
    expect(Math.abs(st)).toBeLessThanOrEqual(2)
  })

  it('alignMixOverlayToBeatGrid puts OUT on 8-bar and IN on overlap end', () => {
    const bpm = 120
    const beat = 60 / bpm
    const bar = beat * 4
    const offset = 0.1
    const aligned = alignMixOverlayToBeatGrid({
      mixOutSec: offset + bar * 8 * 3 + 0.4,
      mixDurationSec: bar * 8,
      bpm,
      offsetSec: offset,
      overlapBars: 8,
    })
    const phraseSec = bar * 8
    const relOut = aligned.mixOutSec - offset
    const relIn = aligned.mixEndSec - offset
    expect(relOut / phraseSec).toBeCloseTo(Math.round(relOut / phraseSec), 5)
    expect(relIn / phraseSec).toBeCloseTo(Math.round(relIn / phraseSec), 5)
    expect(aligned.mixEndSec - aligned.mixOutSec).toBeCloseTo(phraseSec, 5)
  })

  it('formatMixQuality reports sync line', () => {
    expect(formatMixQuality({ phaseRmsSec: 0.012, kickResidualRmsMs: 8 })).toContain('sync')
    expect(formatMixQuality({ phaseRmsSec: 0.005, kickResidualRmsMs: 4 })).toMatch(/tight/i)
  })
})
