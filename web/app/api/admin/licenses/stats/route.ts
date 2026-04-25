import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/licenses/stats
 * License analytics: total, revenue by tier, active/expired
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('licenses')
      .select('id, tier, amount_paid, status, created_at')

    if (error) {
      console.error('Error fetching license stats:', error)
      return NextResponse.json(
        { error: 'Failed to fetch license statistics' },
        { status: 500 }
      )
    }

    const licenses = data || []
    const totalLicenses = licenses.length
    const totalRevenue = licenses.reduce((sum, l) => sum + (l.amount_paid || 0), 0) / 100
    const activeLicenses = licenses.filter((l) => l.status === 'active').length
    const expiredLicenses = licenses.filter((l) => l.status === 'expired').length

    // Revenue by tier
    const revenueByTier: Record<string, { count: number; revenue: number }> = {}
    licenses.forEach((l) => {
      const tier = l.tier || 'unknown'
      if (!revenueByTier[tier]) {
        revenueByTier[tier] = { count: 0, revenue: 0 }
      }
      revenueByTier[tier].count += 1
      revenueByTier[tier].revenue += (l.amount_paid || 0) / 100
    })

    // Find top tier by revenue
    let topTier = { tier: 'N/A', revenue: 0 }
    Object.entries(revenueByTier).forEach(([tier, data]) => {
      if (data.revenue > topTier.revenue) {
        topTier = { tier, revenue: data.revenue }
      }
    })

    return NextResponse.json({
      summary: {
        totalLicenses,
        totalRevenue,
        activeLicenses,
        expiredLicenses,
        topTier,
      },
      revenueByTier,
    })
  } catch (error: any) {
    console.error('License stats API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
