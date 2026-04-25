import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const merchData = await import('@/data/merch-products.json')
    return NextResponse.json({
      products: merchData.products || [],
      categories: merchData.categories || [],
    })
  } catch (error: any) {
    console.error('Error loading merch products:', error)
    return NextResponse.json({ products: [], categories: [] })
  }
}
