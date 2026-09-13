import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { requireSupabaseService } from '../../../nurturing/supabase-service'
import { ensureLaunchHandoff, publicMusicDestinationUrl } from '@/lib/studio/launch-handoff'
import { resolvePipelineRelease } from '@/lib/studio/schedule-bridge'

/**
 * POST /api/studio/release-pipeline/smart-link
 * Auto-generates a release smart link (schedule JSON or distribution_releases).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { release_id } = body

    if (!release_id) {
      return NextResponse.json({ error: 'release_id is required' }, { status: 400 })
    }

    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const release = await resolvePipelineRelease(supabase, release_id)
    if (!release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const handoff = await ensureLaunchHandoff(supabase, {
      releaseId: release_id,
      title: release.title,
      releaseDate: release.release_date || null,
      destinationUrl: release.smart_link || publicMusicDestinationUrl(release_id),
      createdBy: session.user?.id || null,
      createCampaign: false,
      createSmartLink: true,
    })

    if (!handoff.smartLink) {
      return NextResponse.json(
        { error: handoff.errors[0] || 'Failed to create smart link' },
        { status: 500 }
      )
    }

    if (handoff.smartLink.reused) {
      return NextResponse.json(
        { error: 'A smart link already exists for this release', smart_link: handoff.smartLink },
        { status: 409 }
      )
    }

    return NextResponse.json(handoff.smartLink, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating release smart link:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to create release smart link'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
