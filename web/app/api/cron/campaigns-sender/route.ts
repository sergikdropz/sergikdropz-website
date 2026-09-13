/**
 * Campaign Sender Cron Endpoint
 * 
 * Purpose: Send queued campaign emails via Resend
 * 
 * Protected by: CRON_SECRET environment variable
 * Recommended run frequency: Every 5 minutes
 * 
 * Example cron job:
 * POST https://yourdomain.com/api/cron/campaigns-sender
 * Header: Authorization: Bearer YOUR_CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendQueuedCampaignEmails } from '@/lib/supabase/workers/campaign-scheduler'

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get batch size from query param (default 100)
    const url = new URL(req.url)
    const batchSize = parseInt(url.searchParams.get('batch') || '100', 10)

    const result = await sendQueuedCampaignEmails(batchSize)

    return NextResponse.json({
      ...result,
      message: `Sent ${result.sent} email(s), Failed ${result.failed || 0}`,
    })
  } catch (error) {
    console.error('[Cron] Campaign sender error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
