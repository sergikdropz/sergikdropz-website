import { describe, expect, it } from 'vitest'
import {
  applyCatalogLock,
  catalogLockFromTrack,
  nextCatalogOverrides,
  omitLockedCatalogColumns,
  stampCatalogOverrides,
} from './catalog-lock'

describe('catalog lock', () => {
  it('stamps explicit admin saves and keeps prior locks', () => {
    const first = stampCatalogOverrides({}, { bpm: 103, genre: 'Funky House' })
    const second = stampCatalogOverrides(first, { key_signature: 'A minor' })
    const overrides = nextCatalogOverrides(second, {})
    expect(overrides.bpm).toBe(103)
    expect(overrides.genre).toBe('Funky House')
    expect(overrides.key_signature).toBe('A minor')
  })

  it('treats filled catalog columns as locked even without metadata', () => {
    const lock = catalogLockFromTrack({
      bpm: 118,
      key_signature: 'Unknown',
      genre: 'Hip-Hop',
      subgenre: 'Boom Bap',
    })
    expect(lock.bpm).toBe(118)
    expect(lock.key_signature).toBeUndefined()
    expect(lock.genre).toBe('Hip-Hop')
    expect(lock.subgenre).toBe('Boom Bap')
  })

  it('re-applies catalog BPM/key/genre onto analysis writes', () => {
    const { sonicDNA, analysisData } = applyCatalogLock(
      { bpm: 103, key_signature: 'F# minor', genre: 'Disco', subgenre: 'Nu-Disco' },
      {
        technical: { bpm: 122 },
        measured: { genre: { primary: 'House' } },
      },
      { bpm: 122, key_signature: 'C major' },
    )
    expect(analysisData.bpm).toBe(103)
    expect(analysisData.key_signature).toBe('F# minor')
    expect(sonicDNA.technical.bpm).toBe(103)
    expect((sonicDNA as { preferredGenre?: { genre: string } }).preferredGenre?.genre).toBe('Disco')
    expect(sonicDNA.measured.genre.primary).toBe('Disco')
    expect((sonicDNA.measured.genre as { source?: string }).source).toBe('hybrid')
    expect((sonicDNA.measured.genre as { audioPrimary?: string }).audioPrimary).toBe('House')
  })

  it('omits locked columns so Scan cannot revert admin values', () => {
    const next = omitLockedCatalogColumns(
      { bpm: 103, genre: 'Funky House' },
      { bpm: 128, key_signature: 'C major', genre: 'Tech House', energy_level: 4 },
    )
    expect(next.bpm).toBeUndefined()
    expect(next.genre).toBeUndefined()
    expect(next.key_signature).toBe('C major')
    expect(next.energy_level).toBe(4)
  })
})
