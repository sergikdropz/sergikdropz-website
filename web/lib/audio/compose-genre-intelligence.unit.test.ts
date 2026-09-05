import { describe, expect, it } from 'vitest'
import {
  applyGenreEncyclopedia,
  isEncyclopediaThin,
  synthesizePercussionRoles,
} from '@/lib/audio/compose-genre-intelligence'
import { ensureSonicDnaReportSectionsFilled, listSonicDnaReportSections } from '@/lib/audio/sonic-dna-report-sections'

describe('compose-genre-intelligence', () => {
  it('synthesizes boom-bap percussion roles', () => {
    const roles = synthesizePercussionRoles({
      drumFamily: 'boom-bap',
      timingFeel: 'half-time',
      bpm: 76,
    })
    expect(roles.kickRole).toBe('syncopated-or-broken-kick')
    expect(roles.snareRole).toBe('half-time-beat-3')
    expect(roles.hatGrid).toBe('sparse-accents')
  })

  it('brings thin reggae DNA to encyclopedia depth like house gold', () => {
    const thin = {
      measured: {
        bpm: 76,
        bpmConfidence: 0.85,
        timingFeel: 'half-time',
        drumFamily: 'boom-bap',
        key: 'A# minor',
        keyConfidence: 0.6,
        bass: { lock: 'synth-bass' },
        genre: {
          primary: 'Reggae',
          subgenre: 'Dub Reggae',
          source: 'user-preferred',
          judgment: 'Catalog preference is Reggae / Dub Reggae.',
        },
        intelligence: {
          description: 'Awaiting audio analysis.',
          intention: 'Awaiting audio analysis.',
        },
      },
    }
    expect(isEncyclopediaThin(thin)).toBe(true)
    const filled = ensureSonicDnaReportSectionsFilled(thin)
    expect(isEncyclopediaThin(filled)).toBe(false)

    const sections = listSonicDnaReportSections(filled)
    const history = sections.find((s) => s.id === 'history')?.text || ''
    const psycho = sections.find((s) => s.id === 'psychoacoustics')?.text || ''
    const benefits = sections.find((s) => s.id === 'benefits')?.text || ''
    const usage = sections.find((s) => s.id === 'usage')?.text || ''

    expect(history.length).toBeGreaterThan(400)
    expect(history).toMatch(/Reggae|Jamaica|ska|sound.?system|dub/i)
    expect(psycho.length).toBeGreaterThan(400)
    expect(psycho).toMatch(/Activation formula/i)
    expect(benefits.length).toBeGreaterThan(200)
    expect(usage).toMatch(/Kick is used|Snare|Hats are used|Bass is used/i)
    expect(filled.measured?.intelligence?.method).toMatch(/encyclopedia/i)
  })

  it('does not overwrite already-rich encyclopedia without force', () => {
    const rich = applyGenreEncyclopedia({
      measured: {
        bpm: 123,
        bpmConfidence: 0.9,
        timingFeel: 'full-time',
        drumFamily: 'four-on-the-floor',
        key: 'A major',
        bass: { lock: 'offbeat-syncopated' },
        percussion: {
          kickRole: 'four-on-the-floor',
          snareRole: 'backbeat-2-and-4',
          hatGrid: 'offbeat-hats',
        },
        genre: { primary: 'Funky House', subgenre: 'Deep n Funky', source: 'audio-measured' },
        instruments: [
          { label: 'Kick drum', confidence: 0.9 },
          { label: 'Sub / 808 bass', confidence: 0.8 },
        ],
      },
    })
    expect(isEncyclopediaThin(rich)).toBe(false)
    const again = applyGenreEncyclopedia(rich)
    expect(again.measured.intelligence.description).toBe(rich.measured.intelligence.description)
  })
})
