import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireFanAuth } from '@/lib/require-fan-membership'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireFanAuth(request)
  if (!gate.ok) return gate.response
  const { session } = gate

  try {
    const supabase = createSupabaseServerClient()
    const email = session.user.email?.toLowerCase()

    const { data: byUser, error: e1 } = await supabase
      .from('purchases')
      .select(
        'id,stripe_session_id,track_id,track_title,format,product_type,amount_paid,currency,purchased_at,customer_email'
      )
      .eq('user_id', session.user.id)
      .order('purchased_at', { ascending: false })
      .limit(200)

    if (!e1 && byUser && byUser.length > 0) {
      return NextResponse.json({ purchases: byUser })
    }

    if (!email) {
      return NextResponse.json({ purchases: [] })
    }

    const { data: byEmail, error: e2 } = await supabase
      .from('purchases')
      .select(
        'id,stripe_session_id,track_id,track_title,format,product_type,amount_paid,currency,purchased_at,customer_email'
      )
      .eq('customer_email', email)
      .order('purchased_at', { ascending: false })
      .limit(200)

    if (e2) {
      console.error('fan purchases:', e2)
      return NextResponse.json({ purchases: [] })
    }

    return NextResponse.json({ purchases: byEmail || [] })
  } catch (e) {
    console.error('GET /api/fan/purchases', e)
    return NextResponse.json({ purchases: [] })
  }
}
