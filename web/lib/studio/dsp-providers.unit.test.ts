import { describe, expect, it } from 'vitest'
import { ALL_DSP_STORE_IDS, DSP_STORES } from '@/lib/studio/constants'
import { parseKnownStoreUrl } from '@/lib/studio/dsp-connect'
import {
  assertDspProvidersComplete,
  DSP_PROVIDER_IMPLS,
  dspProviderCatalog,
  getDspProvider,
  odesliPlatformToStoreMap,
} from '@/lib/studio/dsp-providers'

describe('DSP provider registry', () => {
  it('covers every DSP_STORES id exactly once', () => {
    const completeness = assertDspProvidersComplete()
    expect(completeness).toEqual({ ok: true, missingImpl: [], orphanImpl: [] })
    expect(DSP_PROVIDER_IMPLS).toHaveLength(DSP_STORES.length)
    expect(dspProviderCatalog()).toHaveLength(ALL_DSP_STORE_IDS.length)
  })

  it('parses every exampleUrl onto the matching store', () => {
    for (const impl of DSP_PROVIDER_IMPLS) {
      const parsed = parseKnownStoreUrl(impl.exampleUrl)
      expect(parsed?.store, `${impl.id} ← ${impl.exampleUrl}`).toBe(impl.id)
    }
  })

  it('maps Odesli platforms onto studio stores without collisions on primary keys', () => {
    const map = odesliPlatformToStoreMap()
    expect(map.spotify).toBe('spotify')
    expect(map.appleMusic).toBe('apple_music')
    expect(map.pandora).toBe('pandora')
    expect(map.anghami).toBe('anghami')
    expect(map.boomplay).toBe('boomplay')
    expect(map.tidal).toBe('tidal')
    expect(map.amazonMusic).toBe('amazon')
  })

  it('exposes search / odesli / paste modes for core stores', () => {
    expect(getDspProvider('spotify').modes).toContain('search')
    expect(getDspProvider('apple_music').modes).toContain('search')
    expect(getDspProvider('deezer').modes).toContain('search')
    expect(getDspProvider('tidal').modes).toContain('odesli')
    expect(getDspProvider('iheart').modes).toContain('derived')
    expect(getDspProvider('medianet').modes).toEqual(['submitted'])
  })
})
