import { describe, expect, it } from 'vitest'
import {
  composeDetailedTrackDescription,
  composeListeningBenefits,
  composeUsageLines,
  hasUnifiedSonicDnaIntelligence,
} from '@/lib/audio/compose-unified-sonic-dna'
import { ensureSonicDnaReportSectionsFilled, listSonicDnaReportSections } from '@/lib/audio/sonic-dna-report-sections'

const sampleDna = {
  measured: {
    bpm: 123,
    bpmConfidence: 0.8,
    timingFeel: 'full-time',
    drumFamily: 'four-on-the-floor',
    kickSteps: [0, 4, 8, 12],
    snareSteps: [4, 12],
    key: 'G minor',
    camelot: '6A',
    keyConfidence: 0.7,
    percussion: {
      kickRole: 'a steady four-on-the-floor pulse',
      snareRole: 'a 2-and-4 backbeat',
      hatGrid: 'offbeat',
    },
    bass: { lock: 'on-kick', rootNote: 'G' },
    arrangement: {
      lines: [
        'Kick is used as a steady four-on-the-floor pulse.',
        'Snare/clap is used as a 2-and-4 backbeat.',
        'Hats are used as offbeat.',
      ],
    },
    genre: {
      primary: 'Funky House',
      subgenre: 'Deep n Funky',
      source: 'hybrid',
      audioPrimary: 'Funky House',
      judgment: 'Hybrid judgment: catalog preference aligns with audio-measured groove.',
    },
    intelligence: {
      intention: 'Floor warmer with deep pocket.',
      historical: { historicalContext: 'House lineage from Chicago disco-house floors.' },
      cultural: { description: 'Club culture that privileges continuous dance.' },
      emotional: {
        primaryEmotions: ['joy', 'release'],
        psychologicalProfile: 'Encourages sustained movement and social coupling.',
      },
      psychoacoustics: {
        socialUsage: 'Dance-floor coupling.',
        sonicIntent: 'Keep bodies locked to the kick.',
        activationFormula: '4/4 kick + offbeat hats + on-kick bass.',
        listenerEffects: 'Raises dance affordance and reduces decision fatigue on the floor.',
      },
      musicology: { description: 'Minor-key house harmony with funk bass vocabulary.' },
      relatedGenres: ['Disco', 'Chicago House', 'Boogie'],
    },
  },
}

describe('compose-unified-sonic-dna', () => {
  it('builds usage lines, detailed description, and listening benefits', () => {
    const usage = composeUsageLines(sampleDna)
    expect(usage[0]).toMatch(/Kick is used/)
    const description = composeDetailedTrackDescription(sampleDna)
    expect(description).toMatch(/Funky House/)
    expect(description).toMatch(/123 BPM/)
    expect(description).toMatch(/History and science/)
    expect(description).toMatch(/Psychoacoustics/)
    const benefits = composeListeningBenefits(sampleDna)
    expect(benefits).toMatch(/Listening benefit/i)
    expect(benefits).toMatch(/Four-on-the-floor/i)
    expect(benefits).toMatch(/Emotional palette/i)
  })

  it('detects compiled unified intelligence cards', () => {
    expect(hasUnifiedSonicDnaIntelligence(sampleDna)).toBe(false)
    expect(
      hasUnifiedSonicDnaIntelligence({
        measured: {
          bpm: 123,
          drumFamily: 'breakbeat',
          intelligence: {
            method: 'measured-groove + world-genre encyclopedia + psychoacoustics study',
            description: 'x'.repeat(420),
            historical: { historicalContext: 'y'.repeat(300) },
            psychoacoustics: { report: 'z'.repeat(300) },
          },
        },
      }),
    ).toBe(true)
  })

  it('fills every admin report section for a unified knowledge card', () => {
    const filled = ensureSonicDnaReportSectionsFilled({
      measured: {
        bpm: 123,
        bpmConfidence: 0.8,
        drumFamily: 'four-on-the-floor',
        kickSteps: [0],
        snareSteps: [4],
        key: 'G minor',
        keyConfidence: 0.7,
        genre: { primary: 'Funky House', subgenre: 'Deep n Funky', source: 'audio-measured' },
        percussion: { kickRole: 'four-on-floor', snareRole: '2-and-4', hatGrid: 'offbeat' },
      },
    })
    const sections = listSonicDnaReportSections(filled)
    const ids = sections.map((section) => section.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'groove',
        'usage',
        'description',
        'benefits',
        'intention',
        'dsp',
        'related',
        'history',
        'culture',
        'psychology',
        'psychoacoustics',
        'musicology',
      ]),
    )
    for (const section of sections) {
      expect(String(section.text || '').length, section.id).toBeGreaterThan(8)
    }
    expect(sections.find((section) => section.id === 'description')?.text).toMatch(/Funky House/)
    expect(sections.find((section) => section.id === 'benefits')?.text).toMatch(/Listening benefit/i)
  })
})
