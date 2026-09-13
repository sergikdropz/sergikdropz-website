import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * GET /api/studio/soundexchange/submissions
 * Get SoundExchange submission history
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()

    // Try to fetch submissions, but handle case where table doesn't exist yet
    try {
      const { data, error } = await supabase
        .from('soundexchange_submissions')
        .select('*')
        .order('submitted_at', { ascending: false })
        .limit(100)

      if (error) {
        // Table might not exist yet
        return NextResponse.json({ submissions: [] })
      }

      return NextResponse.json({ submissions: data || [] })
    } catch (error) {
      // Table doesn't exist, return empty array
      return NextResponse.json({ submissions: [] })
    }
  } catch (error: any) {
    console.error('Error fetching SoundExchange submissions:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch submissions' },
      { status: 500 }
    )
  }
}
