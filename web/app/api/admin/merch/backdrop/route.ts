import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { parseShopBackdrop } from '@/lib/merch/shop-backdrop'
import { writeShopBackdropSetting } from '@/lib/merch/shop-backdrop-store'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  const backdrop = parseShopBackdrop(body)
  if (!body || typeof body !== 'object' || typeof (body as { color?: unknown }).color !== 'string') {
    return NextResponse.json({ error: 'Pick a backdrop color' }, { status: 400 })
  }

  const saved = await writeShopBackdropSetting(backdrop)
  return NextResponse.json({ backdrop: saved })
}
