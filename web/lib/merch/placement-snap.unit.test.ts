import { describe, expect, it } from 'vitest'
import { getBlank } from '@/lib/merch/blanks'
import type { ArtPlacement } from '@/lib/merch/design'
import { snapArtInPrintArea } from '@/lib/merch/placement-snap'

describe('snapArtInPrintArea', () => {
  const area = getBlank('tee-staple')!.placements.find((p) => p.id === 'front')!

  function art(overrides: Partial<ArtPlacement>): ArtPlacement {
    return {
      placement: 'front',
      assetUrl: '/x.png',
      assetWidth: 1000,
      assetHeight: 1000,
      x: 0.36,
      y: 0.31,
      scale: 0.28,
      rotation: 0,
      ...overrides,
    }
  }

  it('snaps horizontal center to print-area center', () => {
    const layer = art({ x: 0.36, y: 0.31, scale: 0.28 })
    const result = snapArtInPrintArea(layer, area, { x: 0.36, y: 0.31 })
    expect(result.x).toBeCloseTo(0.36, 2)
    expect(result.guides.vertical).toContain(0.5)
  })

  it('snaps near a grid line within threshold', () => {
    const layer = art({ x: 0.24, y: 0.31, scale: 0.28 })
    const result = snapArtInPrintArea(layer, area, { x: 0.24, y: 0.31 })
    expect(result.x).toBeCloseTo(0.25, 2)
    expect(result.guides.vertical).toContain(0.25)
  })

  it('respects a tighter snap threshold', () => {
    const layer = art({ x: 0.24, y: 0.31, scale: 0.28 })
    const loose = snapArtInPrintArea(layer, area, { x: 0.24, y: 0.31 }, { threshold: 0.02 })
    const tight = snapArtInPrintArea(layer, area, { x: 0.24, y: 0.31 }, { threshold: 0.001 })
    expect(loose.x).toBeCloseTo(0.25, 2)
    expect(tight.x).toBe(0.24)
  })
})
