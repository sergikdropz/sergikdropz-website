import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { reorderDesigns } from '@/lib/merch/design-store'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? body.ids.map((id: unknown) => String(id)).filter(Boolean) : []
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Choose an order' }, { status: 400 })
  }

  try {
    const designs = await reorderDesigns(ids)
    return NextResponse.json({ designs })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
