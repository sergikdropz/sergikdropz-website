import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * GET /api/admin/search
 * Search across multiple tables
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!query) {
      return NextResponse.json({ results: [] })
    }

    const supabase = createSupabaseServerClient()
    const results: any[] = []

    // Search tracks
    const { data: tracks } = await supabase
      .from('music_library_tracks')
      .select('id, title, artist')
      .or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
      .limit(limit)

    if (tracks) {
      tracks.forEach((track) => {
        results.push({
          type: 'track',
          id: track.id,
          title: track.title,
          subtitle: track.artist,
          url: `/admin/music?track=${track.id}`,
        })
      })
    }

    // Search releases (if distribution_releases exists)
    try {
      const { data: releases } = await supabase
        .from('distribution_releases')
        .select('id, title, type')
        .ilike('title', `%${query}%`)
        .limit(limit)

      if (releases) {
        releases.forEach((release) => {
          results.push({
            type: 'release',
            id: release.id,
            title: release.title,
            subtitle: release.type,
            url: `/studio/releases/${release.id}`,
          })
        })
      }
    } catch (error) {
      // Table might not exist yet
    }

    return NextResponse.json({ results })
  } catch (error: any) {
    console.error('Error in search:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to search' },
      { status: 500 }
    )
  }
}
