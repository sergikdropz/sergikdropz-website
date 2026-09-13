import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * GET /api/studio/tracks
 * List all distribution tracks
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('distribution_tracks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching tracks:', error)
      return NextResponse.json(
        { error: 'Failed to fetch tracks' },
        { status: 500 }
      )
    }

    return NextResponse.json({ tracks: data || [] })
  } catch (error: any) {
    console.error('Error in GET /api/studio/tracks:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch tracks' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/studio/tracks
 * Create a new distribution track
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
      version,
      duration,
      wav_url,
      artwork_url,
      contributors,
      splits,
      explicit,
      language,
      music_library_track_id,
    } = body

    if (!id || !title || !wav_url) {
      return NextResponse.json(
        { error: 'id, title, and wav_url are required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('distribution_tracks')
      .insert({
        id,
        title,
        version: version || null,
        duration: duration || null,
        wav_url,
        artwork_url: artwork_url || null,
        contributors: contributors || [],
        splits: splits || [],
        explicit: explicit || false,
        language: language || 'en',
        music_library_track_id: music_library_track_id || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating track:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to create track' },
        { status: 500 }
      )
    }

    return NextResponse.json({ track: data }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/studio/tracks:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create track' },
      { status: 500 }
    )
  }
}
