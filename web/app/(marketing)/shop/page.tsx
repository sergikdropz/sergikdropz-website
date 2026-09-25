import type { Metadata } from 'next'
import { getShopCatalog } from '@/lib/marketing/shop-catalog'
import ShopPageClient from './ShopPageClient'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Shop | SERGIK',
  description:
    'Buy EP downloads, beats, and tools directly from SERGIK. Secure checkout, fan membership, bundles, and optional tips.',
}

export default async function ShopPage() {
  const catalog = await getShopCatalog()
  return <ShopPageClient {...catalog} />
}
