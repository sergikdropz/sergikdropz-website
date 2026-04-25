import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const products = await import('@/data/products.json')
    const purchasableTracks = await import('@/data/purchasable-tracks.json')
    const licenseTiers = await import('@/data/license-tiers.json')

    const catalog = {
      products: products.products.map((p: any) => ({
        ...p,
        productType: 'ep-bundle',
      })),
      tracks: purchasableTracks.tracks.map((t: any) => ({
        ...t,
        productType: 'track',
      })),
      licenseTiers: licenseTiers.tiers,
      categories: products.categories,
    }

    return NextResponse.json(catalog)
  } catch (error: any) {
    console.error('Error loading shop catalog:', error)
    return NextResponse.json(
      { error: 'Failed to load catalog' },
      { status: 500 }
    )
  }
}
