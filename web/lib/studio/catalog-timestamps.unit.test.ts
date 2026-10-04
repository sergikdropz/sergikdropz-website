import { describe, expect, it } from 'vitest'
import {
  buildContinuousTimestampCues,
  catalogTimestampFacts,
  extractDurationFromSonicDna,
  formatCatalogTimestampRange,
  normalizeDurationSec,
  resolveCatalogDuration,
} from '@/lib/studio/catalog-timestamps'

describe('normalizeDurationSec', () => {
  it('treats zero and empty as missing', () => {
    expect(normalizeDurationSec(0)).toBeNull()
    expect(normalizeDurationSec(null)).toBeNull()
    expect(normalizeDurationSec('')).toBeNull()
  })

  it('reads seconds, milliseconds, and clocks', () => {
    expect(normalizeDurationSec(204)).toBe(204)
    expect(normalizeDurationSec(204_000)).toBe(204)
    expect(normalizeDurationSec('3:24')).toBe(204)
    expect(normalizeDurationSec('1:02:05')).toBe(3725)
  })
})

describe('resolveCatalogDuration', () => {
  it('does not let a catalog zero block audio_files', () => {
    const resolved = resolveCatalogDuration({
      catalog: 0,
      vault: 0,
      audio: 227.4,
    })
    expect(resolved).toEqual({ seconds: 227, source: 'audio_file' })
  })

  it('keeps a real catalog duration over later sources', () => {
    expect(
      resolveCatalogDuration({
        catalog: 180,
        vault: 200,
        audio: 227,
      }),
    ).toEqual({ seconds: 180, source: 'catalog' })
  })

  it('reads Sonic DNA and metadata when files have no length', () => {
    expect(
      resolveCatalogDuration({
        catalog: 0,
        sonicDna: { metadata: { durationSeconds: 246 }, measured: { bpm: 122 } },
      }),
    ).toEqual({ seconds: 246, source: 'sonic_dna' })

    expect(
      resolveCatalogDuration({
        metadata: { duration_ms: 219_000 },
      }),
    ).toEqual({ seconds: 219, source: 'metadata' })
  })
})

describe('extractDurationFromSonicDna', () => {
  it('walks compiled analysis metadata', () => {
    expect(
      extractDurationFromSonicDna({
        analysis: { metadata: { durationSeconds: 311 } },
      }),
    ).toBe(311)
  })
})

describe('buildContinuousTimestampCues', () => {
  it('locks a continuous visualizer timeline from resolved lengths', () => {
    const cues = buildContinuousTimestampCues([
      { title: 'Dandelicious', durationSec: 204 },
      { title: 'Escapade', durationSec: 217 },
    ])
    expect(cues).toEqual([
      expect.objectContaining({ title: 'Dandelicious', startSec: 0, endSec: 204, durationSec: 204 }),
      expect.objectContaining({ title: 'Escapade', startSec: 204, endSec: 421, durationSec: 217 }),
    ])
    expect(catalogTimestampFacts(cues)).toEqual({
      complete: true,
      runtimeSec: 421,
      missingTitles: [],
    })
    expect(formatCatalogTimestampRange(cues[0]!)).toBe('00:00–03:24')
  })

  it('unlocks later stamps when a catalog length is still missing', () => {
    const cues = buildContinuousTimestampCues([
      { title: 'Neon', durationSec: 180 },
      { title: 'Horizon', durationSec: null },
      { title: 'Closer', durationSec: 200 },
    ])
    expect(cues[0]).toMatchObject({ startSec: 0, endSec: 180 })
    expect(cues[1]).toMatchObject({ startSec: 180, endSec: null, durationSec: null })
    expect(cues[2]).toMatchObject({ startSec: null, endSec: null, durationSec: 200 })
    expect(catalogTimestampFacts(cues).missingTitles).toEqual(['Horizon'])
  })
})
