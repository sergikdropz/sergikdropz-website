import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { getDesign, saveDesign } from '@/lib/merch/design-store'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const design = await getDesign(params.id)
  if (!design) return NextResponse.json({ error: 'Design not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const status = body?.status === 'live' ? 'live' : 'hidden'
  if (status === 'live' && design.placements.length === 0) {
    return NextResponse.json({ error: 'Add art before making this public' }, { status: 400 })
  }

  const saved = await saveDesign({
    ...design,
    status,
    publishNote:
      status === 'live'
        ? design.variants.some((variant) => variant.syncVariantId > 0)
          ? 'Public on the merch shop.'
          : 'Public as a preview. Buying stays off until Printful has the product.'
        : 'Hidden from the shop.',
    updatedAt: new Date().toISOString(),
  })

  return NextResponse.json(saved)
}
