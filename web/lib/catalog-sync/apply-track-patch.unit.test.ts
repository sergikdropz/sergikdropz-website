import { describe, expect, it } from 'vitest'
import { displayTrackBpm, displayTrackGenre } from '@/lib/audio/track-display'
import { applyCatalogTrackPatch, catalogPatchFromTrack } from './apply-track-patch'

describe('applyCatalogTrackPatch', () => {
  it('stamps catalog overrides so Songs columns read the saved values', () => {
    const next = applyCatalogTrackPatch(
      {
        id: 't1',
        title: 'Old',
        artist: 'SERGIK',
        genre: 'Hip-Hop',
        bpm: 124,
        metadata: { catalog_overrides: { genre: 'Hip-Hop', bpm: 125 } },
        sonic_dna: { measured: { bpm: 124, genre: { primary: 'Hip-Hop' } } },
      },
      catalogPatchFromTrack({
        title: 'Bird Talk',
        artist: 'Andino x SERGIK',
        genre: 'Experimental Bass',
        bpm: 140,
      }),
    )
    expect(next.title).toBe('Bird Talk')
    expect(displayTrackGenre(next)).toBe('Experimental Bass')
    expect(displayTrackBpm(next)).toBe(140)
    expect((next.metadata as { catalog_overrides?: { genre?: string; bpm?: number } }).catalog_overrides?.genre).toBe(
      'Experimental Bass',
    )
  })

  it('applies systemic beat-grid phase + DNA from catalog sync', () => {
    const next = applyCatalogTrackPatch(
      {
        id: 't1',
        beat_grid_offset: 0.01,
        sonic_dna: { measured: { bpm: 124 } },
      },
      {
        beat_grid_offset: 0.042,
        sonic_dna: { measured: { bpm: 124, gridOffsetSec: 0.042, gridManual: true }, gridManual: true },
      },
    )
    expect(next.beat_grid_offset).toBe(0.042)
    expect((next.sonic_dna as { gridManual?: boolean }).gridManual).toBe(true)
  })
})
