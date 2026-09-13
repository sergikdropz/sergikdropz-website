import { describe, expect, it } from 'vitest'
import { mergeSonicDNAIntoMetadata } from './mergeSonicDNAIntoMetadata'

const dna = { technical: { bpm: 124 }, huge: 'x'.repeat(1000) }
const peaks = Array.from({ length: 2048 }, (_, i) => i % 100)

describe('mergeSonicDNAIntoMetadata', () => {
  it('keeps analysis blobs out of metadata so list queries stay cheap', () => {
    const metadata = mergeSonicDNAIntoMetadata({}, dna, {
      bpm: 124,
      key_signature: 'F minor',
      waveform_data: peaks,
      waveform_samples: 2048,
    })
    expect(metadata.sonic_dna).toBeUndefined()
    expect(metadata.waveform_data).toBeUndefined()
    expect(JSON.stringify(metadata).length).toBeLessThan(500)
  })

  it('still records the scalars and the refresh timestamp', () => {
    const metadata = mergeSonicDNAIntoMetadata({}, dna, {
      bpm: 124,
      key_signature: 'F minor',
      energy_level: 7,
      danceability: 8,
      waveform_samples: 2048,
      duration_seconds: 316,
      artwork_url: '/art.jpg',
    })
    expect(metadata.bpm).toBe(124)
    expect(metadata.key_signature).toBe('F minor')
    expect(metadata.energy_level).toBe(7)
    expect(metadata.danceability).toBe(8)
    expect(metadata.waveform_samples).toBe(2048)
    expect(metadata.duration_seconds).toBe(316)
    expect(metadata.artwork_url).toBe('/art.jpg')
    expect(typeof metadata.sonic_dna_updated_at).toBe('string')
    expect(typeof metadata.metadata_updated_at).toBe('string')
  })

  it('evicts blobs left behind on rows written before the cleanup', () => {
    const metadata = mergeSonicDNAIntoMetadata(
      { sonic_dna: dna, waveform_data: peaks, original_date: '2026-07-08' },
      dna,
      { bpm: 124, waveform_data: peaks },
    )
    expect(metadata.sonic_dna).toBeUndefined()
    expect(metadata.waveform_data).toBeUndefined()
    expect(metadata.original_date).toBe('2026-07-08')
  })

  it('preserves unrelated catalog stamps already on the row', () => {
    const metadata = mergeSonicDNAIntoMetadata(
      { catalog_overrides: { bpm: 84, genre: 'Hip-Hop' }, original_date_source: 'manual' },
      undefined,
      { bpm: 124 },
    )
    expect(metadata.catalog_overrides).toEqual({ bpm: 84, genre: 'Hip-Hop' })
    expect(metadata.original_date_source).toBe('manual')
  })

  it('does not smuggle blobs through the analysisData passthrough', () => {
    const metadata = mergeSonicDNAIntoMetadata({}, undefined, {
      sonic_dna: dna,
      waveform: peaks,
      primary_genre: 'Hip-Hop',
    } as any)
    expect(metadata.sonic_dna).toBeUndefined()
    expect(metadata.waveform).toBeUndefined()
    expect(metadata.primary_genre).toBe('Hip-Hop')
  })
})
