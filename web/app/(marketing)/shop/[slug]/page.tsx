import { notFound } from 'next/navigation'
import ProductDetailClient from '@/components/shop/ProductDetailClient'
import { findShopProductBySlug, getShopCatalog } from '@/lib/marketing/shop-catalog'

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
  return items.map((item) => ({ slug: item.slug || item.id }))
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

export default async function ProductDetailPage({ params }: PageProps) {
  const catalog = await getShopCatalog()
  const product = findShopProductBySlug(catalog.data, params.slug)
  if (!product || ('status' in product && product.status === 'inactive')) notFound()

  return <ProductDetailClient product={product} licenseTiers={catalog.data.licenseTiers} />
}
