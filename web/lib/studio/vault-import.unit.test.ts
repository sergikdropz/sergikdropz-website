import { describe, expect, it } from 'vitest'
import {
  buildVaultReleaseDraft,
  descriptionFromSonicDna,
  studioTypeFromFolderType,
  vaultSoftReadiness,
} from '@/lib/studio/vault-import'

describe('studioTypeFromFolderType', () => {
  it('maps folder types', () => {
    expect(studioTypeFromFolderType('album')).toBe('album')
    expect(studioTypeFromFolderType('ep')).toBe('ep')
    expect(studioTypeFromFolderType('single')).toBe('single')
    expect(studioTypeFromFolderType('folder')).toBe('single')
  })
})

describe('descriptionFromSonicDna', () => {
  it('prefers long description fields', () => {
    expect(
      descriptionFromSonicDna({
        summary: 'A short blurb that is long enough to seed marketing copy for the release.',
      }),
    ).toMatch(/short blurb/)
  })

  it('returns null for empty dna', () => {
    expect(descriptionFromSonicDna(null)).toBeNull()
    expect(descriptionFromSonicDna({})).toBeNull()
  })
})

describe('buildVaultReleaseDraft', () => {
  it('autofills release + linked track drafts from folder and DNA', () => {
    const { release, tracks } = buildVaultReleaseDraft(
      {
        id: 'folder-ep-1',
        name: 'Night Drive',
        type: 'ep',
        artwork_url: '/art/night.jpg',
        year: 2024,
        genre: null,
      },
      [
        {
          id: 'trk-1',
          title: 'Neon',
          file_url: 'https://cdn.example/neon.mp3',
          display_order: 1,
          genre: 'House',
          sonic_dna: {
            genres: { primaryGenres: ['House'], subgenres: ['Melodic House'] },
            summary:
              'Late-night melodic house built for long drives and warm club rooms across the city.',
          },
          sonic_dna_status: 'complete',
        },
        {
          id: 'trk-2',
          title: 'Horizon',
          file_url: 'https://cdn.example/horizon.mp3',
          display_order: 2,
        },
      ],
    )

    expect(release.title).toBe('Night Drive')
    expect(release.type).toBe('ep')
    expect(release.artwork_url).toBe('/art/night.jpg')
    expect(release.release_date).toBe('2024-01-01')
    expect(release.genre).toBe('House')
    expect(release.subgenre).toBe('Melodic House')
    expect(release.description).toMatch(/Late-night/)
    expect(release.source_folder_id).toBe('folder-ep-1')
    expect(tracks).toHaveLength(2)
    expect(tracks[0]?.music_library_track_id).toBe('trk-1')
    expect(tracks[0]?.wav_url).toContain('neon.mp3')
    expect(tracks[0]?.dna_complete).toBe(true)
  })
})

describe('vaultSoftReadiness', () => {
  it('flags missing masters and vault links', () => {
    const soft = vaultSoftReadiness(
      [
        {
          music_library_track_id: 'a',
          wav_url: 'https://cdn.example/a.mp3',
          artwork_url: null,
        },
      ],
      '/art.jpg',
    )
    expect(soft.vaultLinked).toBe(true)
    expect(soft.needsMasterWav).toBe(true)
    expect(soft.hasArtwork).toBe(true)
  })
})
