import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../../supabase-service'

// GET /api/nurturing/segments/:id
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('fan_segments_summary')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      console.error('Error fetching segment:', error)
      return NextResponse.json({ error: 'Failed to fetch segment' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/nurturing/segments/:id
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
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

    const updateData: { name?: string; description?: string; filters?: any; updated_at?: string } = {
      updated_at: new Date().toISOString(),
    }

    if (name) updateData.name = name
    if (typeof description !== 'undefined') updateData.description = description
    if (typeof filters !== 'undefined') updateData.filters = filters

    const { data, error } = await supabase
      .from('fan_segments')
      .update(updateData)
      .eq('id', params.id)
      .select()

    if (error) {
      console.error('Error updating segment:', error)
      return NextResponse.json({ error: 'Failed to update segment' }, { status: 500 })
    }

    return NextResponse.json(data[0])
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/nurturing/segments/:id
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('fan_segments')
      .delete()
      .eq('id', params.id)

    if (error) {
      console.error('Error deleting segment:', error)
      return NextResponse.json({ error: 'Failed to delete segment' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
