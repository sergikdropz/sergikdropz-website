import { readFile } from 'fs/promises'
import { join } from 'path'
import { designToShopProduct, type ShopMerchProduct } from '@/lib/merch/design'
import { listDesigns } from '@/lib/merch/design-store'

export async function loadShopMerchProducts(): Promise<ShopMerchProduct[]> {
  let synced: ShopMerchProduct[] = []
  try {
    const raw = await readFile(join(process.cwd(), 'data', 'merch-products.json'), 'utf8')
    const merchData = JSON.parse(raw) as { products?: ShopMerchProduct[] }
    synced = Array.isArray(merchData.products) ? merchData.products : []
  } catch {
    synced = []
  }

  const designs = await listDesigns()
  const designed = designs
    .map((design) => designToShopProduct(design))
    .filter((product): product is ShopMerchProduct => Boolean(product))
  const slugs = new Set(designed.map((product) => product.slug))
  return [
    ...designed,
    ...synced.filter((product) => product?.slug && !slugs.has(product.slug)),
  ]
}
