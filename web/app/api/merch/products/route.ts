import { NextResponse } from 'next/server'
import { SHOP_CATEGORIES } from '@/lib/merch/shop-categories'
import { readShopBackdropSetting } from '@/lib/merch/shop-backdrop-store'
import { loadShopMerchProducts } from '@/lib/merch/shop-catalog'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const products = await loadShopMerchProducts()
    const backdrop = await readShopBackdropSetting()
    return NextResponse.json({ products, categories: SHOP_CATEGORIES, backdrop })
  } catch (error: any) {
    console.error('Error loading merch products:', error)
    return NextResponse.json({ products: [], categories: SHOP_CATEGORIES, backdrop: { color: '#ffffff', opacity: 1 } })
  }
}
