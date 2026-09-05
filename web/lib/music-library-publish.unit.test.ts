import { describe, expect, it } from 'vitest'
import { isUsableCatalogValue, preferCatalogValue } from './music-library-publish'

describe('catalog publish values', () => {
  it('rejects Unknown placeholders', () => {
    expect(isUsableCatalogValue('Unknown')).toBe(false)
    expect(isUsableCatalogValue('')).toBe(false)
    expect(isUsableCatalogValue(0)).toBe(false)
    expect(isUsableCatalogValue('C# minor')).toBe(true)
    expect(isUsableCatalogValue(124)).toBe(true)
  })

  it('keeps catalog BPM/key over audio-file fallbacks', () => {
    expect(preferCatalogValue(124, 120)).toBe(124)
    expect(preferCatalogValue('Unknown', 'A minor')).toBe('A minor')
    expect(preferCatalogValue('Funky House', 'Tech House')).toBe('Funky House')
  })
})
