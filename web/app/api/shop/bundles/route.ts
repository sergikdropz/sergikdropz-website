import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const bundlesData = await import('@/data/bundles.json')
    return NextResponse.json({
      bundles: bundlesData.bundles.filter((b: any) => b.status === 'active'),
    })
  } catch (error: any) {
    console.error('Error loading bundles:', error)
    return NextResponse.json({ bundles: [] })
  }
}
