/**
 * Nurturing Analytics API
 * 
 * Purpose: Aggregate stats across fans, smart links, and campaigns
 * Returns: Key metrics for dashboard visualization
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../supabase-service'

export async function GET(req: NextRequest) {
  try {
    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    // Verify admin
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const timeRange = url.searchParams.get('timeRange') || 'month'

    // Calculate date filter
    const now = new Date()
    let dateFilter: string | null = null

    if (timeRange === 'week') {
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    } else if (timeRange === 'month') {
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    }

    // 1. Total fans & superfans
    let fansQuery = supabase.from('fans').select('id, is_superfan', { count: 'exact' })
    if (dateFilter) {
      fansQuery = fansQuery.gte('created_at', dateFilter)
    }

    const { data: fansData, count: totalFans } = await fansQuery
    const totalSuperFans = fansData?.filter((f: any) => f.is_superfan).length || 0

    // 2. Smart links stats
    const { data: linksData, count: totalSmartLinks } = await supabase
      .from('smartlinks')
      .select('id, total_clicks, unique_clicks', { count: 'exact' })

    const totalLinkClicks = linksData?.reduce((sum: number, link: any) => sum + (link.total_clicks || 0), 0) || 0

    // 3. Campaign stats
    const { data: campaignsData, count: totalCampaigns } = await supabase
      .from('campaigns')
      .select('id, status, total_sent, total_opened, total_clicked', { count: 'exact' })

    const campaignsSent = campaignsData?.filter((c: any) => c.status === 'sent').length || 0
    const totalEmailsSent = campaignsData?.reduce((sum: number, c: any) => sum + (c.total_sent || 0), 0) || 0
    const totalOpens = campaignsData?.reduce((sum: number, c: any) => sum + (c.total_opened || 0), 0) || 0
    const totalClicks = campaignsData?.reduce((sum: number, c: any) => sum + (c.total_clicked || 0), 0) || 0

    const avgOpenRate = totalEmailsSent > 0 ? (totalOpens / totalEmailsSent) * 100 : 0
    const avgClickRate = totalEmailsSent > 0 ? (totalClicks / totalEmailsSent) * 100 : 0

    // 4. Top campaigns (by opens)
    const topCampaigns = campaignsData
      ?.sort((a: any, b: any) => (b.total_opened || 0) - (a.total_opened || 0))
      .slice(0, 5) || []

    // 5. Top smart links (by clicks)
    const topSmartLinks = linksData
      ?.sort((a: any, b: any) => (b.total_clicks || 0) - (a.total_clicks || 0))
      .slice(0, 5)
      .map((link: any) => ({
        id: link.id,
        slug: '', // Will populate from smartlinks detail query
        title: '',
        total_clicks: link.total_clicks,
        unique_clicks: link.unique_clicks,
      })) || []

    // Get slug/title details for top links
    if (topSmartLinks.length > 0) {
      const { data: linkDetails } = await supabase
        .from('smartlinks')
        .select('id, slug, title')
        .in(
          'id',
          topSmartLinks.map((l: any) => l.id)
        )

      linkDetails?.forEach((detail: any) => {
        const linkIdx = topSmartLinks.findIndex((l: any) => l.id === detail.id)
        if (linkIdx >= 0) {
          topSmartLinks[linkIdx].slug = detail.slug
          topSmartLinks[linkIdx].title = detail.title
        }
      })
    }

    // 6. Recent fans
    let recentFansQuery = supabase
      .from('fans')
      .select('id, email, name, source, is_superfan, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (dateFilter) {
      recentFansQuery = recentFansQuery.gte('created_at', dateFilter)
    }

    const { data: recentFans } = await recentFansQuery

    return NextResponse.json({
      totalFans: totalFans || 0,
      totalSuperFans,
      totalSmartLinks: totalSmartLinks || 0,
      totalCampaigns: totalCampaigns || 0,
      campaignsSent,
      totalEmailsSent,
      totalOpens,
      totalClicks,
      avgOpenRate,
      avgClickRate,
      topCampaigns: topCampaigns.slice(0, 5),
      topSmartLinks: topSmartLinks.slice(0, 5),
      recentFans: recentFans || [],
    })
  } catch (error) {
    console.error('[Analytics] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
