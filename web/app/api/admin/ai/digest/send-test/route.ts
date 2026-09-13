import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { fetchAdminAiDigestSnapshot } from '@/lib/ai/digest'
import { deliverAdminAiDigestAndLog } from '@/lib/ai/digest-send-log'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const digest = await fetchAdminAiDigestSnapshot()
    const delivery = await deliverAdminAiDigestAndLog({
      trigger: 'manual_test',
      digest,
      createdBy: session.user.id,
    })

    return NextResponse.json({
      ok: true,
      delivered: delivery.delivered,
      ...(delivery.deliveryReason ? { deliveryReason: delivery.deliveryReason } : {}),
      generatedAt: digest.generatedAt,
      alerts: digest.alerts,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
