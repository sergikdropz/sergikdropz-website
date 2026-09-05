import { describe, expect, it } from 'vitest'
import {
  applyPreferredGenreToSonicDna,
  genrePickerModel,
  GROOVE_CLASS_GENRES,
  subgenresForGenre,
} from '@/lib/audio/groove-class-options'

describe('genrePickerModel', () => {
  it('suggests hip-hop/trap for half-time measured drums', () => {
    const model = genrePickerModel({
      genre: 'Slow House',
      sonic_dna: {
        measured: {
          drumFamily: 'half-time',
          genre: { primary: 'Hip-Hop', subgenre: 'Trap' },
        },
      },
    })
    expect(model.suggested.some((item) => item.value === 'Hip-Hop')).toBe(true)
    expect(model.suggested.some((item) => item.value === 'Trap')).toBe(true)
    expect(GROOVE_CLASS_GENRES).toContain('Slow House')
    expect(GROOVE_CLASS_GENRES).toContain('Funky House')
    expect(GROOVE_CLASS_GENRES).toContain('Psychedelic House')
  })

  it('lists encyclopedia parents and house subgenres', () => {
    const model = genrePickerModel({ genre: 'House' }, 'House')
    const genres = model.groups.flatMap((group) => group.genres)
    expect(genres).toContain('House')
    expect(genres).toContain('Psychedelic House')
    expect(genres).toContain('Funk')
    expect(genres).toContain('Electronic')
    expect(model.subgenres).toEqual(expect.arrayContaining(['Classic House', 'Deep House', 'Tech House', 'Psychedelic House']))
    expect(subgenresForGenre('Hip-Hop').length).toBeGreaterThan(5)
  })

  it('expands Experimental Bass with spacebass / wubs / wonky / leftfield', () => {
    const subs = subgenresForGenre('Experimental Bass')
    expect(subs).toEqual(
      expect.arrayContaining([
        'Spacebass',
        'Wubs',
        'Wonky',
        'Leftfield Bass',
        'UK Bass',
        'Broken 808',
        'Half-time Bass',
        'Footwork',
        'Colour Bass',
        'Tearout',
      ]),
    )
    expect(subs.length).toBeGreaterThan(12)
  })
})

describe('applyPreferredGenreToSonicDna', () => {
  it('blends catalog preference with audio-measured groove instead of wiping DSP class', () => {
    const next = applyPreferredGenreToSonicDna(
      {
        measured: {
          bpm: 103,
          bpmConfidence: 0.8,
          drumFamily: 'four-on-the-floor',
          kickSteps: [0, 4, 8, 12],
          snareSteps: [4, 12],
          key: 'A minor',
          keyConfidence: 0.7,
          genre: { primary: 'Tech House', subgenre: 'UK Tech House', source: 'audio-measured' },
        },
      },
      'Hip-Hop',
      'Trap',
    )
    expect(next.measured.genre.primary).toBe('Hip-Hop')
    expect(next.measured.genre.subgenre).toBe('Trap')
    expect(next.measured.genre.source).toBe('hybrid')
    expect(next.measured.genre.audioPrimary).toBe('Tech House')
    expect(next.measured.genre.audioSubgenre).toBe('UK Tech House')
    expect(next.measured.genre.judgment).toMatch(/Hybrid judgment/i)
    expect(next.preferredGenre.genre).toBe('Hip-Hop')
    expect(String(next.measured.intelligence.description || '')).toMatch(/Hybrid judgment|Hip-Hop|Trap/i)
  })

  it('force-refills encyclopedia when catalog genre changes away from prior class prose', () => {
    const next = applyPreferredGenreToSonicDna(
      {
        measured: {
          bpm: 124,
          bpmConfidence: 0.9,
          drumFamily: 'four-on-the-floor',
          kickSteps: [0, 4, 8, 12],
          snareSteps: [4, 12],
          key: 'A minor',
          keyConfidence: 0.8,
          genre: {
            primary: 'Tech House',
            subgenre: 'Groovy Tech House',
            audioPrimary: 'Tech House',
            source: 'audio-measured',
          },
          intelligence: {
            description: 'x'.repeat(420),
            method: 'measured-groove + world-genre encyclopedia',
            historical: { historicalContext: 'y'.repeat(300) },
            psychoacoustics: { report: 'z'.repeat(300) },
          },
          report: {
            layers: {
              historical: 'Old Tech House history that must be replaced on genre edit.',
              cultural: 'Old Tech House culture copy that must be replaced.',
              psychological: 'Old Tech House psychology that must be replaced on preference change.',
              psychoacoustics: 'Old Tech House psychoacoustics that must be replaced.',
            },
          },
        },
      },
      'Funky House',
      'Nu-Disco',
    )
    expect(next.measured.genre.primary).toBe('Funky House')
    expect(next.measured.genre.preferredPrimary).toBe('Funky House')
    const history = String(
      next.measured.report?.layers?.historical || next.measured.intelligence?.historical?.historicalContext || '',
    )
    expect(history).not.toMatch(/Old Tech House history/)
    expect(history.length).toBeGreaterThan(80)
    const culture = String(next.measured.report?.layers?.cultural || next.cultural?.description || '')
    expect(culture).not.toMatch(/Old Tech House culture/)
    expect(String(next.description || next.measured.intelligence?.description || '')).toMatch(/Funky House|Nu-Disco|Hybrid|Catalog/i)
  })

  it('marks preference-only when no audio class exists', () => {
    const next = applyPreferredGenreToSonicDna({}, 'Reggae', 'Dub Reggae')
    expect(next.measured.genre.source).toBe('user-preferred')
    expect(next.measured.genre.primary).toBe('Reggae')
    expect(next.measured.genre.subgenre).toBe('Dub Reggae')
    expect(next.measured.genre.judgment).toMatch(/Catalog preference/i)
  })

  it('uses hybrid agree path when preference matches audio family', () => {
    const next = applyPreferredGenreToSonicDna(
      { measured: { genre: { primary: 'Reggae', subgenre: 'Steppers', source: 'audio-measured' } } },
      'Reggae',
      'Dub Reggae',
    )
    expect(next.measured.genre.source).toBe('hybrid')
    expect(next.measured.genre.audioPrimary).toBe('Reggae')
    expect(next.measured.genre.judgment).toMatch(/aligns with audio-measured/i)
  })
})
