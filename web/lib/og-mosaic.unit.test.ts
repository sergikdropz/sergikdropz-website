import { describe, expect, it } from 'vitest'
import { collectOgMosaicSources, buildOgMosaicIndices, OG_MOSAIC_CELLS } from './og-mosaic'

describe('og-mosaic', () => {
  it('collects gallery photos plus release/EP covers', () => {
    const tiles = collectOgMosaicSources()
    expect(tiles.length).toBeGreaterThan(20)
    expect(tiles.some((t) => t.src.includes('/images/gallery/'))).toBe(true)
    expect(tiles.some((t) => t.id.startsWith('release-') || t.id.startsWith('ep-') || t.src.includes('artwork'))).toBe(
      true,
    )
    const srcs = new Set(tiles.map((t) => t.src.split('?')[0]))
    expect(srcs.size).toBe(tiles.length)
  })

  it('builds a dense mosaic index grid', () => {
    const indices = buildOgMosaicIndices(12)
    expect(indices).toHaveLength(OG_MOSAIC_CELLS)
    expect(indices.every((i) => i >= 0 && i < 12)).toBe(true)
  })
})
