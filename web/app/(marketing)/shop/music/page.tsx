import type { Metadata } from 'next'
import { getShopCatalog } from '@/lib/marketing/shop-catalog'
import { getExclusiveCatalog, getMemberIncludedCatalog } from '@/lib/shop/member-catalog'
import MusicShopPageClient from '../MusicShopPageClient'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Music Shop | SERGIK',
  description:
    'Buy EP downloads, beats, and bundles from SERGIK. Member credits, vault picks, exclusives, and Stripe checkout.',
}

export default async function MusicShopPage() {
  const catalog = await getShopCatalog()
  return (
    <MusicShopPageClient
      {...catalog}
      memberIncluded={getMemberIncludedCatalog()}
      exclusiveCatalog={getExclusiveCatalog()}
    />
  )
}
