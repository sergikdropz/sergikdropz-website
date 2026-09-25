import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import {
  applyPayout,
  formatUsdCents,
  readRoyaltyStore,
  writeRoyaltyStore,
} from '@/lib/studio/royalties'

export const dynamic = 'force-dynamic'

/** POST /api/studio/royalties/payouts — mark ledger entries paid for one payee */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const ledgerEntryIds: string[] = Array.isArray(body?.ledgerEntryIds)
      ? body.ledgerEntryIds.map(String)
      : []
    const paidVia = String(body?.paidVia || 'manual').trim() || 'manual'
    const notes = body?.notes != null ? String(body.notes) : null

    if (!ledgerEntryIds.length) {
      return NextResponse.json({ error: 'ledgerEntryIds required' }, { status: 400 })
    }

    const store = await readRoyaltyStore()
    const result = applyPayout({ store, ledgerEntryIds, paidVia, notes })
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    await writeRoyaltyStore(result.store)

    return NextResponse.json({
      ok: true,
      payout: result.payout,
      amountLabel: formatUsdCents(result.payout.amountCents, result.payout.currency),
    })
  } catch (error) {
    console.error('POST /api/studio/royalties/payouts:', error)
    return NextResponse.json({ error: 'Failed to record payout' }, { status: 500 })
  }
}
