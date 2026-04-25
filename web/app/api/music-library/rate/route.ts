import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/music-library/rate
 * Set a star rating (0-5) for a track
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { trackId, rating } = await request.json()

    if (!trackId) {
      return NextResponse.json({ error: 'trackId is required' }, { status: 400 })
    }

    const numRating = Number(rating)
    if (isNaN(numRating) || numRating < 0 || numRating > 5) {
      return NextResponse.json({ error: 'Rating must be 0-5' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('music_library_tracks')
      .update({ rating: numRating })
      .eq('id', trackId)
      .select('id, rating')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, track: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
