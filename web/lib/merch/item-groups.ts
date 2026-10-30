/**
 * My Products folders designs by garment: shirts, hats, pants, shorts, hoodies.
 * The product name wins over the studio family so a wall clock saved as a tee
 * does not land in Shirts.
 */

export type ItemGroupDesign = {
  id: string
  name: string
  family?: string | null
}

export type MerchItemGroup<T extends ItemGroupDesign = ItemGroupDesign> = {
  key: string
  label: string
  designs: T[]
}

const NAMED_GROUPS: Array<{ key: string; label: string; test: RegExp }> = [
  { key: 'hoodies', label: 'Hoodies', test: /\bhoodies?\b|\bsweatshirts?\b/i },
  { key: 'shorts', label: 'Shorts', test: /\bshorts\b/i },
  { key: 'pants', label: 'Pants', test: /\bpants\b|\bjoggers?\b|\bleggings?\b|\bsweatpants\b/i },
  { key: 'hats', label: 'Hats', test: /\bhats?\b|\bsnapbacks?\b|\bcaps?\b|\bbeanies?\b/i },
  { key: 'shirts', label: 'Shirts', test: /\btees?\b|\bt-?shirts?\b|\btanks?\b|\bpolos?\b|\bshirts?\b/i },
  { key: 'clocks', label: 'Clocks', test: /\bclocks?\b/i },
  { key: 'mugs', label: 'Mugs', test: /\bmugs?\b/i },
  { key: 'posters', label: 'Posters', test: /\bposters?\b/i },
  { key: 'bags', label: 'Bags', test: /\bbags?\b|\btotes?\b/i },
]

const FAMILY_GROUP: Record<string, { key: string; label: string }> = {
  hat: { key: 'hats', label: 'Hats' },
  hoodie: { key: 'hoodies', label: 'Hoodies' },
  sweatpants: { key: 'pants', label: 'Pants' },
  tee: { key: 'shirts', label: 'Shirts' },
}

export function merchGarmentGroup(design: ItemGroupDesign): { key: string; label: string } {
  const name = design.name || ''
  const named = NAMED_GROUPS.find((group) => group.test.test(name))
  if (named) return { key: named.key, label: named.label }
  const family = design.family ? FAMILY_GROUP[design.family] : undefined
  if (family) return family
  return { key: 'other', label: 'Other' }
}

/** Keep catalog order. One folder per garment. */
export function groupMerchDesignsByItem<T extends ItemGroupDesign>(designs: T[]): MerchItemGroup<T>[] {
  const groups: MerchItemGroup<T>[] = []
  const index = new Map<string, MerchItemGroup<T>>()
  for (const design of designs) {
    const garment = merchGarmentGroup(design)
    const existing = index.get(garment.key)
    if (existing) {
      existing.designs.push(design)
      continue
    }
    const group: MerchItemGroup<T> = { key: garment.key, label: garment.label, designs: [design] }
    index.set(garment.key, group)
    groups.push(group)
  }
  return groups
}
