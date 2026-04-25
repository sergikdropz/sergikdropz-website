import { NextResponse } from 'next/server'

/**
 * GET /api/instagram/cron
 * 
 * Cron job endpoint for automatically refreshing Instagram posts
 * Can be called by:
 * - Vercel Cron Jobs
 * - External cron services (cron-job.org, EasyCron, etc.)
 * - GitHub Actions
 * 
 * Set up in vercel.json or call this endpoint on a schedule
 */
export async function GET(request: Request) {
  // Verify this is a cron request (optional security)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.INSTAGRAM_CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // Call the refresh endpoint internally
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                   request.headers.get('host') ? 
                   `https://${request.headers.get('host')}` : 
                   'http://localhost:3000'
    
    const refreshResponse = await fetch(`${baseUrl}/api/instagram/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const refreshData = await refreshResponse.json()

    if (!refreshResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: refreshData.error || 'Failed to refresh posts',
          details: refreshData
        },
        { status: refreshResponse.status }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Instagram posts refreshed successfully',
      data: refreshData,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Cron job failed',
        details: error.message
      },
      { status: 500 }
    )
  }
}

