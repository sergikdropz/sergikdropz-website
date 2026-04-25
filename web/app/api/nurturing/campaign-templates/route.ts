import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../supabase-service'

// GET /api/nurturing/campaign-templates
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
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('campaign_templates')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (category) query = query.eq('category', category)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching templates:', error)
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
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

// POST /api/nurturing/campaign-templates
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
    const { name, subject, body_html, preview_text, category, variables } = body

    if (!name || !subject || !body_html) {
      return NextResponse.json(
        { error: 'name, subject, and body_html are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('campaign_templates')
      .insert([
        {
          name,
          subject,
          body_html,
          preview_text: preview_text || '',
          category: category || 'general',
          variables: variables || [],
          created_by: session.user?.id,
        },
      ])
      .select()

    if (error) {
      console.error('Error creating template:', error)
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      )
    }

    return NextResponse.json(data[0], { status: 201 })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
