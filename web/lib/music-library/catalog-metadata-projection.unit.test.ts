import { describe, expect, it } from 'vitest'
import {
  CATALOG_METADATA_SELECT,
  catalogMetadataFromRow,
  stripCatalogMetadataAliases,
} from './catalog-metadata-projection'

describe('CATALOG_METADATA_SELECT', () => {
  it('only selects jsonb sub-fields, never the whole metadata column', () => {
    const parts = CATALOG_METADATA_SELECT.split(',')
    expect(parts.length).toBeGreaterThan(0)
    for (const part of parts) {
      expect(part).toMatch(/^meta_[a-z_]+:metadata->[A-Za-z_]+$/)
    }
    expect(parts).not.toContain('metadata')
  })

  it('never reaches for the analysis blobs that caused the timeout', () => {
    expect(CATALOG_METADATA_SELECT).not.toContain('sonic_dna')
    expect(CATALOG_METADATA_SELECT).not.toContain('waveform')
  })
})

describe('catalogMetadataFromRow', () => {
  it('rebuilds catalog stamps from aliased sub-fields', () => {
    const metadata = catalogMetadataFromRow({
      id: 't1',
      title: 'On n On',
      meta_original_date: '2026-07-08',
      meta_original_date_source: 'export_folder_birthtime',
      meta_catalog_overrides: { bpm: 84, genre: 'Hip-Hop' },
      meta_primary_genre: 'Hip-Hop',
      meta_genres: ['Hip-Hop', 'Lo-Fi Hip-Hop'],
      meta_key_signature: 'F minor',
    })
    expect(metadata).toEqual({
      original_date: '2026-07-08',
      original_date_source: 'export_folder_birthtime',
      catalog_overrides: { bpm: 84, genre: 'Hip-Hop' },
      primary_genre: 'Hip-Hop',
      genres: ['Hip-Hop', 'Lo-Fi Hip-Hop'],
      key_signature: 'F minor',
    })
  })

  it('carries the reference-resolution keys used to dedupe All Tracks rows', () => {
    const metadata = catalogMetadataFromRow({
      meta_references_all_tracks: true,
      meta_original_track_id: 'track-abc',
    })
    expect(metadata).toEqual({ referencesAllTracks: true, originalTrackId: 'track-abc' })
  })

  it('omits null sub-fields instead of emitting empty keys', () => {
    expect(
      catalogMetadataFromRow({
        meta_original_date: '2026-07-08',
        meta_catalog_overrides: null,
        meta_genres: null,
      }),
    ).toEqual({ original_date: '2026-07-08' })
  })

  it('returns undefined when a track has no catalog stamps at all', () => {
    expect(catalogMetadataFromRow({ id: 't1', meta_original_date: null })).toBeUndefined()
    expect(catalogMetadataFromRow(null)).toBeUndefined()
    expect(catalogMetadataFromRow([])).toBeUndefined()
  })
})

describe('stripCatalogMetadataAliases', () => {
  it('removes alias columns and leaves real columns intact', () => {
    const row: Record<string, unknown> = {
      id: 't1',
      title: 'On n On',
      meta_original_date: '2026-07-08',
      meta_catalog_overrides: { bpm: 84 },
    }
    expect(stripCatalogMetadataAliases(row)).toEqual({ id: 't1', title: 'On n On' })
  })
})
