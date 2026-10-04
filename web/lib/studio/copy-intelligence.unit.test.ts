import { describe, expect, it } from 'vitest'
import {
  buildCopyFieldAdminAiPrompt,
  copyFieldContextLine,
  copyFieldEnergyPreset,
  copyFieldPrimarySkillId,
  extractCopyIntelCard,
  formatCopyAdminDeskBrief,
  formatCopyIntelligenceBrief,
} from '@/lib/studio/copy-intelligence'

const sampleDna = {
  measured: {
    bpm: 123,
    timingFeel: 'full-time',
    drumFamily: 'four-on-the-floor',
    key: 'G minor',
    genre: { primary: 'Funky House', subgenre: 'Deep n Funky' },
    intelligence: {
      intention: 'Floor warmer with deep pocket.',
      description: 'A late-night house cut that holds the floor.',
      cultural: { description: 'Club culture that privileges continuous dance.' },
      emotional: {
        primaryEmotions: ['joy', 'release'],
        psychologicalProfile: 'Encourages sustained movement and social coupling.',
      },
      psychoacoustics: {
        sonicIntent: 'Keep bodies locked to the kick.',
        socialUsage: 'Dance-floor coupling.',
      },
      musicology: { description: 'Minor-key house harmony with funk bass vocabulary.' },
      relatedGenres: ['Disco', 'Chicago House'],
    },
  },
}

describe('copy intelligence', () => {
  it('extracts a compact unified card', () => {
    const card = extractCopyIntelCard(sampleDna, 'Neon')
    expect(card.title).toBe('Neon')
    expect(card.groove).toMatch(/Funky House/)
    expect(card.intention).toMatch(/Floor warmer/)
    expect(card.culture).toMatch(/Club culture/)
    expect(card.psychoacoustics).toMatch(/kick/)
    expect(card.related).toContain('Disco')
  })

  it('drops analysis-lab descriptions from the intel card', () => {
    const card = extractCopyIntelCard(
      {
        measured: {
          intelligence: {
            description: 'Groove class A from measured usage — not from a crate name.',
            intention: 'Hold the floor.',
          },
        },
      },
      'Neon',
    )
    expect(card.description).toBe('')
    expect(card.intention).toMatch(/Hold the floor/)
  })

  it('lists every catalog title even when a cut has no intel card', () => {
    const tracks = [
      { title: 'Neon', intel: extractCopyIntelCard(sampleDna, 'Neon') },
      { title: 'Horizon' },
    ]
    const brief = formatCopyIntelligenceBrief({ field: 'youtube_visualizer', tracks })
    expect(brief).toMatch(/Neon/)
    expect(brief).toMatch(/Horizon/)
    expect(brief).toMatch(/Do not skip/)
  })

  it('scopes polymath layers to the active copy field', () => {
    const tracks = [{ title: 'Neon', intel: extractCopyIntelCard(sampleDna, 'Neon') }]
    const youtube = formatCopyIntelligenceBrief({ field: 'youtube_visualizer', tracks })
    expect(youtube).toMatch(/polymath specialists/)
    expect(youtube).toMatch(/Admin AI agents/)
    expect(youtube).toMatch(/Culture:/)
    expect(youtube).toMatch(/Psychology:/)

    const elevator = formatCopyIntelligenceBrief({ field: 'elevator_pitch', tracks })
    expect(elevator).toMatch(/Intention:/)
    expect(elevator).not.toMatch(/Psychology:/)

    const credits = formatCopyIntelligenceBrief({ field: 'credits_block', tracks })
    expect(credits).toMatch(/Catalog contributors/)
    expect(credits).not.toMatch(/Culture:/)
  })

  it('maps field context and energy to the desk', () => {
    expect(copyFieldContextLine('youtube_visualizer')).toMatch(/psychoacoustics/)
    expect(copyFieldContextLine('credits_block')).toMatch(/credits only/)
    expect(copyFieldContextLine('platform_tags')).toMatch(/Admin AI: strategy/)
    expect(copyFieldContextLine('platform_tags')).toMatch(/ops intel/)
    expect(copyFieldEnergyPreset('youtube_visualizer')).toBe('launch_day')
    expect(copyFieldEnergyPreset('elevator_pitch')).toBe('studio_week')
    expect(copyFieldPrimarySkillId('platform_tags')).toBe('product_strategy')
    expect(copyFieldPrimarySkillId('credits_block')).toBe('studio_release')
  })

  it('expands Admin AI strategy for platform tags without inventing metrics', () => {
    const desk = formatCopyAdminDeskBrief('platform_tags')
    expect(desk).toMatch(/product_strategy|strategy/)
    expect(desk).toMatch(/YouTube TAGS/)
    expect(desk).toMatch(/Never invent/)
    const prompt = buildCopyFieldAdminAiPrompt({
      field: 'platform_tags',
      releaseId: 'release-1',
      releaseTitle: 'Synthedelics',
    })
    expect(prompt.agentMode).toBe('product_strategy')
    expect(prompt.message).toMatch(/query_release_studio_snapshot/)
    expect(prompt.message).toMatch(/platform-specific tag/)
  })
})
