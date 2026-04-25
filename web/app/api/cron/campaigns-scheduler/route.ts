/**
 * Campaign Scheduler Cron Endpoint
 * 
 * Purpose: Discover campaigns ready to send and create campaign_sends records
 * 
 * Protected by: CRON_SECRET environment variable
 * Recommended run frequency: Every 1 minute
 * 
 * Example cron job (using EasyCron or similar):
 * POST https://yourdomain.com/api/cron/campaigns-scheduler
 * Header: Authorization: Bearer YOUR_CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { scheduleCampaignSends } from '@/lib/supabase/workers/campaign-scheduler'

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await scheduleCampaignSends()

    return NextResponse.json({
      ...result,
      message: `Processed ${result.campaignsSent} campaign(s), queued ${result.totalSends} send(s)`,
    })
  } catch (error) {
    console.error('[Cron] Campaign scheduler error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
