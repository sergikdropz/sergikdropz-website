import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../../nurturing/supabase-service'
import { buildMarketingPipelineBoard } from '@/lib/studio/marketing-pipeline'

/**
 * GET /api/studio/release-pipeline
 * Calendar + distribution releases enriched for Marketing:
 * campaigns, smart links, press/copy, DSP targets/links, collab, rights ingest.
 */
export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response

    const board = await buildMarketingPipelineBoard(supabaseService.supabase)
    return NextResponse.json(board)
  } catch (error: unknown) {
    console.error('Error fetching release pipeline:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch release pipeline'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
