import { describe, expect, it } from 'vitest'
import { catalogSidebarRoots, type PrintfulCategoryNode } from '@/lib/merch/printful-categories'

function node(id: number, title: string, position: number, parentId = 0): PrintfulCategoryNode {
  return { id, parentId, title, imageUrl: null, position, children: [] }
}

describe('printful-categories', () => {
  it('includes Collections and Brands in sidebar roots', () => {
    const roots = catalogSidebarRoots([
      node(1, "Men's clothing", 1),
      node(116, 'Collections', 7),
      node(159, 'Brands', 7),
      node(277, 'All products', 8),
    ])
    const titles = roots.map((r) => r.title)
    expect(titles).toContain('Collections')
    expect(titles).toContain('Brands')
    expect(titles).not.toContain('All products')
  })
})
