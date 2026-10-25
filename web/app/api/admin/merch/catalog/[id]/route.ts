import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { fetchCatalogProductDetail } from '@/lib/merch/printful-catalog'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const productId = Number(context.params.id)
  if (!Number.isFinite(productId) || productId <= 0) {
    return NextResponse.json({ error: 'Invalid catalog product id' }, { status: 400 })
  }

  try {
    const detail = await fetchCatalogProductDetail(productId)
    if (!detail) {
      return NextResponse.json({ error: 'Product not found in Printful catalog' }, { status: 404 })
    }
    return NextResponse.json(detail)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not load catalog product'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
