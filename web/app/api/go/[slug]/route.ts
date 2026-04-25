import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { UAParser } from 'ua-parser-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// GET /api/go/:slug
// Redirect to destination URL and track the click
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params

    // Fetch the smart link
    const { data: link, error: linkError } = await supabase
      .from('smartlinks')
      .select('*')
      .eq('slug', slug)
      .single()

    if (linkError || !link) {
      return NextResponse.json(
        { error: 'Link not found' },
        { status: 404 }
      )
    }

    // Extract tracking parameters from URL
    const url = new URL(request.url)
    const utm_source = url.searchParams.get('utm_source') || 'direct'
    const utm_medium = url.searchParams.get('utm_medium') || 'link'
    const utm_campaign = url.searchParams.get('utm_campaign')
    const utm_content = url.searchParams.get('utm_content')
    const session_id = url.searchParams.get('sid') || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Extract request metadata
    const referer = request.headers.get('referer') || undefined
    const user_agent = request.headers.get('user-agent') || undefined
    const ip_address = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                       request.headers.get('x-real-ip') || 
                       'unknown'

    // Parse user agent for additional context (optional)
    let country = 'unknown'
    try {
      const ua = new UAParser(user_agent || '')
      // You could add geolocation based on IP here (requires geoip service)
    } catch (e) {
      // Silently fail if parsing fails
    }

    // Get fan ID if email is provided (for known fan tracking)
    let fan_id = null
    const email = url.searchParams.get('email')
    if (email) {
      const { data: fan } = await supabase
        .from('fans')
        .select('id')
        .eq('email', email)
        .single()
      
      fan_id = fan?.id || null
    }

    // Record the click
    const { error: clickError } = await supabase
      .from('smartlinks_clicks')
      .insert([
        {
          smartlink_id: link.id,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_content,
          referer,
          user_agent,
          ip_address,
          country,
          session_id,
          fan_id,
        },
      ])

    if (clickError) {
      console.error('Error tracking click:', clickError)
      // Don't fail the redirect if tracking fails
    } else {
      // Update click stats (call helper function)
      await supabase.rpc('update_smartlink_click_stats', { link_id: link.id })
    }

    // Also log to analytics_events if the table exists
    try {
      await supabase
        .from('analytics_events')
        .insert([
          {
            event_type: 'smartlink_click',
            event_data: {
              slug,
              utm_source,
              utm_medium,
              utm_campaign,
              destination: link.destination_url,
            },
            session_id,
          },
        ])
    } catch (e) {
      // Silently fail if analytics_events doesn't exist
    }

    // Redirect to destination
    return NextResponse.redirect(link.destination_url, {
      status: 301,
    })
  } catch (error) {
    console.error('Error in redirect endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
