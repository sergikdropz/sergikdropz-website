import { describe, expect, it } from 'vitest'
import {
  hasIntelligenceEncyclopediaCard,
  intelligenceCardSourceLabel,
  prepareSonicDnaFromIntelligence,
} from '@/lib/audio/sonic-dna-intelligence-load'

describe('sonic-dna-intelligence-load', () => {
  const sampleDna = {
    measured: {
      bpm: 123,
      drumFamily: 'breakbeat',
      key: 'C minor',
      intelligence: {
        description: 'x'.repeat(420),
        method: 'measured-groove + world-genre encyclopedia + psychoacoustics study',
        historical: { historicalContext: 'y'.repeat(300) },
        psychoacoustics: { report: 'z'.repeat(300) },
      },
      report: {
        layers: {
          historical: 'y'.repeat(300),
          psychoacoustics: 'z'.repeat(300),
        },
      },
    },
    description: 'x'.repeat(420),
    genres: { primaryGenres: ['Experimental Bass'] },
  }

  it('detects intelligence + encyclopedia cards', () => {
    expect(hasIntelligenceEncyclopediaCard(sampleDna)).toBe(true)
    expect(prepareSonicDnaFromIntelligence(sampleDna)).toBeTruthy()
    expect(intelligenceCardSourceLabel(sampleDna)).toBe('unified-intelligence')
  })

  it('rejects groove-only stubs without encyclopedia', () => {
    expect(
      hasIntelligenceEncyclopediaCard({
        measured: { bpm: 125, drumFamily: 'four-on-the-floor' },
      }),
    ).toBe(false)
  })
})
