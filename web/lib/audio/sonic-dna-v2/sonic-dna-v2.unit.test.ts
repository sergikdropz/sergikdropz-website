import { describe, expect, it } from 'vitest'
import {
  assessAudioHealth,
  buildCreativeInsights,
  buildEvidenceLedger,
  buildPocketFingerprint,
  buildPublishChecklist,
  buildWaveformEnvelope,
  computeWaveformStats,
  diffSonicDna,
  enrichSonicDnaV2,
  pocketSimilarity,
  stageProgress,
  SONIC_DNA_RECIPE_ID,
} from '@/lib/audio/sonic-dna-v2'

describe('sonic-dna-v2 recipe', () => {
  it('exposes staged progress independent of DSP gates', () => {
    expect(stageProgress('waveform').percent).toBe(16)
    expect(stageProgress('measure').percent).toBe(38)
    expect(stageProgress('classify').percent).toBe(56)
    expect(stageProgress('done').percent).toBe(100)
    expect(stageProgress('waveform').recipeId).toBe(SONIC_DNA_RECIPE_ID)
  })
})

describe('waveform-stage', () => {
  it('computes crest and drop from peaks', () => {
    const peaks = Array.from({ length: 100 }, (_, i) => (i < 20 ? 0.05 : 0.6))
    const stats = computeWaveformStats(peaks)
    expect(stats.crest).toBeGreaterThan(1)
    expect(stats.dropBin).toBeGreaterThan(10)
    const env = buildWaveformEnvelope(peaks)
    expect(env.samples).toBe(100)
    expect(env.stats.dynamicsLabel).toBeTruthy()
  })
})

describe('pocket-fingerprint', () => {
  it('scores similar grooves higher', () => {
    const a = buildPocketFingerprint({
      bpm: 124,
      drumFamily: 'four-on-the-floor',
      timingFeel: 'full-time',
      bassLock: 'offbeat',
      swing: 0.1,
      kickSteps: [0, 4, 8, 12],
      snareSteps: [4, 12],
      hatSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    })
    const b = buildPocketFingerprint({
      bpm: 126,
      drumFamily: 'four-on-the-floor',
      timingFeel: 'full-time',
      bassLock: 'offbeat',
      swing: 0.12,
      kickSteps: [0, 4, 8, 12],
      snareSteps: [4, 12],
      hatSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    })
    const c = buildPocketFingerprint({
      bpm: 174,
      drumFamily: 'breakbeat',
      timingFeel: 'half-time',
      bassLock: 'sparse-808',
      swing: 0,
      kickSteps: [0],
      snareSteps: [8],
      hatSteps: [],
    })
    expect(a).not.toBeNull()
    expect(pocketSimilarity(a, b)).toBeGreaterThan(pocketSimilarity(a, c))
  })
})

describe('creative-insights + health', () => {
  it('builds floor hypothesis and rejects silent audio', () => {
    const insights = buildCreativeInsights({
      measured: { bpm: 124, drumFamily: 'four-on-the-floor' },
      waveformStats: computeWaveformStats(Array.from({ length: 80 }, () => 0.4)),
      energy: 4,
    })
    expect(insights.floor.label).toMatch(/warehouse|warm-up/)
    expect(insights.segments.mixInBars).toBeGreaterThan(0)

    const bad = assessAudioHealth({ peaks: [0, 0, 0, 0], durationSec: 2 })
    expect(bad.ok).toBe(false)
  })
})

describe('evidence + enrich + diff', () => {
  it('stamps recipe and diffs measured fields', () => {
    const before = {
      measured: { bpm: 120, bpmConfidence: 0.8, drumFamily: 'four-on-the-floor', kickSteps: [0], snareSteps: [4] },
    }
    const after = enrichSonicDnaV2(
      {
        measured: {
          bpm: 124,
          bpmConfidence: 0.85,
          drumFamily: 'four-on-the-floor',
          kickSteps: [0, 4, 8, 12],
          snareSteps: [4, 12],
          key: 'A minor',
          keyConfidence: 0.7,
          genre: { primary: 'Funky House', source: 'audio-measured' },
        },
      },
      {
        waveformStats: computeWaveformStats(Array.from({ length: 50 }, () => 0.3)),
        hasWaveform: true,
        previousDna: before,
        runCompose: true,
      },
    )
    expect(after.recipeId).toBe(SONIC_DNA_RECIPE_ID)
    expect((after.pipelineV2 as any)?.pocket?.bpmBucket).toBe(124)
    expect((after.pipelineV2 as any)?.lastDiff?.lines?.length).toBeGreaterThan(0)

    const ledger = buildEvidenceLedger(
      [{ id: 'groove', text: 'BPM: 124 · Drums: four-on-the-floor' }],
      { hasGrooveCore: true, measuredFields: ['BPM', 'Drums'] },
    )
    expect(ledger.claims[0].confidence).toBe('green')

    const checklist = buildPublishChecklist(after, { hasWaveform: true })
    expect(checklist.items.some((i) => i.id === 'groove')).toBe(true)

    const diff = diffSonicDna(before, after)
    expect(diff.narrative).toContain('bpm')
  })
})
