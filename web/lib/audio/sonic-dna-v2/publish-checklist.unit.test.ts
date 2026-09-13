import { describe, expect, it } from 'vitest'
import { descriptionQuotesMeasuredGrid, buildPublishChecklist } from '@/lib/audio/sonic-dna-v2/publish-checklist'

describe('publish-checklist grounding', () => {
  it('accepts natural “129 BPM” wording without BPM: label', () => {
    const measured = {
      bpm: 129,
      drumFamily: 'four-on-the-floor',
      key: 'A minor',
    }
    expect(
      descriptionQuotesMeasuredGrid(
        'A Tech House cut at 129 BPM with four-on-the-floor drums and offbeat hats for the floor.',
        measured as any,
      ),
    ).toBe(true)
  })

  it('marks description checklist ok when description quotes BPM', () => {
    const checklist = buildPublishChecklist({
      description:
        'Measured: 129 BPM · four-on-the-floor drums. A groovy Tech House pocket with offbeat hats and syncopated bass.',
      measured: {
        bpm: 129,
        drumFamily: 'four-on-the-floor',
        key: 'A minor',
        keyConfidence: 0.9,
        bpmConfidence: 0.9,
        genre: { primary: 'Tech House', audioPrimary: 'Tech House', source: 'audio-measured' },
      },
      listeningBenefits: 'Good for sustained dancefloor movement and social coupling on a predictable grid.',
    })
    const desc = checklist.items.find((i) => i.id === 'description')
    expect(desc?.ok).toBe(true)
  })
})
