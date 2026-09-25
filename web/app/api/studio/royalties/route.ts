import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import {
  formatUsdCents,
  readRoyaltyStore,
  royaltyOpsSignals,
  summarizePayeeLedger,
  writeRoyaltyStore,
  resolveOrCreatePayee,
} from '@/lib/studio/royalties'

export const dynamic = 'force-dynamic'

/** GET /api/studio/royalties — overview: payees, statements, ledger, payouts */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const store = await readRoyaltyStore()
    const payeeSummary = summarizePayeeLedger(store.ledger, store.payees)
    const signals = royaltyOpsSignals(store)

    return NextResponse.json({
      signals,
      payees: store.payees,
      payeeSummary,
      statements: store.statements,
      ledger: store.ledger.slice(0, 500),
      payouts: store.payouts,
      totals: {
        owedLabel: formatUsdCents(
          payeeSummary.filter((p) => !p.isLabelEntity).reduce((s, p) => s + p.owedCents, 0),
        ),
        paidLabel: formatUsdCents(
          payeeSummary.filter((p) => !p.isLabelEntity).reduce((s, p) => s + p.paidCents, 0),
        ),
        labelRetainLabel: formatUsdCents(
          payeeSummary.find((p) => p.isLabelEntity)?.owedCents || 0,
        ),
      },
      updatedAt: store.updatedAt,
    })
  } catch (error) {
    console.error('GET /api/studio/royalties:', error)
    return NextResponse.json({ error: 'Failed to load royalty ops' }, { status: 500 })
  }
}

/** POST /api/studio/royalties — create/update a payee */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    const store = await readRoyaltyStore()
    const resolved = resolveOrCreatePayee(store.payees, name, {
      email: body?.email ?? null,
      paymentMethod: body?.paymentMethod ?? null,
    })

    let payees = resolved.payees
    if (!resolved.created) {
      payees = payees.map((p) =>
        p.id === resolved.payee.id
          ? {
              ...p,
              email: body?.email !== undefined ? body.email : p.email,
              paymentMethod:
                body?.paymentMethod !== undefined ? body.paymentMethod : p.paymentMethod,
              notes: body?.notes !== undefined ? body.notes : p.notes,
              updatedAt: new Date().toISOString(),
            }
          : p,
      )
    } else if (body?.notes) {
      payees = payees.map((p) =>
        p.id === resolved.payee.id ? { ...p, notes: String(body.notes) } : p,
      )
    }

    const next = { ...store, payees, updatedAt: new Date().toISOString() }
    await writeRoyaltyStore(next)

    return NextResponse.json({
      payee: payees.find((p) => p.id === resolved.payee.id),
      created: resolved.created,
    })
  } catch (error) {
    console.error('POST /api/studio/royalties:', error)
    return NextResponse.json({ error: 'Failed to save payee' }, { status: 500 })
  }
}
