import { describe, expect, it } from 'vitest'
import { applyAdminBpmToTrack, applySonicDnaAnalysisToTrack, displayTrackBpm, displayTrackDrumStyle, displayTrackGenre, displayTrackKey, displayTrackSubgenre, keySignatureFromSonicDnaReport } from '@/lib/audio/track-display'

describe('displayTrackGenre', () => {
  it('prefers saved catalog genre over stale DNA labels', () => {
    expect(
      displayTrackGenre({
        genre: 'Hip-Hop',
        bpm: 123,
        sonic_dna: {
          measured: { genre: { primary: 'Tech House', subgenre: 'UK Tech House' } },
          genres: { primaryGenres: ['Tech House'] },
        },
      }),
    ).toBe('Hip-Hop')
  })

  it('prefers admin catalog even when measured DNA has a conflicting groove', () => {
    expect(
      displayTrackGenre({
        genre: 'Funky House',
        metadata: { catalog_overrides: { genre: 'Funky House' } },
        sonic_dna: {
          measured: {
            bpm: 124,
            drumFamily: 'four-on-the-floor',
            genre: { primary: 'Funky House', audioPrimary: 'Tech House' },
          },
        },
      }),
    ).toBe('Funky House')
  })

  it('uses stored genre when Sonic DNA is omitted from list payloads', () => {
    expect(displayTrackGenre({ genre: 'Funky House', bpm: 122 })).toBe('Funky House')
  })

  it('falls back to measured DNA when the catalog genre is empty', () => {
    expect(
      displayTrackGenre({
        bpm: 123,
        sonic_dna: { measured: { genre: { primary: 'Hip-Hop' } } },
      }),
    ).toBe('Hip-Hop')
  })

  it('does not invent Tech House from BPM alone', () => {
    expect(displayTrackGenre({ bpm: 123 })).toBe('')
  })
})

describe('keySignatureFromSonicDnaReport', () => {
  it('prefers measured Sonic DNA over a stale catalog key', () => {
    const report = keySignatureFromSonicDnaReport({
      measured: { key: 'A minor', camelot: '8A', rootNote: 'A', scale: 'minor', keyConfidence: 0.55 },
      harmony: { keySignature: 'A# minor' },
    })
    expect(report?.key).toBe('A minor')
    expect(report?.camelot).toBe('8A')
    expect(report?.root).toBe('A')
  })

  it('uses harmony key when measured key is missing', () => {
    const report = keySignatureFromSonicDnaReport({
      harmony: { keySignature: 'B minor' },
      musical: { keySignature: 'G major' },
    })
    expect(report?.key).toBe('B minor')
    expect(report?.camelot).toBe('10A')
  })
})

describe('displayTrack columns', () => {
  it('reads key, subgenre, and drums from catalog then measured DNA', () => {
    const track = {
      subgenre: 'Trap',
      key_signature: 'A major',
      sonic_dna: {
        measured: {
          key: 'C minor',
          drumFamily: 'half-time',
          genre: { primary: 'Hip-Hop', subgenre: 'Boom Bap' },
        },
      },
    }
    expect(displayTrackKey(track)).toBe('A major')
    expect(displayTrackSubgenre(track)).toBe('Trap')
    expect(displayTrackDrumStyle(track)).toBe('Half-Time')
  })
})

describe('applySonicDnaAnalysisToTrack', () => {
  it('writes measured BPM, key, and genre onto catalog columns and lock', () => {
    const next = applySonicDnaAnalysisToTrack(
      { genre: 'Stale House', bpm: 118, key_signature: 'C major' },
      {
        status: 'completed',
        sonicDna: {
          measured: {
            bpm: 126,
            key: 'F# minor',
            genre: { primary: 'Tech House', subgenre: 'UK Tech House' },
          },
        },
      },
    )
    expect(next.bpm).toBe(126)
    expect(next.key_signature).toBe('F# minor')
    expect(next.genre).toBe('Tech House')
    expect((next as { subgenre?: string }).subgenre).toBe('UK Tech House')
    expect((next as { sonic_dna_status?: string }).sonic_dna_status).toBe('completed')
    expect(displayTrackBpm(next)).toBe(126)
    expect(displayTrackKey(next)).toBe('F# minor')
    expect(displayTrackGenre(next)).toBe('Tech House')
  })
})

describe('applyAdminBpmToTrack', () => {
  it('overrides a conflicting catalog lock and measured DNA', () => {
    const next = applyAdminBpmToTrack(
      {
        bpm: 124,
        metadata: { catalog_overrides: { bpm: 125 } },
        sonic_dna: { measured: { bpm: 124 } },
      },
      128,
    )
    expect(displayTrackBpm(next)).toBe(128)
    expect((next.metadata as { catalog_overrides?: { bpm?: number } }).catalog_overrides?.bpm).toBe(128)
  })
})
