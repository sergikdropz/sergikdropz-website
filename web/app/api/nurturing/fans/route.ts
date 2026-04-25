import { NextRequest, NextResponse } from 'next/server'
import { requireSupabaseService } from '../supabase-service'

// POST /api/nurturing/fans
// Create or update a fan record (public endpoint for form submission)
export async function POST(request: NextRequest) {
  try {
    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const body = await request.json()
    const { email, name, phone, tags, source } = body

    // Validate required fields
    if (!email) {
      return NextResponse.json(
        { error: 'email is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Check if fan already exists
    const { data: existingFan } = await supabase
      .from('fans')
      .select('id, email, tags, name, phone')
      .eq('email', email)
      .single()

    let fan

    if (existingFan) {
      // Update existing fan
      const updatedTags = Array.from(
        new Set([
          ...(existingFan.tags || []),
          ...(tags || []),
        ])
      )

      const { data, error } = await supabase
        .from('fans')
        .update({
          name: name || existingFan.name,
          phone: phone || existingFan.phone,
          tags: updatedTags,
          updated_at: new Date().toISOString(),
        })
        .eq('email', email)
        .select()

      if (error) {
        console.error('Error updating fan:', error)
        return NextResponse.json(
          { error: 'Failed to update fan record' },
          { status: 500 }
        )
      }

      fan = data[0]
    } else {
      // Create new fan
      const { data, error } = await supabase
        .from('fans')
        .insert([
          {
            email,
            name: name || '',
            phone: phone || null,
            tags: tags || [],
            source: source || 'contact_form',
            consent_email: true,
            consent_sms: false,
          },
        ])
        .select()

      if (error) {
        // Handle duplicate email (race condition)
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'This email is already registered' },
            { status: 409 }
          )
        }
        console.error('Error creating fan:', error)
        return NextResponse.json(
          { error: 'Failed to create fan record' },
          { status: 500 }
        )
      }

      fan = data[0]
    }

    // Log event to analytics
    try {
      await supabase
        .from('analytics_events')
        .insert([
          {
            event_type: 'fan_signup',
            event_data: {
              email,
              source: source || 'contact_form',
            },
          },
        ])
    } catch (e) {
      // Silently fail if analytics_events doesn't exist or other error
      console.warn('Could not log fan signup event:', e)
    }

    return NextResponse.json(fan, { status: 201 })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/nurturing/fans
// List fans (admin only)
export async function GET(request: NextRequest) {
  try {
    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const session = await import('@/lib/auth').then(m => m.getServerSession())
    
    // Check admin access
    if (!session?.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search')

    let query = supabase
      .from('fans')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching fans:', error)
      return NextResponse.json(
        { error: 'Failed to fetch fans' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data,
      total: count,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
