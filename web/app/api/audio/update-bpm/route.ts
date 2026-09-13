import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { persistSystemicBpm } from '@/lib/catalog-sync/persist-systemic-bpm'
import { bumpMusicLibraryPublishVersion } from '@/lib/music-library-publish'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Update BPM for a track in the catalog (audio_files + library + DNA lock).
 * POST /api/audio/update-bpm
 * Body: { trackId: string, bpm: number }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { trackId, bpm } = await request.json()

    if (!trackId) {
      return NextResponse.json({ error: 'Track ID is required' }, { status: 400 })
    }

    if (bpm === undefined || bpm === null) {
      return NextResponse.json({ error: 'BPM value is required' }, { status: 400 })
    }

    const bpmValue = parseInt(bpm, 10)
    if (isNaN(bpmValue) || bpmValue < 30 || bpmValue > 300) {
      return NextResponse.json({ error: 'BPM must be between 30 and 300' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const saved = await persistSystemicBpm(supabase, { trackId, bpm: bpmValue })

    let publishVersion: number | null = null
    try {
      publishVersion = await bumpMusicLibraryPublishVersion()
    } catch (bumpError) {
      console.warn('[update-bpm] Failed to bump catalog version:', bumpError)
    }

    return NextResponse.json({
      success: true,
      data: {
        id: saved.audioFileId || saved.libraryTrackIds[0] || trackId,
        bpm: saved.bpm,
        audioFileId: saved.audioFileId,
        libraryTrackIds: saved.libraryTrackIds,
      },
      publishVersion,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = /not found/i.test(message) ? 404 : 500
    console.error('Error in update-bpm route:', error)
    return NextResponse.json({ error: message }, { status })
  }
}
