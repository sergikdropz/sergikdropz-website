import { NextRequest, NextResponse } from 'next/server'
import { fetchAdminAiDigestSnapshot } from '@/lib/ai/digest'
import { deliverAdminAiDigestAndLog } from '@/lib/ai/digest-send-log'

export const dynamic = 'force-dynamic'

function isAuthorizedCron(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  return Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`
}

async function handleCron(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const digest = await fetchAdminAiDigestSnapshot()
    const delivery = await deliverAdminAiDigestAndLog({ trigger: 'cron', digest })

    return NextResponse.json({
      ok: true,
      delivered: delivery.delivered,
      ...(delivery.deliveryReason ? { deliveryReason: delivery.deliveryReason } : {}),
      generatedAt: digest.generatedAt,
      alerts: digest.alerts,
      summary: {
        pendingApprovals: digest.pendingApprovals,
        failedRuns7d: digest.failedRuns7d,
        completedRuns24h: digest.completedRuns24h,
        openAiTasks: digest.openAiTasks,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handleCron(req)
}

export async function POST(req: NextRequest) {
  return handleCron(req)
}
