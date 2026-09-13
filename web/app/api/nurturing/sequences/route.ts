import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../supabase-service'

// POST /api/nurturing/sequences
// Add an email sequence to a campaign
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
    const { campaign_id, template_id, days_offset, sequence_order, scheduled_for } = body

    if (!campaign_id || !template_id) {
      return NextResponse.json(
        { error: 'campaign_id and template_id are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('campaign_sequences')
      .insert([
        {
          campaign_id,
          template_id,
          days_offset: days_offset || 0,
          sequence_order: sequence_order || 0,
          scheduled_for: scheduled_for || null,
          status: 'pending',
        },
      ])
      .select()

    if (error) {
      console.error('Error creating sequence:', error)
      return NextResponse.json(
        { error: 'Failed to create sequence' },
        { status: 500 }
      )
    }

    return NextResponse.json(data[0], { status: 201 })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/nurturing/sequences/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const body = await request.json()
    const { template_id, days_offset, sequence_order, scheduled_for, status } = body

    const updateData: any = {}
    if (template_id) updateData.template_id = template_id
    if (days_offset !== undefined) updateData.days_offset = days_offset
    if (sequence_order !== undefined) updateData.sequence_order = sequence_order
    if (scheduled_for) updateData.scheduled_for = scheduled_for
    if (status) updateData.status = status

    const { data, error } = await supabase
      .from('campaign_sequences')
      .update(updateData)
      .eq('id', id)
      .select()

    if (error) {
      console.error('Error updating sequence:', error)
      return NextResponse.json(
        { error: 'Failed to update sequence' },
        { status: 500 }
      )
    }

    return NextResponse.json(data[0])
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/nurturing/sequences/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    const { error } = await supabase
      .from('campaign_sequences')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting sequence:', error)
      return NextResponse.json(
        { error: 'Failed to delete sequence' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
