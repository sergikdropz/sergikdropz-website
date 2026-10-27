import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireFanAuth } from '@/lib/require-fan-membership'
import { loadShopMemberBenefits } from '@/lib/shop/member-benefits'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFanAuth(request)
  if (!auth.ok) return auth.response

  try {
    const supabase = createSupabaseServerClient()
    const benefits = await loadShopMemberBenefits(supabase, {
      userId: auth.session.user.id,
      email: auth.session.user.email ?? null,
    })
    return NextResponse.json(benefits)
  } catch (e) {
    console.error('GET /api/shop/entitlements', e)
    return NextResponse.json({ error: 'Could not load shop benefits' }, { status: 500 })
  }
}
