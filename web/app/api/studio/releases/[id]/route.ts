import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import { autoCreateReleaseCampaign } from '@/lib/studio/auto-campaign'

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

    const copyright = await getSingleReleaseCopyrightReadiness(supabase, params.id)

    return NextResponse.json({
      release,
      tracks: tracks || [],
      storeLinks: storeLinks || [],
      copyright,
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

    // Fetch current release so we can detect status transitions.
    const { data: currentRelease, error: fetchError } = await supabase
      .from('distribution_releases')
      .select('distributor_status')
      .eq('id', params.id)
      .single()

    if (fetchError || !currentRelease) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const previousStatus: string = currentRelease.distributor_status ?? 'draft'

    const allowed = [
      'title',
      'type',
      'release_date',
      'artwork_url',
      'description',
      'explicit',
      'genre',
      'subgenre',
      'label_name',
      'upc',
      'distribution_mode',
      'target_stores',
      'marketing_copy',
      'status',
    ] as const
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) {
        // Map the client-facing "status" field to the DB column "distributor_status".
        if (key === 'status') {
          updates['distributor_status'] = body[key]
        } else {
          updates[key] = body[key]
        }
      }
    }

    const { data, error } = await supabase
      .from('distribution_releases')
      .update(updates)
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

    // Auto-create a draft campaign when a release transitions to "scheduled".
    // Fire-and-forget: never block the response on campaign creation.
    const newStatus: string = (data as { distributor_status?: string }).distributor_status ?? previousStatus
    if (newStatus === 'scheduled' && previousStatus !== 'scheduled') {
      void autoCreateReleaseCampaign(supabase, data as { id: string; title: string; release_date?: string | null })
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
