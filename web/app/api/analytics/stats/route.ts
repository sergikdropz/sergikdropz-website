import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/stats
 * Get aggregated statistics (admin-only)
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

    // Build base query - include session_id for engagement metrics
    let query = supabase
      .from('analytics_events')
      .select('event_type, event_data, created_at, session_id, user_id')

    if (startDate) {
      query = query.gte('created_at', startDate)
    }

    if (endDate) {
      query = query.lte('created_at', endDate)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching analytics stats:', error)
      return NextResponse.json(
        { error: 'Failed to fetch statistics' },
        { status: 500 }
      )
    }

    const events = data || []

    // Calculate statistics
    const stats = {
      totalEvents: events.length,
      pageViews: events.filter((e) => e.event_type === 'page_view').length,
      trackPlays: events.filter((e) => e.event_type === 'track_play').length,
      downloads: events.filter((e) => e.event_type === 'download').length,
      purchases: events.filter((e) => e.event_type === 'purchase').length,
    }

    // Calculate revenue from purchase events
    let totalRevenue = 0
    events
      .filter((e) => e.event_type === 'purchase')
      .forEach((e) => {
        const amount = e.event_data?.amount || 0
        totalRevenue += amount
      })

    // Group by date for time series
    const eventsByDate: Record<string, Record<string, number>> = {}
    events.forEach((event) => {
      const date = new Date(event.created_at).toISOString().split('T')[0]
      if (!eventsByDate[date]) {
        eventsByDate[date] = {}
      }
      eventsByDate[date][event.event_type] = (eventsByDate[date][event.event_type] || 0) + 1
    })

    // Get top tracks (from track_play events)
    const trackPlays: Record<string, number> = {}
    events
      .filter((e) => e.event_type === 'track_play')
      .forEach((e) => {
        const trackId = e.event_data?.trackId || e.event_data?.track_id || 'unknown'
        trackPlays[trackId] = (trackPlays[trackId] || 0) + 1
      })

    const topTracks = Object.entries(trackPlays)
      .map(([trackId, count]) => ({ trackId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Get top pages (from page_view events)
    const pageViews: Record<string, number> = {}
    events
      .filter((e) => e.event_type === 'page_view')
      .forEach((e) => {
        const path = e.event_data?.path || e.event_data?.url || 'unknown'
        pageViews[path] = (pageViews[path] || 0) + 1
      })

    const topPages = Object.entries(pageViews)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Calculate engagement metrics
    const sessionStarts = events.filter((e) => e.event_type === 'session_start')
    const sessionEnds = events.filter((e) => e.event_type === 'session_end')
    const timeOnPageEvents = events.filter((e) => e.event_type === 'time_on_page')

    // Group page views by session
    const pageViewsBySession: Record<string, number> = {}
    events
      .filter((e) => e.event_type === 'page_view' && e.session_id)
      .forEach((e) => {
        const sessionId = e.session_id || 'unknown'
        pageViewsBySession[sessionId] = (pageViewsBySession[sessionId] || 0) + 1
      })

    // Calculate bounce rate (sessions with only 1 page view)
    const totalSessions = Object.keys(pageViewsBySession).length
    const bouncedSessions = Object.values(pageViewsBySession).filter((count) => count === 1).length
    const bounceRate = totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0

    // Calculate average pages per session
    const totalPageViewsInSessions = Object.values(pageViewsBySession).reduce((sum, count) => sum + count, 0)
    const avgPagesPerSession = totalSessions > 0 ? totalPageViewsInSessions / totalSessions : 0

    // Calculate average session duration
    const sessionDurations: number[] = []
    sessionEnds.forEach((endEvent) => {
      const duration = endEvent.event_data?.duration || 0
      if (duration > 0) {
        sessionDurations.push(duration)
      }
    })
    const avgSessionDuration = sessionDurations.length > 0
      ? sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length
      : 0

    // Calculate average time on page
    const timeOnPageDurations: number[] = []
    timeOnPageEvents.forEach((event) => {
      const duration = event.event_data?.duration || 0
      if (duration > 0) {
        timeOnPageDurations.push(duration)
      }
    })
    const avgTimeOnPage = timeOnPageDurations.length > 0
      ? timeOnPageDurations.reduce((sum, d) => sum + d, 0) / timeOnPageDurations.length
      : 0

    // Calculate return vs new visitors (based on unique sessions with user_id)
    const sessionsWithUsers = new Set<string>()
    const sessionsWithoutUsers = new Set<string>()
    events.forEach((e) => {
      if (e.session_id) {
        if (e.user_id) {
          sessionsWithUsers.add(e.session_id)
        } else {
          sessionsWithoutUsers.add(e.session_id)
        }
      }
    })
    const returnVisitors = sessionsWithUsers.size
    const newVisitors = sessionsWithoutUsers.size
    const totalVisitors = returnVisitors + newVisitors
    const returnVisitorRate = totalVisitors > 0 ? (returnVisitors / totalVisitors) * 100 : 0

    // Calculate engagement rate (sessions with track plays, downloads, or purchases)
    const engagedSessions = new Set<string>()
    events
      .filter((e) => 
        (e.event_type === 'track_play' || e.event_type === 'download' || e.event_type === 'purchase') &&
        e.session_id
      )
      .forEach((e) => {
        if (e.session_id) {
          engagedSessions.add(e.session_id)
        }
      })
    const engagementRate = totalSessions > 0 ? (engagedSessions.size / totalSessions) * 100 : 0

    // Calculate traffic sources
    const sources: Record<string, number> = {}
    const referrers: Record<string, number> = {}
    events
      .filter((e) => e.event_type === 'page_view' || e.event_type === 'session_start')
      .forEach((e) => {
        const source = e.event_data?.source || 'direct'
        sources[source] = (sources[source] || 0) + 1

        const referrer = e.event_data?.referrer || e.event_data?.referrerDomain
        if (referrer) {
          try {
            const referrerUrl = new URL(referrer)
            const domain = referrerUrl.hostname.replace('www.', '')
            referrers[domain] = (referrers[domain] || 0) + 1
          } catch {
            // If referrer is already a domain, use it directly
            const domain = referrer.replace('www.', '')
            referrers[domain] = (referrers[domain] || 0) + 1
          }
        }
      })

    const topSources = Object.entries(sources)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    const topReferrers = Object.entries(referrers)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    // Calculate visitor locations
    const countries: Record<string, number> = {}
    const cities: Record<string, number> = {}
    const regions: Record<string, number> = {}
    
    events
      .filter((e) => e.event_type === 'page_view' || e.event_type === 'session_start')
      .forEach((e) => {
        const location = e.event_data?.location
        if (location) {
          if (location.country) {
            countries[location.country] = (countries[location.country] || 0) + 1
          }
          if (location.city) {
            const cityKey = location.country 
              ? `${location.city}, ${location.country}` 
              : location.city
            cities[cityKey] = (cities[cityKey] || 0) + 1
          }
          if (location.region) {
            const regionKey = location.country
              ? `${location.region}, ${location.country}`
              : location.region
            regions[regionKey] = (regions[regionKey] || 0) + 1
          }
        }
      })

    const topCountries = Object.entries(countries)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    const topCities = Object.entries(cities)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    const topRegions = Object.entries(regions)
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    // Calculate device and browser statistics
    const deviceTypes: Record<string, number> = {}
    const browsers: Record<string, number> = {}
    const operatingSystems: Record<string, number> = {}
    
    events
      .filter((e) => e.event_type === 'page_view' || e.event_type === 'session_start')
      .forEach((e) => {
        const device = e.event_data?.device
        if (device) {
          if (device.deviceType) {
            deviceTypes[device.deviceType] = (deviceTypes[device.deviceType] || 0) + 1
          }
          if (device.browser) {
            browsers[device.browser] = (browsers[device.browser] || 0) + 1
          }
          if (device.os) {
            operatingSystems[device.os] = (operatingSystems[device.os] || 0) + 1
          }
        }
      })

    const topDeviceTypes = Object.entries(deviceTypes)
      .map(([deviceType, count]) => ({ deviceType, count }))
      .sort((a, b) => b.count - a.count)

    const topBrowsers = Object.entries(browsers)
      .map(([browser, count]) => ({ browser, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const topOperatingSystems = Object.entries(operatingSystems)
      .map(([os, count]) => ({ os, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return NextResponse.json({
      summary: {
        ...stats,
        totalRevenue,
      },
      engagement: {
        totalSessions,
        avgSessionDuration: Math.round(avgSessionDuration), // in seconds
        avgPagesPerSession: Math.round(avgPagesPerSession * 100) / 100, // rounded to 2 decimals
        bounceRate: Math.round(bounceRate * 100) / 100, // percentage
        avgTimeOnPage: Math.round(avgTimeOnPage), // in seconds
        returnVisitors,
        newVisitors,
        returnVisitorRate: Math.round(returnVisitorRate * 100) / 100, // percentage
        engagedSessions: engagedSessions.size,
        engagementRate: Math.round(engagementRate * 100) / 100, // percentage
      },
      traffic: {
        sources: topSources,
        topReferrers,
      },
      locations: {
        topCountries,
        topCities,
        topRegions,
      },
      technology: {
        deviceTypes: topDeviceTypes,
        browsers: topBrowsers,
        operatingSystems: topOperatingSystems,
      },
      eventsByDate,
      topTracks,
      topPages,
    })
  } catch (error: any) {
    console.error('Analytics stats API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
