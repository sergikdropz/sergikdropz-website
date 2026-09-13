import { NextResponse } from 'next/server'
import { getShopCatalog } from '@/lib/marketing/shop-catalog'

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
}

export async function GET() {
  try {
    const { data } = await getShopCatalog()
    const catalog = {
      products: data.products,
      tracks: data.tracks,
      licenseTiers: data.licenseTiers,
      categories: data.categories,
    }

    return NextResponse.json(catalog, { headers: CACHE_HEADERS })
  } catch (error: any) {
    console.error('Error loading shop catalog:', error)
    return NextResponse.json(
      { error: 'Failed to load catalog' },
      { status: 500 }
    )
  }
}
