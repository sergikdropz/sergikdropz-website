import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * GET /api/studio/releases
 * List all releases
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter')

    let query = supabase
      .from('distribution_releases')
      .select('*')
      .order('created_at', { ascending: false })

    if (filter === 'pending') {
      query = query.eq('distributor_status', 'draft')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching releases:', error)
      return NextResponse.json(
        { error: 'Failed to fetch releases' },
        { status: 500 }
      )
    }

    return NextResponse.json({ releases: data || [] })
  } catch (error: any) {
    console.error('Error in GET /api/studio/releases:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch releases' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/studio/releases
 * Create a new release
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      id,
      title,
      type,
      release_date,
      artwork_url,
      description,
      explicit,
      genre,
      subgenre,
      label_name,
    } = body

    if (!id || !title || !type) {
      return NextResponse.json(
        { error: 'id, title, and type are required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('distribution_releases')
      .insert({
        id,
        title,
        type,
        release_date: release_date || null,
        artwork_url: artwork_url || null,
        description: description || null,
        explicit: explicit || false,
        genre: genre || null,
        subgenre: subgenre || null,
        label_name: label_name || null,
        distributor_status: 'draft',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating release:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to create release' },
        { status: 500 }
      )
    }

    return NextResponse.json({ release: data }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/studio/releases:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create release' },
      { status: 500 }
    )
  }
}
