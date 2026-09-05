import { describe, expect, it } from 'vitest'
import {
  buildMosaicGrid,
  hasAdjacentDuplicate,
  neighborIndexes,
  swapMosaicCells,
} from './background-mosaic'

function uniqueCount(grid: number[]): number {
  return new Set(grid).size
}

describe('background-mosaic', () => {
  it('lists 4-connected neighbors only', () => {
    // 3×2 vault grid
    expect(neighborIndexes(0, 3, 6).sort()).toEqual([1, 3])
    expect(neighborIndexes(1, 3, 6).sort()).toEqual([0, 2, 4])
    expect(neighborIndexes(4, 3, 6).sort()).toEqual([1, 3, 5])
    expect(neighborIndexes(5, 3, 6).sort()).toEqual([2, 4])
  })

  it('fills a vault-sized grid with unique non-adjacent tiles', () => {
    for (let i = 0; i < 40; i++) {
      const grid = buildMosaicGrid(12, 6, 3)
      expect(grid).toHaveLength(6)
      expect(uniqueCount(grid)).toBe(6)
      expect(hasAdjacentDuplicate(grid, 3)).toBe(false)
    }
  })

  it('swaps without placing the same cover on an edge neighbor', () => {
    for (let i = 0; i < 40; i++) {
      const start = buildMosaicGrid(12, 6, 3)
      const next = swapMosaicCells(start, 12, 3, 2)
      expect(next).toHaveLength(6)
      expect(hasAdjacentDuplicate(next, 3)).toBe(false)
      expect(uniqueCount(next)).toBe(6)
    }
  })

  it('keeps adjacent tiles distinct when duplicates are required', () => {
    for (let i = 0; i < 40; i++) {
      const grid = buildMosaicGrid(3, 6, 3)
      expect(hasAdjacentDuplicate(grid, 3)).toBe(false)
    }
  })
})
