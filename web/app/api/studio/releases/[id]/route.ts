import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * GET /api/studio/releases/[id]
 * Get a single release with tracks
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

    // Get release
    const { data: release, error: releaseError } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('id', params.id)
      .single()

    if (releaseError || !release) {
      return NextResponse.json(
        { error: 'Release not found' },
        { status: 404 }
      )
    }

    // Get tracks for this release
    const { data: tracks, error: tracksError } = await supabase
      .from('distribution_tracks')
      .select('*')
      .eq('release_id', params.id)
      .order('created_at', { ascending: true })

    // Get store links
    const { data: storeLinks } = await supabase
      .from('distribution_store_links')
      .select('*')
      .eq('release_id', params.id)

    return NextResponse.json({
      release,
      tracks: tracks || [],
      storeLinks: storeLinks || [],
    })
  } catch (error: any) {
    console.error('Error in GET /api/studio/releases/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch release' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/studio/releases/[id]
 * Update a release
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
      .from('distribution_releases')
      .update(body)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating release:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to update release' },
        { status: 500 }
      )
    }

    return NextResponse.json({ release: data })
  } catch (error: any) {
    console.error('Error in PUT /api/studio/releases/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update release' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/studio/releases/[id]
 * Delete a release
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
      .from('distribution_releases')
      .delete()
      .eq('id', params.id)

    if (error) {
      console.error('Error deleting release:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to delete release' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/studio/releases/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete release' },
      { status: 500 }
    )
  }
}
