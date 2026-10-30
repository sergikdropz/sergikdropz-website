import { describe, expect, it } from 'vitest'
import { getBlank } from '@/lib/merch/blanks'
import type { ArtPlacement } from '@/lib/merch/design'
import { rotationAlignAxis, snapArtInPrintArea, snapRotation } from '@/lib/merch/placement-snap'

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

  it('snaps embroidery to the stitch edge instead of the file edge', () => {
    const hat = {
      ...area,
      printfulType: 'addon_embroidery_front',
      printWidth: 675,
      printHeight: 675,
      dpi: 300,
    }
    const inset = (0.3 * 300) / 675
    const layer = art({ x: inset - 0.01, y: 0.45, scale: 0.05 })
    const result = snapArtInPrintArea(layer, hat, { x: inset - 0.01, y: 0.45 })
    expect(result.x).toBeCloseTo(inset, 2)
    expect(result.guides.vertical.some((line) => Math.abs(line - inset) < 0.001)).toBe(true)
    expect(result.guides.vertical).not.toContain(0)
  })

  it('respects a tighter snap threshold', () => {
    const layer = art({ x: 0.24, y: 0.31, scale: 0.28 })
    const loose = snapArtInPrintArea(layer, area, { x: 0.24, y: 0.31 }, { threshold: 0.02 })
    const tight = snapArtInPrintArea(layer, area, { x: 0.24, y: 0.31 }, { threshold: 0.001 })
    expect(loose.x).toBeCloseTo(0.25, 2)
    expect(tight.x).toBe(0.24)
  })
})

describe('snapRotation', () => {
  it('lands on every 45 degree mark when the pointer is close', () => {
    expect(snapRotation(2).rotation).toBe(0)
    expect(snapRotation(43).rotation).toBe(45)
    expect(snapRotation(-88).rotation).toBe(-90)
    expect(snapRotation(178).rotation).toBe(180)
    expect(snapRotation(-179).rotation).toBe(-180)
  })

  it('leaves angles that are between the marks', () => {
    expect(snapRotation(20)).toEqual({ rotation: 20, held: null })
    expect(rotationAlignAxis(20)).toBeNull()
    expect(rotationAlignAxis(45)).toBe(45)
    expect(rotationAlignAxis(180)).toBe(0)
    expect(rotationAlignAxis(-45)).toBe(135)
  })

  it('holds a mark until the pointer moves past the exit band', () => {
    expect(snapRotation(50, 45)).toEqual({ rotation: 45, held: 45 })
    expect(snapRotation(54, 45).rotation).toBe(54)
  })
})
