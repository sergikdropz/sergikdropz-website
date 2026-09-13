import { supabaseIsReachable } from '@/lib/supabaseReachability'
import { createSupabaseServerClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export const revalidate = 300

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
}

/**
 * GET /api/studio/releases/public
 * Get live releases for public music page (no auth required)
 */
export async function GET() {
  try {
    if (!(await supabaseIsReachable())) {
      return NextResponse.json({ releases: [] }, { headers: CACHE_HEADERS })
    }

    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('distribution_releases')
      .select('id, title, type, release_date, artwork_url, distributor_status')
      .eq('distributor_status', 'live')
      .order('release_date', { ascending: false })

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('Could not find')) {
        console.warn('distribution_releases table not found, returning empty array')
        return NextResponse.json({ releases: [] }, { headers: CACHE_HEADERS })
      }
      console.error('Error fetching live releases:', error)
      return NextResponse.json({ releases: [] }, { headers: CACHE_HEADERS })
    }

    return NextResponse.json({ releases: data || [] }, { headers: CACHE_HEADERS })
  } catch (error: unknown) {
    console.error('Error in GET /api/studio/releases/public:', error)
    return NextResponse.json({ releases: [] }, { headers: CACHE_HEADERS })
  }
}
