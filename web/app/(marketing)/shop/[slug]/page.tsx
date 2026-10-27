import { notFound } from 'next/navigation'
import ProductDetailClient from '@/components/shop/ProductDetailClient'
import { findShopProductBySlug, getShopCatalog, type ShopCatalogProduct, type ShopCatalogTrack } from '@/lib/marketing/shop-catalog'
import { findProductForCheckout, getExclusiveCatalog, isExclusiveProductId } from '@/lib/shop/member-catalog'
import { shopFormatPrices } from '@/lib/shop/format-prices'
import productsData from '@/data/products.json'

export const revalidate = 300

type PageProps = {
  params: { slug: string }
}

export async function generateStaticParams() {
  const { data } = await getShopCatalog()
  const items = [
    ...data.products.filter((p) => p.status !== 'inactive'),
    ...data.tracks,
  ]
  const exclusive = getExclusiveCatalog().map((item) => ({ slug: item.slug || item.id }))
  const merged = [...items.map((item) => ({ slug: item.slug || item.id })), ...exclusive]
  const seen = new Set<string>()
  return merged.filter((row) => {
    if (seen.has(row.slug)) return false
    seen.add(row.slug)
    return true
  })
}

export async function generateMetadata({ params }: PageProps) {
  const { data } = await getShopCatalog()
  const product = findShopProductBySlug(data, params.slug)
  if (!product) return { title: 'Product | SERGIK Shop' }
  return {
    title: `${product.title} | SERGIK Shop`,
    description: product.description,
  }
}

function findExclusiveProductBySlug(slug: string): ShopCatalogProduct | null {
  const normalized = slug.trim()
  const raw = productsData.products.find((p) => p.slug === normalized || p.id === normalized)
  if (!raw || !isExclusiveProductId(raw.id)) return null
  const product = findProductForCheckout(raw.id)
  if (!product) return null
  return {
    ...product,
    productType: 'ep-bundle',
    formatPrices: shopFormatPrices(Number(product.trackCount) || 1),
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const catalog = await getShopCatalog()
  const product: ShopCatalogProduct | ShopCatalogTrack | null =
    findShopProductBySlug(catalog.data, params.slug) ?? findExclusiveProductBySlug(params.slug)
  if (
    !product ||
    ('status' in product && product.status === 'inactive' && !isExclusiveProductId(String(product.id)))
  ) {
    notFound()
  }

  return <ProductDetailClient product={product} licenseTiers={catalog.data.licenseTiers} />
}
