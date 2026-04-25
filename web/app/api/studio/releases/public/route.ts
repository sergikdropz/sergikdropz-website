import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * GET /api/studio/releases/public
 * Get live releases for public music page (no auth required)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('distributor_status', 'live')
      .order('release_date', { ascending: false })

    if (error) {
      // Handle missing table gracefully - return empty array instead of error
      if (error.code === 'PGRST205' || error.message?.includes('Could not find')) {
        console.warn('distribution_releases table not found, returning empty array')
        return NextResponse.json({ releases: [] })
      }
      console.error('Error fetching live releases:', error)
      return NextResponse.json(
        { error: 'Failed to fetch releases' },
        { status: 500 }
      )
    }

    return NextResponse.json({ releases: data || [] })
  } catch (error: any) {
    console.error('Error in GET /api/studio/releases/public:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch releases' },
      { status: 500 }
    )
  }
}
