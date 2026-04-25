import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * GET /api/studio/tracks/[id]
 * Get a single track
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('distribution_tracks')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      console.error('Error fetching track:', error)
      return NextResponse.json(
        { error: 'Track not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ track: data })
  } catch (error: any) {
    console.error('Error in GET /api/studio/tracks/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch track' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/studio/tracks/[id]
 * Update a track
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('distribution_tracks')
      .update(body)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating track:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to update track' },
        { status: 500 }
      )
    }

    return NextResponse.json({ track: data })
  } catch (error: any) {
    console.error('Error in PUT /api/studio/tracks/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update track' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/studio/tracks/[id]
 * Delete a track
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()

    const { error } = await supabase
      .from('distribution_tracks')
      .delete()
      .eq('id', params.id)

    if (error) {
      console.error('Error deleting track:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to delete track' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/studio/tracks/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete track' },
      { status: 500 }
    )
  }
}
