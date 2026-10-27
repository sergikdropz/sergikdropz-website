import productsData from '@/data/products.json'
import memberCatalogData from '@/data/member-catalog.json'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { shopFormatPrices } from '@/lib/shop/format-prices'

export type MemberCatalogItem = {
  id: string
  productId: string
  title: string
  slug: string
  description: string
  artwork?: string
  trackCount: number
  formatPrices: ReturnType<typeof shopFormatPrices>
  price: number
  note?: string
}

function productById(productId: string) {
  return productsData.products.find((p) => p.id === productId)
}

function toItem(productId: string, note?: string): MemberCatalogItem | null {
  const p = productById(productId)
  if (!p) return null
  const formatPrices = shopFormatPrices(Number(p.trackCount) || 1)
  return {
    id: p.id,
    productId: p.id,
    title: p.title,
    slug: p.slug || p.id,
    description: p.description,
    artwork: p.artwork ? resolveImageUrl(p.artwork) : undefined,
    trackCount: Number(p.trackCount) || 1,
    formatPrices,
    price: formatPrices.MP3,
    note,
  }
}

export function getMemberIncludedCatalog(): MemberCatalogItem[] {
  return memberCatalogData.memberIncluded
    .map((row) => toItem(row.productId, row.note))
    .filter((row): row is MemberCatalogItem => Boolean(row))
}

export function getExclusiveCatalog(): MemberCatalogItem[] {
  return memberCatalogData.exclusive
    .map((row) => toItem(row.productId, row.note))
    .filter((row): row is MemberCatalogItem => Boolean(row))
}

export function isExclusiveProductId(productId: string): boolean {
  return memberCatalogData.exclusive.some((row) => row.productId === productId)
}

export function isMemberIncludedProductId(productId: string): boolean {
  return memberCatalogData.memberIncluded.some((row) => row.productId === productId)
}

export function findProductForCheckout(productId: string) {
  const p = productById(productId)
  if (!p) return null
  if (p.status === 'active') return p
  if (isExclusiveProductId(productId)) return p
  return null
}
