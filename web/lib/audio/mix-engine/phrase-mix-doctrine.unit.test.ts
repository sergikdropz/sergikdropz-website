import { describe, expect, it } from 'vitest'
import {
  clampResidualSeekSec,
  normalizeDjOverlapBars,
  pairBpmCompatible,
  phraseQuantizedProgress,
  prearmLeadSec,
  resolvePhraseMixSettings,
  shouldApplyQualityGate,
} from './phrase-mix-doctrine'
import { DEFAULT_AUTO_DJ_CONFIG } from '@/lib/audio/auto-dj-preferences'
import { buildMixPlan } from './plan-from-dna'

describe('phrase-mix-doctrine', () => {
  it('normalizes overlap to 8 or 16', () => {
    expect(normalizeDjOverlapBars(2)).toBe(8)
    expect(normalizeDjOverlapBars(4)).toBe(8)
    expect(normalizeDjOverlapBars(8)).toBe(8)
    expect(normalizeDjOverlapBars(16)).toBe(16)
    expect(normalizeDjOverlapBars(32)).toBe(16)
  })

  it('resolves DJ settings to phrase-1 IN + exact overlap', () => {
    const r = resolvePhraseMixSettings({
      ...DEFAULT_AUTO_DJ_CONFIG,
      outPhraseBars: 16,
      overlapBars: 4,
      inPhraseBars: 0,
      cuePriority: 'dna-intro',
      energyCurve: 'build',
      mixLengthBias: 'long',
    })
    expect(r.inPhraseBars).toBe(8)
    expect(r.overlapBars).toBe(8)
    expect(r.cuePriority).toBe('first-downbeat')
    expect(r.exactOverlap).toBe(true)
    expect(r.energyCurve).toBe('hold')
    expect(r.summary).toContain('IN phrase 1 @ OUT')
  })

  it('applies quality gate to force TempoSync + 8-bar blend', () => {
    const r = resolvePhraseMixSettings(
      { ...DEFAULT_AUTO_DJ_CONFIG, syncMode: 'beat-sync', overlapBars: 16 },
      { qualityGate: 'poor' },
    )
    expect(r.syncMode).toBe('tempo-sync')
    expect(r.overlapBars).toBe(8)
  })

  it('pairBpmCompatible respects ~6% window', () => {
    expect(pairBpmCompatible(128, 128)).toBe(true)
    expect(pairBpmCompatible(128, 134)).toBe(true)
    expect(pairBpmCompatible(128, 140)).toBe(false)
  })

  it('clamps residual seek to half-beat band', () => {
    // 120 BPM → half beat = 0.25s; 40ms is seekable
    expect(clampResidualSeekSec({ phaseErrSec: 0.04, bpm: 120 })).toBeCloseTo(0.04, 3)
    // Too large → skip seek
    expect(clampResidualSeekSec({ phaseErrSec: 0.2, bpm: 120 })).toBeNull()
    // Too small → skip
    expect(clampResidualSeekSec({ phaseErrSec: 0.005, bpm: 120 })).toBeNull()
  })

  it('phraseQuantizedProgress blends toward knees', () => {
    const mid = phraseQuantizedProgress(0.5, 4)
    expect(mid).toBeGreaterThan(0.4)
    expect(mid).toBeLessThan(0.6)
  })

  it('prearmLeadSec is one phrase', () => {
    expect(prearmLeadSec(120)).toBeCloseTo(16, 3) // 8 bars * 0.5s * 4 = 16s at 120
  })

  it('shouldApplyQualityGate', () => {
    expect(shouldApplyQualityGate('poor')).toBe(true)
    expect(shouldApplyQualityGate('excellent')).toBe(false)
  })

  it('buildMixPlan exact overlap matches N×8 bars', () => {
    const bpm = 120
    const bar = (60 / bpm) * 4
    const plan = buildMixPlan({
      outgoing: {
        id: 'a',
        file: 'a.mp3',
        bpm,
        duration: 180,
        beat_grid_offset: 0,
        sonic_dna: { measured: { bpm, bpmConfidence: 0.9 } },
      },
      incoming: {
        id: 'b',
        file: 'b.mp3',
        bpm,
        duration: 180,
        beat_grid_offset: 0,
        sonic_dna: { measured: { bpm, bpmConfidence: 0.9 } },
      },
      nowSec: 10,
      overlapBars: 8,
      outPhraseBars: 8,
      canonicalPhraseCues: true,
      exactOverlap: true,
      mixLengthBias: 'long',
      energyCurve: 'build',
    })
    expect(plan).not.toBeNull()
    expect(plan!.mixDurationSec).toBeCloseTo(bar * 8, 2)
    expect(plan!.incomingStartSec).toBeLessThanOrEqual(bar * 0.5)
    expect(plan!.inPhraseBars).toBe(8)
  })
})
