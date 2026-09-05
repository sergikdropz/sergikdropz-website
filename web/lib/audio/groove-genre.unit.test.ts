import { describe, expect, it } from 'vitest'
import { classifyGroove } from '@/lib/audio/groove-genre'
import { composeSonicDnaAudit } from '@/lib/audio/sonic-dna-report'
import { sonicDnaStatusFromMeasured, sonicDnaCompletenessPercent } from '@/lib/audio/sonic-dna-quality'

describe('classifyGroove', () => {
  it('labels house-tempo 4/4 with offbeat bass as funky house, not trap', () => {
    const result = classifyGroove({
      bpm: 122,
      drumFamily: 'four-on-the-floor',
      bass: { lock: 'offbeat-syncopated' },
      timingFeel: 'full-time',
      percussion: { hatGrid: 'offbeat-hats', kickRole: 'four-on-the-floor', snareRole: 'backbeat-2-and-4' },
      swingPercent: 24,
    })
    expect(result.family).toBe('House')
    expect(result.primary).toBe('Funky House')
    expect(result.reason.some((line) => line.includes('drums'))).toBe(true)
  })

  it('does not call doubled dub trance when snare is used half-time with sub', () => {
    const result = classifyGroove({
      bpm: 152,
      drumFamily: 'four-on-the-floor',
      bass: { lock: 'offbeat-syncopated' },
      percussion: { snareRole: 'half-time-beat-3', hatGrid: 'eighths', kickRole: 'four-on-the-floor' },
      instruments: [{ id: 'bass', label: 'Sub / 808 bass', confidence: 0.8 }],
      spectral: { relative: { sub: 0.22, bass: 0.2 } },
      snareSteps: [8, 12],
    })
    expect(result.primary).toBe('Reggae')
  })

  it('labels broken 808 drums as experimental bass, not hip-hop', () => {
    const result = classifyGroove({
      bpm: 123,
      drumFamily: 'breakbeat',
      bass: { lock: 'offbeat-syncopated' },
      percussion: { kickRole: 'syncopated-or-broken-kick', hatGrid: 'sparse-accents', snareRole: 'broken-snare' },
      instruments: [{ id: 'bass', label: 'Sub / 808 bass', confidence: 0.8 }],
      spectral: { relative: { sub: 0.2, bass: 0.22 } },
    })
    expect(result.primary).toBe('Experimental Bass')
  })

  it('labels half-time snare plus sparse 808 as trap', () => {
    const result = classifyGroove({
      bpm: 140,
      drumFamily: 'half-time',
      bass: { lock: 'sparse-808' },
      timingFeel: 'half-time',
    })
    expect(result.primary).toBe('Trap')
    expect(result.effectiveBpm).toBe(70)
  })

  it('labels hip-hop/trap kick-snare with house-like hats as hip-hop, not house', () => {
    const result = classifyGroove({
      bpm: 123,
      drumFamily: 'half-time',
      bass: { lock: 'offbeat-syncopated' },
      timingFeel: 'half-time',
      percussion: { hatGrid: 'eighths', kickRole: 'syncopated-or-broken-kick', snareRole: 'half-time-beat-3' },
      spectral: { relative: { sub: 0.3, bass: 0.22 } },
      snareSteps: [0, 6, 7, 8, 10, 12],
    })
    expect(result.family).toBe('Hip-Hop')
    expect(result.primary).toBe('Hip-Hop')
    expect(result.subgenre).toBe('Trap')
    expect(result.primary).not.toBe('Funky House')
    expect(result.primary).not.toBe('Tech House')
  })

  it('does not pick a parent genre when drums and tempo are missing', () => {
    const result = classifyGroove({ drumFamily: 'unknown', bpm: null })
    expect(result.primary).toBe('Unclassified')
    expect(result.confidence).toBeLessThan(0.2)
  })
})

describe('composeSonicDnaAudit', () => {
  it('uses drum, tempo, bass, and instruments without titles', () => {
    const { description } = composeSonicDnaAudit({
      bpm: 122,
      timingFeel: 'full-time',
      drumFamily: 'four-on-the-floor',
      percussion: { kickRole: 'four-on-the-floor', snareRole: 'backbeat-2-and-4', hatGrid: 'offbeat-hats' },
      bass: { lock: 'offbeat-syncopated', rootNote: 'A' },
      key: 'A minor',
      camelot: '8A',
      genre: { primary: 'Funky House', subgenre: 'Deep n Funky', confidence: 0.8 },
      instruments: [{ id: 'kick-drum', label: 'Kick drum', confidence: 0.8 }],
      arrangement: {
        lines: ['Hats are used on the offbeat — disco/house ride, not a reggae one-drop skip.'],
      },
    })
    expect(description).toContain('122 BPM')
    expect(description).toContain('Funky House')
    expect(description).toContain('Kick drum')
    expect(description).toContain('offbeat')
    expect(description.toLowerCase()).not.toContain('going gone')
  })

  it('prefers encyclopedia intelligence over dsp-only facts when present', () => {
    const { description } = composeSonicDnaAudit({
      bpm: 122,
      drumFamily: 'four-on-the-floor',
      genre: { primary: 'Funky House' },
      intelligence: {
        description: 'House is disco afterlife. Kick used as 4/4. Related: Chicago House, Disco.',
      },
    })
    expect(description).toContain('disco afterlife')
    expect(description).toContain('Chicago House')
  })
})

describe('sonicDnaStatusFromMeasured', () => {
  it('stays partial without a drum grid', () => {
    expect(
      sonicDnaStatusFromMeasured({
        bpm: 122,
        bpmConfidence: 0.9,
        key: 'D major',
        keyConfidence: 0.7,
        drumFamily: 'unknown',
        kickSteps: [],
      }),
    ).toBe('partial')
  })

  it('is completed when bpm, drums, and key are measured', () => {
    expect(
      sonicDnaStatusFromMeasured({
        bpm: 122,
        bpmConfidence: 0.9,
        drumFamily: 'four-on-the-floor',
        kickSteps: [0, 4, 8, 12],
        snareSteps: [4, 12],
        key: 'D major',
        keyConfidence: 0.6,
      }),
    ).toBe('completed')
  })
})

describe('sonicDnaCompletenessPercent', () => {
  it('maps pending and processing to staged percents', () => {
    expect(sonicDnaCompletenessPercent('pending')).toBe(0)
    expect(sonicDnaCompletenessPercent('processing')).toBe(45)
    expect(sonicDnaCompletenessPercent('failed')).toBe(0)
    expect(sonicDnaCompletenessPercent('completed')).toBe(0)
  })

  it('is 100 when completed with measured bpm, drums, and key', () => {
    expect(
      sonicDnaCompletenessPercent('completed', {
        measured: {
          bpm: 122,
          bpmConfidence: 0.9,
          drumFamily: 'four-on-the-floor',
          kickSteps: [0, 4, 8, 12],
          key: 'D major',
          keyConfidence: 0.6,
        },
      }),
    ).toBe(100)
  })

  it('reads measured from JSON strings and prefers DSP groove over empty secondary', async () => {
    const { extractMeasured, mergePreferredSonicDna } = await import('@/lib/audio/sonic-dna-quality')
    const measured = {
      bpm: 122,
      bpmConfidence: 0.9,
      drumFamily: 'four-on-the-floor',
      kickSteps: [0, 4, 8, 12],
      key: 'A minor',
      keyConfidence: 0.5,
    }
    expect(extractMeasured(JSON.stringify({ measured }))?.bpm).toBe(122)
    const merged = mergePreferredSonicDna({ measured }, { genres: { primaryGenres: ['Trap'] } })
    expect(merged?.measured?.drumFamily).toBe('four-on-the-floor')
  })
})

describe('sonic dna report sections', () => {
  it('round-trips culture text into measured layers', async () => {
    const { applySonicDnaSectionText, listSonicDnaReportSections, localSonicDnaAccuracyWarnings, getSonicDnaReportView } = await import(
      '@/lib/audio/sonic-dna-report-sections'
    )
    const next = applySonicDnaSectionText({}, 'culture', 'Offbeat hats at house tempo, not a reggae crate.')
    const culture = listSonicDnaReportSections(next).find((section) => section.id === 'culture')
    expect(culture?.text).toContain('Offbeat hats')
    expect(next.measured.report.layers.cultural).toContain('house tempo')
    expect(localSonicDnaAccuracyWarnings({ measured: { bpm: 122, genre: { primary: 'Reggae' } } }).some((w) => w.includes('reggae'))).toBe(true)

    const view = getSonicDnaReportView({
      measured: {
        bpm: 123,
        intelligence: {
          description: 'Full encyclopedia description.',
          regional: { regionalCharacteristics: 'House floors were sanctuary spaces.' },
        },
      },
    })
    expect(view.encyclopedia).toBe(true)
    expect(view.byId.culture.text).toContain('sanctuary')
    expect(view.byId.description.text).toContain('encyclopedia')
  })

  it('backfills empty encyclopedia sections from measured groove + hybrid judgment', async () => {
    const { ensureSonicDnaReportSectionsFilled, listSonicDnaReportSections, localSonicDnaAccuracyWarnings } = await import(
      '@/lib/audio/sonic-dna-report-sections'
    )
    const filled = ensureSonicDnaReportSectionsFilled({
      measured: {
        bpm: 140,
        bpmConfidence: 0.8,
        drumFamily: 'one-drop',
        kickSteps: [0],
        snareSteps: [8],
        key: 'D minor',
        keyConfidence: 0.7,
        genre: {
          primary: 'Reggae',
          subgenre: 'Dub Reggae',
          source: 'hybrid',
          audioPrimary: 'Reggae',
          audioSubgenre: 'Steppers',
          judgment: 'Hybrid judgment: catalog preference (Reggae / Dub Reggae) aligns with audio-measured groove (Reggae / Steppers).',
        },
      },
    })
    const sections = listSonicDnaReportSections(filled)
    for (const id of ['description', 'intention', 'dsp', 'history', 'culture', 'psychology', 'psychoacoustics', 'musicology']) {
      const section = sections.find((item) => item.id === id)
      expect(String(section?.text || '').length).toBeGreaterThan(10)
    }
    expect(
      localSonicDnaAccuracyWarnings(filled).some((warning) => /user-preferred.*not audio-measured|before publishing/i.test(warning)),
    ).toBe(false)
  })

  it('parses measured groove patches into BPM, drums, and key', async () => {
    const { applySonicDnaSectionText, listSonicDnaReportSections, parseMeasuredGrooveText } = await import(
      '@/lib/audio/sonic-dna-report-sections'
    )
    const text = [
      'BPM: 122 (full-time) · conf 0.72',
      'Drums: four-on-the-floor',
      'Kick: four-on-floor',
      'Hats: offbeat',
      'Bass lock: on-kick',
      'Key: A minor / Camelot 8A',
      'Groove class: House / Funky House',
      'Why: Offbeat hats at house tempo.',
    ].join('\n')
    const parsed = parseMeasuredGrooveText(text)
    expect(parsed.bpm).toBe(122)
    expect(parsed.drumFamily).toBe('four-on-the-floor')
    expect(parsed.key).toBe('A minor')
    expect(parsed.camelot).toBe('8A')
    expect(parsed.genre?.primary).toBe('House')
    expect(parsed.genre?.subgenre).toBe('Funky House')

    const next = applySonicDnaSectionText({ measured: { bpm: 90, key: 'C major' } }, 'groove', text)
    expect(next.measured.bpm).toBe(122)
    expect(next.measured.key).toBe('A minor')
    expect(next.harmony.keySignature).toBe('A minor')
    const groove = listSonicDnaReportSections(next).find((section) => section.id === 'groove')
    expect(groove?.text).toContain('BPM: 122')
    expect(groove?.text).toContain('A minor')
    expect(groove?.text).toContain('Funky House')
  })
})
