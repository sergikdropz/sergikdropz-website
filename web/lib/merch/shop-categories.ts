export const SHOP_CATEGORIES = [
  { id: 'tees', label: 'T-Shirts' },
  { id: 'hoodies', label: 'Hoodies' },
  { id: 'hats', label: 'Hats' },
  { id: 'pants', label: 'Pants' },
  { id: 'accessories', label: 'Accessories' },
] as const

export type ShopCategoryId = (typeof SHOP_CATEGORIES)[number]['id']

export function isShopCategory(value: unknown): value is ShopCategoryId {
  return SHOP_CATEGORIES.some((category) => category.id === value)
}

export function shopCategoryLabel(id: string): string {
  return SHOP_CATEGORIES.find((category) => category.id === id)?.label || id
}
