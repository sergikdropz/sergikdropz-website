import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getClientIp } from '@/lib/activity-log'
import { UAParser } from 'ua-parser-js'

export const dynamic = 'force-dynamic'

// Simple in-memory rate limiter (for production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100 // 100 requests per minute per IP

function anonymizeIp(ip: string): string {
  if (ip.includes(':')) {
    const parts = ip.split(':')
    if (parts.length >= 4) {
      return [...parts.slice(0, 4), '0000', '0000', '0000', '0000'].slice(0, 8).join(':')
    }
    return ip
  }
  const octets = ip.split('.')
  if (octets.length === 4) {
    return `${octets[0]}.${octets[1]}.${octets[2]}.0`
  }
  return ip
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false
  }

  record.count++
  return true
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of Array.from(rateLimitMap.entries())) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip)
    }
  }
}, RATE_LIMIT_WINDOW)

/**
 * POST /api/analytics/track
 * Log analytics events (public endpoint with rate limiting)
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request) || 'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    // Handle both JSON and Blob (from sendBeacon) requests
    let body: any
    const contentType = request.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      body = await request.json()
    } else {
      // Handle Blob from sendBeacon
      const blob = await request.blob()
      const text = await blob.text()
      body = JSON.parse(text)
    }
    
    const { eventType, eventData, sessionId, userId, consent } = body
    const consentGranted = consent === true

    if (!eventType) {
      return NextResponse.json(
        { error: 'eventType is required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    // Get user agent and referrer from headers (only if consented)
    const userAgent = consentGranted ? request.headers.get('user-agent') || null : null
    const referrer = consentGranted ? (request.headers.get('referer') || request.headers.get('referrer') || null) : null

    // Parse device and browser information
    let deviceInfo: {
      deviceType?: string
      browser?: string
      browserVersion?: string
      os?: string
      osVersion?: string
    } | null = null

    if (userAgent && consentGranted) {
      try {
        const parser = new UAParser(userAgent)
        const result = parser.getResult()
        
        // Determine device type
        let deviceType = 'desktop'
        if (result.device.type === 'mobile') {
          deviceType = 'mobile'
        } else if (result.device.type === 'tablet') {
          deviceType = 'tablet'
        } else if (result.device.type) {
          deviceType = result.device.type
        }

        deviceInfo = {
          deviceType,
          browser: result.browser.name || undefined,
          browserVersion: result.browser.version || undefined,
          os: result.os.name || undefined,
          osVersion: result.os.version || undefined,
        }
      } catch (error) {
        // Silently fail - device parsing is non-critical
      }
    }

    // Get geolocation data from IP (using a free service)
    // This is done asynchronously and won't block the request
    let locationData: {
      country?: string
      region?: string
      city?: string
      countryCode?: string
    } | null = null

    if (
      consentGranted &&
      ip &&
      ip !== 'unknown' &&
      !ip.startsWith('127.') &&
      !ip.startsWith('192.168.') &&
      !ip.startsWith('10.') &&
      !ip.startsWith('172.')
    ) {
      try {
        // Use ipapi.co free tier (1000 requests/day) with timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout

        const geoResponse = await fetch(`https://ipapi.co/${ip}/json/`, {
          headers: { 'User-Agent': 'SERGIK Analytics' },
          signal: controller.signal,
        }).catch(() => null)

        clearTimeout(timeoutId)

        if (geoResponse && geoResponse.ok) {
          const geoData = await geoResponse.json()
          if (geoData && !geoData.error) {
            locationData = {
              country: geoData.country_name || null,
              region: geoData.region || geoData.region_code || null,
              city: geoData.city || null,
              countryCode: geoData.country_code || null,
            }
          }
        }
      } catch (error) {
        // Silently fail - geolocation is non-critical
        // Don't log to avoid spam
      }
    }

    // Merge location and device data into event_data if it's a page_view or session_start
    let enrichedEventData = eventData || {}
    if (consentGranted && (eventType === 'page_view' || eventType === 'session_start')) {
      if (locationData) {
        enrichedEventData = {
          ...enrichedEventData,
          location: locationData,
        }
      }
      if (deviceInfo) {
        enrichedEventData = {
          ...enrichedEventData,
          device: deviceInfo,
        }
      }
    }

    // Add referrer from headers if not already in event data
    if (consentGranted && referrer && !enrichedEventData.referrer) {
      enrichedEventData.referrer = referrer
    }

    const ipToStore = consentGranted && ip !== 'unknown' ? anonymizeIp(ip) : null
    const userIdToStore = consentGranted ? userId || null : null
    const sessionIdToStore = consentGranted ? sessionId || null : null

    const { error } = await supabase
      .from('analytics_events')
      .insert({
        event_type: eventType,
        event_data: enrichedEventData || null,
        user_id: userIdToStore,
        session_id: sessionIdToStore,
        ip_address: ipToStore,
        user_agent: consentGranted ? userAgent : null,
      })

    if (error) {
      console.error('Error tracking analytics event:', error)
      // Don't fail the request - analytics is non-critical
      return NextResponse.json({ success: true, warning: 'Event logged with errors' })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Analytics track error:', error)
    // Don't fail the request - analytics is non-critical
    return NextResponse.json({ success: true, warning: 'Event may not have been logged' })
  }
}
