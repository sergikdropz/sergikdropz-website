import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { parseMerchDiscounts } from '@/lib/merch/discount'
import { readMerchDiscounts, writeMerchDiscounts } from '@/lib/merch/discount-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const codes = await readMerchDiscounts()
  return NextResponse.json({ codes })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: { codes?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid discount list' }, { status: 400 })
  }

  const incoming = Array.isArray(body.codes) ? body.codes : []
  const codes = parseMerchDiscounts(incoming)
  if (codes.length !== incoming.length) {
    return NextResponse.json(
      { error: 'Each code needs 2–32 letters or numbers, and a percent from 1 to 100 or a dollar amount.' },
      { status: 400 },
    )
  }
  const saved = await writeMerchDiscounts(codes)
  return NextResponse.json({ codes: saved })
}
