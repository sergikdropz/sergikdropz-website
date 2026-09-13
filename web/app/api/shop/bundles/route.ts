import { NextResponse } from 'next/server'

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
}

export async function GET() {
  try {
    const bundlesData = await import('@/data/bundles.json')
    return NextResponse.json(
      {
        bundles: bundlesData.bundles.filter((b: any) => b.status === 'active'),
      },
      { headers: CACHE_HEADERS },
    )
  } catch (error: any) {
    console.error('Error loading bundles:', error)
    return NextResponse.json({ bundles: [] })
  }
}
