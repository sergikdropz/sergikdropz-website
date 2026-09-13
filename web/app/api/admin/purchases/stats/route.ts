import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/purchases/stats
 * Get revenue statistics (admin-only)
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    const supabase = createSupabaseServerClient()

    // Build base query
    let query = supabase
      .from('purchases')
      .select('amount_paid, currency, purchased_at, download_count, track_id, track_title')

    if (startDate) {
      query = query.gte('purchased_at', startDate)
    }

    if (endDate) {
      query = query.lte('purchased_at', endDate)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching purchase stats:', error)
      return NextResponse.json(
        { error: 'Failed to fetch statistics' },
        { status: 500 }
      )
    }

    // Calculate statistics
    const purchases = data || []
    const totalRevenue = purchases.reduce((sum, p) => sum + (p.amount_paid || 0), 0)
    const totalRevenueUSD = totalRevenue / 100 // Convert cents to dollars
    const totalPurchases = purchases.length
    const totalDownloads = purchases.reduce((sum, p) => sum + (p.download_count || 0), 0)
    const averageOrderValue = totalPurchases > 0 ? totalRevenueUSD / totalPurchases : 0

    // Group by date for time series
    const revenueByDate: Record<string, number> = {}
    purchases.forEach((p) => {
      const date = new Date(p.purchased_at).toISOString().split('T')[0]
      revenueByDate[date] = (revenueByDate[date] || 0) + (p.amount_paid || 0) / 100
    })

    // Group by track
    const revenueByTrack: Record<string, { revenue: number; count: number; title: string }> = {}
    purchases.forEach((p) => {
      const trackId = p.track_id || 'unknown'
      if (!revenueByTrack[trackId]) {
        revenueByTrack[trackId] = { revenue: 0, count: 0, title: p.track_title || 'Unknown' }
      }
      revenueByTrack[trackId].revenue += (p.amount_paid || 0) / 100
      revenueByTrack[trackId].count += 1
    })

    const topTracks = Object.entries(revenueByTrack)
      .map(([trackId, data]) => ({ trackId, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    return NextResponse.json({
      summary: {
        totalRevenue: totalRevenueUSD,
        totalPurchases,
        totalDownloads,
        averageOrderValue,
      },
      revenueByDate,
      topTracks,
    })
  } catch (error: any) {
    console.error('Purchase stats API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
