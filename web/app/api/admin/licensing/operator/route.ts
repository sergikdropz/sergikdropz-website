import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { recordCopyrightOwner, recordStripeAccountCheck } from '@/lib/licensing/operator-facts'
import { readStripeAccountLegalName } from '@/lib/licensing/stripe-account'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response
  try {
    const body = (await request.json()) as { action?: string; owner?: string }
    if (body.action === 'owner') {
      if (body.owner !== 'llc' && body.owner !== 'personal') {
        return NextResponse.json({ error: 'Choose the LLC or the songwriter personally.' }, { status: 400 })
      }
      await recordCopyrightOwner(body.owner)
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'stripe') {
      const account = await readStripeAccountLegalName()
      if (!account.livemode) {
        return NextResponse.json(
          {
            error: `This server is using a Stripe sandbox (${account.name || 'unnamed'}). Run the check on the live site so the saved name is the account that charges clients.`,
          },
          { status: 400 },
        )
      }
      await recordStripeAccountCheck(account.name, account.matches)
      return NextResponse.json({ ok: true, name: account.name, matches: account.matches })
    }
    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save the licensing fact.' },
      { status: 400 },
    )
  }
}
