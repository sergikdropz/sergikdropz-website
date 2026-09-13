import { describe, expect, it } from 'vitest'
import {
  assessSonicDnaPipeline,
  buildAwaitAudioChallengeAnswer,
  hasGrooveCore,
  isSonicDnaReadyForDisplay,
  stripUnsupportedEncyclopedia,
} from '@/lib/audio/sonic-dna-pipeline'
import { ensureSonicDnaReportSectionsFilled, listSonicDnaReportSections } from '@/lib/audio/sonic-dna-report-sections'

describe('sonic-dna-pipeline', () => {
  it('blocks challenge and encyclopedia when preference-only with no DSP', () => {
    const dna = {
      measured: {
        genre: {
          primary: 'Reggae',
          subgenre: 'Dub Reggae',
          source: 'user-preferred',
          confidence: 0.55,
        },
      },
    }
    const assessment = assessSonicDnaPipeline(dna)
    expect(assessment.stage).toBe('await_audio')
    expect(assessment.nextAction).toBe('run_audio')
    expect(assessment.canFillEncyclopedia).toBe(false)
    expect(assessment.canRunAccuracyChallenge).toBe(false)
    expect(assessment.preferenceOnly).toBe(true)
    expect(hasGrooveCore(assessment.measured)).toBe(false)

    const gated = buildAwaitAudioChallengeAnswer(assessment)
    expect(gated.nextAction).toBe('run_audio')
    expect(gated.patches).toEqual([])
    expect(gated.answer).toMatch(/pipeline gate/i)
    expect(gated.answer).toMatch(/Re-run audio/i)

    const stripped = stripUnsupportedEncyclopedia(dna)
    expect(String(stripped.description)).toMatch(/Awaiting audio analysis/i)
    const sections = listSonicDnaReportSections(ensureSonicDnaReportSectionsFilled(dna))
    expect(sections.find((s) => s.id === 'description')?.text).toMatch(/Awaiting audio analysis/i)
    expect(sections.find((s) => s.id === 'psychology')?.text).toMatch(/Awaiting audio analysis/i)
  })

  it('advances to fill/challenge once BPM + drums exist', () => {
    const dna = {
      measured: {
        bpm: 123,
        bpmConfidence: 0.8,
        drumFamily: 'four-on-the-floor',
        kickSteps: [0, 4, 8, 12],
        snareSteps: [4, 12],
        key: 'G minor',
        keyConfidence: 0.7,
        genre: {
          primary: 'Funky House',
          subgenre: 'Deep n Funky',
          source: 'hybrid',
          audioPrimary: 'Funky House',
        },
        intelligence: {
          description: 'Full encyclopedia description from measured groove.',
        },
        report: {
          layers: { dsp: 'Four-on-the-floor at 123 BPM.' },
        },
      },
    }
    const assessment = assessSonicDnaPipeline(dna)
    expect(assessment.hasGrooveCore).toBe(true)
    expect(assessment.canFillEncyclopedia).toBe(true)
    expect(assessment.canRunAccuracyChallenge).toBe(true)
    expect(assessment.nextAction).not.toBe('run_audio')
    expect(['fill', 'challenge', 'publish', 'blend']).toContain(assessment.stage)
  })

  it('isSonicDnaReadyForDisplay rejects catalog status stubs and placeholder gates', () => {
    expect(
      isSonicDnaReadyForDisplay({
        status: 'completed',
        hasData: true,
        analyzedAt: '2026-01-14T12:56:51.999+00:00',
      }),
    ).toBe(false)

    const stripped = stripUnsupportedEncyclopedia({
      technical: { bpm: 125 },
      genres: { primaryGenres: ['Funky House'] },
    })
    expect(isSonicDnaReadyForDisplay(stripped)).toBe(false)
  })

  it('isSonicDnaReadyForDisplay accepts measured groove core', () => {
    expect(
      isSonicDnaReadyForDisplay({
        measured: {
          bpm: 123,
          drumFamily: 'breakbeat',
        },
      }),
    ).toBe(true)
  })
})
