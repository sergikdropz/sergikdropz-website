import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireFanMembership } from '@/lib/require-fan-membership'
import { findActiveMembershipRow } from '@/lib/membership-queries'
import { entitlementsForPlan } from '@/lib/membership/entitlements'
import { isMemberIncludedProductId } from '@/lib/shop/member-catalog'
import { consumeMemberDownloadQuota, parseFormat } from '@/lib/shop/member-download-quota'
import { insertEpBundlePurchase } from '@/lib/shop/fulfill-digital-purchase'
import productsData from '@/data/products.json'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFanMembership(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const productId = String(body.productId || '').trim()
    const format = parseFormat(body.format)
    if (!productId || !format) {
      return NextResponse.json({ error: 'productId and format (MP3 or WAV) required' }, { status: 400 })
    }
    if (!isMemberIncludedProductId(productId)) {
      return NextResponse.json({ error: 'This release is not in the member vault picks list' }, { status: 400 })
    }

    const product = productsData.products.find((p) => p.id === productId)
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const supabase = createSupabaseServerClient()
    const membership = await findActiveMembershipRow(supabase, {
      userId: auth.session.user.id,
      email: auth.session.user.email ?? null,
    })
    const entitlements = entitlementsForPlan(membership?.plan_id)
    if (!entitlements?.canAccessMemberDownloads || !membership?.current_period_end) {
      return NextResponse.json({ error: 'Active Supporter or Inner Circle membership required' }, { status: 403 })
    }

    const periodEnd = membership.current_period_end
    const periodStart =
      membership.current_period_start ||
      new Date(new Date(periodEnd).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const trackCount = Number(product.trackCount) || 1

    const consumed = await consumeMemberDownloadQuota(supabase, {
      userId: auth.session.user.id,
      entitlements,
      periodStart,
      periodEnd,
      format,
      trackCount,
    })
    if (!consumed.ok) {
      return NextResponse.json({ error: consumed.reason || 'Monthly download limit reached' }, { status: 429 })
    }

    const sessionId = `mq_${randomUUID()}`
    await insertEpBundlePurchase(supabase, {
      sessionId,
      productId,
      format,
      releaseId: product.release_id || undefined,
      customerEmail: auth.session.user.email ?? null,
      customerName: null,
      amountPaidCents: 0,
      userId: auth.session.user.id,
      productType: 'member-quota',
    })

    return NextResponse.json({
      sessionId,
      downloadPath: `/download/order?session_id=${encodeURIComponent(sessionId)}`,
    })
  } catch (e) {
    console.error('POST /api/shop/member-download', e)
    return NextResponse.json({ error: 'Member download failed' }, { status: 500 })
  }
}
