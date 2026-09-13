import { describe, expect, it } from 'vitest'
import {
  ensureMeasuredOnDna,
  normalizeAgentDnaToMeasured,
} from '@/lib/audio/normalize-agent-to-measured'
import { hasGrooveCore, assessSonicDnaPipeline } from '@/lib/audio/sonic-dna-pipeline'
import { ensureSonicDnaReportSectionsFilled, listSonicDnaReportSections } from '@/lib/audio/sonic-dna-report-sections'

describe('normalizeAgentDnaToMeasured', () => {
  it('maps agent technical + drums into measured groove core', () => {
    const agent = {
      technical: { bpm: 124, timingFeel: 'full-time', energyLevel: 7 },
      drums: {
        signatureMatch: { name: 'four-on-the-floor' },
        kickAnalysis: { positions: [0, 4, 8, 12] },
        snareAnalysis: { positions: [4, 12] },
      },
      harmony: { keySignature: 'A minor' },
      genres: { primaryGenres: ['Funky House'] },
    }
    const measured = normalizeAgentDnaToMeasured(agent)
    expect(measured?.bpm).toBe(124)
    expect(Number(measured?.bpmConfidence)).toBeGreaterThanOrEqual(0.4)
    expect(measured?.drumFamily).toMatch(/four/i)
    expect(measured?.kickSteps?.length).toBeGreaterThan(0)
    expect(hasGrooveCore(measured)).toBe(true)
  })

  it('defaults kick/snare grid from drum family when positions missing', () => {
    const agent = {
      technical: { bpm: 128 },
      drums: { patternType: 'four on the floor' },
    }
    const measured = normalizeAgentDnaToMeasured(agent)
    expect(hasGrooveCore(measured)).toBe(true)
    expect(measured?.kickSteps).toEqual([0, 4, 8, 12])
  })

  it('unlocks encyclopedia fill + compose from agent-only DNA', () => {
    const agent = {
      technical: { bpm: 122, effectiveBpm: 122 },
      drums: {
        signatureMatch: { name: 'four-on-the-floor' },
        kickAnalysis: { positions: [0, 4, 8, 12] },
        snareAnalysis: { positions: [4, 12] },
      },
      harmony: { keySignature: 'F minor' },
    }
    const dna = ensureMeasuredOnDna(agent)
    const assessment = assessSonicDnaPipeline(dna)
    expect(assessment.hasGrooveCore).toBe(true)
    expect(assessment.canFillEncyclopedia).toBe(true)

    const filled = ensureSonicDnaReportSectionsFilled(dna)
    const sections = listSonicDnaReportSections(filled)
    const description = sections.find((s) => s.id === 'description')?.text || ''
    expect(description).not.toMatch(/Awaiting audio analysis/i)
    expect(description.length).toBeGreaterThan(20)
  })

  it('recomposes over poisoned awaiting stubs when BPM + drum family exist', () => {
    const awaiting =
      'Awaiting audio analysis. Encyclopedia sections stay empty until BPM and drum grid are measured from the file.'
    const dna = {
      measured: {
        bpm: 76,
        bpmConfidence: 0.8,
        timingFeel: 'half-time',
        drumFamily: 'boom-bap',
        key: 'A# minor',
        keyConfidence: 0.6,
        bass: { lock: 'synth-bass' },
        genre: {
          primary: 'Reggae',
          subgenre: 'Dub Reggae',
          source: 'user-preferred',
          judgment:
            'Catalog preference is Reggae / Dub Reggae (no audio groove class yet — confirm with DSP when available).',
        },
        intelligence: {
          description: awaiting,
          intention: awaiting,
          listeningBenefits: awaiting,
          usageText: awaiting,
        },
        report: {
          layers: {
            dsp: awaiting,
            historical: awaiting,
            cultural: awaiting,
            psychological: awaiting,
            psychoacoustics: awaiting,
            musicological: awaiting,
            benefits: awaiting,
          },
        },
      },
    }
    const filled = ensureSonicDnaReportSectionsFilled(dna)
    const sections = listSonicDnaReportSections(filled)
    for (const id of ['description', 'benefits', 'intention', 'dsp', 'history', 'culture', 'psychology']) {
      const text = sections.find((s) => s.id === id)?.text || ''
      expect(text, id).not.toMatch(/Awaiting audio analysis/i)
      expect(text.length, id).toBeGreaterThan(10)
    }
  })

  it('unlocks rewrite after audio when BPM + drums exist without audioPrimary', () => {
    const dna = ensureMeasuredOnDna({
      measured: {
        bpm: 124,
        bpmConfidence: 0.82,
        drumFamily: 'four-on-the-floor',
        kickSteps: [0, 4, 8, 12],
        snareSteps: [4, 12],
        genre: { primary: 'Funky House', source: 'user-preferred' },
      },
    })
    const assessment = assessSonicDnaPipeline(dna)
    expect(assessment.hasGrooveCore).toBe(true)
    expect(String(assessment.measured?.genre?.audioPrimary || '')).not.toBe('')
    expect(assessment.canFillEncyclopedia).toBe(true)
  })
})
