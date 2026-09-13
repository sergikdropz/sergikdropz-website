import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../../supabase-service'

// GET /api/nurturing/smart-links/:id
// Get a specific smart link with click stats
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params

    const { data, error } = await supabase
      .from('smartlinks')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Smart link not found' },
          { status: 404 }
        )
      }
      console.error('Error fetching smart link:', error)
      return NextResponse.json(
        { error: 'Failed to fetch smart link' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/nurturing/smart-links/:id
// Update a smart link
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params
    const body = await request.json()
    const { title, description, destination_url, category, metadata } = body

    // Validate URL if provided
    if (destination_url) {
      try {
        new URL(destination_url)
      } catch {
        return NextResponse.json(
          { error: 'destination_url must be a valid URL' },
          { status: 400 }
        )
      }
    }

    const { data, error } = await supabase
      .from('smartlinks')
      .update({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(destination_url !== undefined && { destination_url }),
        ...(category !== undefined && { category }),
        ...(metadata !== undefined && { metadata }),
      })
      .eq('id', id)
      .select()

    if (error) {
      console.error('Error updating smart link:', error)
      return NextResponse.json(
        { error: 'Failed to update smart link' },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Smart link not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(data[0])
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/nurturing/smart-links/:id
// Delete a smart link
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params

    const { error } = await supabase
      .from('smartlinks')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting smart link:', error)
      return NextResponse.json(
        { error: 'Failed to delete smart link' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
