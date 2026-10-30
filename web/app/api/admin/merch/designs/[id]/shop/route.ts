import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { getDesign, saveDesign } from '@/lib/merch/design-store'
import { isShopCategory } from '@/lib/merch/shop-categories'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const design = await getDesign(params.id)
  if (!design) return NextResponse.json({ error: 'Design not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!isShopCategory(body?.category)) {
    return NextResponse.json({ error: 'Pick a shop category' }, { status: 400 })
  }

  const saved = await saveDesign({
    ...design,
    shopCategory: body.category,
    updatedAt: new Date().toISOString(),
  })

  return NextResponse.json(saved)
}
