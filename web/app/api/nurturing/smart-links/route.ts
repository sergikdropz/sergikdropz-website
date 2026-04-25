import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../supabase-service'

// GET /api/nurturing/smart-links
// List all smart links with click stats
export async function GET(request: NextRequest) {
  try {
    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const session = await getServerSession()
    
    // Check admin access
    if (!session?.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get query params for filtering
    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('smartlinks')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (category) {
      query = query.eq('category', category)
    }

    if (search) {
      query = query.or(`slug.ilike.%${search}%,title.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching smart links:', error)
      return NextResponse.json(
        { error: 'Failed to fetch smart links' },
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

// POST /api/nurturing/smart-links
// Create a new smart link
export async function POST(request: NextRequest) {
  try {
    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const session = await getServerSession()
    
    // Check admin access
    if (!session?.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { slug, destination_url, title, description, category, release_id, metadata } = body

    // Validate required fields
    if (!slug || !destination_url) {
      return NextResponse.json(
        { error: 'slug and destination_url are required' },
        { status: 400 }
      )
    }

    // Validate slug format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      return NextResponse.json(
        { error: 'slug must contain only alphanumeric characters, hyphens, and underscores' },
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(destination_url)
    } catch {
      return NextResponse.json(
        { error: 'destination_url must be a valid URL' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('smartlinks')
      .insert([
        {
          slug,
          destination_url,
          title: title || slug,
          description: description || '',
          category: category || 'general',
          release_id: release_id || null,
          metadata: metadata || {},
          created_by: session.user?.id,
        },
      ])
      .select()

    if (error) {
      // Handle duplicate slug
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Slug already exists' },
          { status: 409 }
        )
      }
      console.error('Error creating smart link:', error)
      return NextResponse.json(
        { error: 'Failed to create smart link' },
        { status: 500 }
      )
    }

    return NextResponse.json(data[0], { status: 201 })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
