import { getShopCatalog } from '@/lib/marketing/shop-catalog'
import ShopPageClient from './ShopPageClient'

export const revalidate = 300

export default async function ShopPage() {
  const catalog = await getShopCatalog()
  return <ShopPageClient {...catalog} />
}
