import { describe, expect, it } from 'vitest'
import { groupMerchDesignsByItem, merchGarmentGroup } from '@/lib/merch/item-groups'

describe('merch garment groups', () => {
  it('reads the garment from the product name', () => {
    expect(merchGarmentGroup({ id: '1', name: 'SERGIK Stone Snapback', family: 'hat' }).label).toBe('Hats')
    expect(merchGarmentGroup({ id: '2', name: 'OLLIN White Golf Rope Cap', family: 'hat' }).label).toBe('Hats')
    expect(merchGarmentGroup({ id: '3', name: 'Valle Del Sol Tee', family: 'tee' }).label).toBe('Shirts')
    expect(merchGarmentGroup({ id: '4', name: 'Fleece Hoodie', family: 'hoodie' }).label).toBe('Hoodies')
    expect(merchGarmentGroup({ id: '5', name: 'Studio Shorts', family: 'tee' }).label).toBe('Shorts')
    expect(merchGarmentGroup({ id: '6', name: 'Fleece Sweatpants', family: 'sweatpants' }).label).toBe('Pants')
    expect(merchGarmentGroup({ id: '7', name: 'OlliN Wall Clock', family: 'tee' }).label).toBe('Clocks')
  })

  it('puts every design of a garment in one folder', () => {
    const groups = groupMerchDesignsByItem([
      { id: 'a', name: 'SERGIK Stone Snapback', family: 'hat' },
      { id: 'b', name: 'OLLIN Black Organic Bucket Hat', family: 'hat' },
      { id: 'c', name: 'OLLIN White Golf Rope Cap', family: 'hat' },
      { id: 'd', name: 'Iza Vibe Tee Front', family: 'tee' },
      { id: 'e', name: 'Stone OLLIN Back', family: 'tee' },
      { id: 'f', name: 'OlliN Wall Clock', family: 'tee' },
      { id: 'g', name: 'Night Hoodie', family: 'hoodie' },
    ])

    expect(groups.map((group) => [group.label, group.designs.map((design) => design.id)])).toEqual([
      ['Hats', ['a', 'b', 'c']],
      ['Shirts', ['d', 'e']],
      ['Clocks', ['f']],
      ['Hoodies', ['g']],
    ])
  })
})