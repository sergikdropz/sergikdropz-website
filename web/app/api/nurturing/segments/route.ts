import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../supabase-service'

// GET /api/nurturing/segments
export async function GET(request: NextRequest) {
  try {
    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search')

    let query = supabase
      .from('fan_segments_summary')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching segments:', error)
      return NextResponse.json({ error: 'Failed to fetch segments' }, { status: 500 })
    }

    return NextResponse.json({
      data,
      total: count,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/nurturing/segments
export async function POST(request: NextRequest) {
  try {
    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, filters } = body

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('fan_segments')
      .insert([
        {
          name,
          description: description || '',
          filters: filters || {},
          created_by: session.user?.id,
        },
      ])
      .select()

    if (error) {
      console.error('Error creating segment:', error)
      return NextResponse.json({ error: 'Failed to create segment' }, { status: 500 })
    }

    return NextResponse.json(data[0], { status: 201 })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
