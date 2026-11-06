import { NextRequest, NextResponse } from 'next/server'
import { findMerchDiscount, quoteMerchDiscount } from '@/lib/merch/discount'
import { readMerchDiscounts } from '@/lib/merch/discount-store'
import { checkRateLimitAsync, clientKeyFromRequest } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const limit = await checkRateLimitAsync(`merch-discount:${clientKeyFromRequest(request)}`, 30, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Wait a moment and try that code again.' }, { status: 429 })
  }

  let body: { code?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Enter a discount code.' }, { status: 400 })
  }

  const found = findMerchDiscount(await readMerchDiscounts(), String(body.code || ''))
  if (!found) {
    return NextResponse.json({ error: "That code doesn't apply." }, { status: 400 })
  }
  const quote = quoteMerchDiscount([100], found)
  if ('error' in quote) {
    return NextResponse.json({ error: quote.error }, { status: 400 })
  }

  return NextResponse.json({
    discount: {
      code: found.code,
      label: found.label,
      type: found.type,
      value: found.value,
      expiresAt: found.expiresAt,
    },
  })
}
