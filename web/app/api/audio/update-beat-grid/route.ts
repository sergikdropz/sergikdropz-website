import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { persistSystemicBeatGrid } from '@/lib/catalog-sync/persist-systemic-beat-grid'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Persist beat-grid phase for a track across the catalog
 * (library rows + audio DNA + sonic_dna_cache).
 * POST /api/audio/update-beat-grid
 * Body: { trackId: string, offsetSec: number, sonicDna?: unknown, gridManual?: boolean }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const body = await request.json()
    const trackId = typeof body?.trackId === 'string' ? body.trackId : ''
    const offsetRaw = body?.offsetSec ?? body?.beat_grid_offset ?? body?.beatGridOffset
    const offsetSec = typeof offsetRaw === 'number' ? offsetRaw : Number(offsetRaw)
    const sonicDna = body?.sonicDna ?? body?.sonic_dna
    const gridManual =
      typeof body?.gridManual === 'boolean'
        ? body.gridManual
        : typeof body?.grid_manual === 'boolean'
          ? body.grid_manual
          : undefined

    if (!trackId) {
      return NextResponse.json({ error: 'Track ID is required' }, { status: 400 })
    }
    if (!Number.isFinite(offsetSec) || offsetSec < 0) {
      return NextResponse.json(
        { error: 'Beat grid offset must be a non-negative number' },
        { status: 400 },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const saved = await persistSystemicBeatGrid(supabase, {
      trackId,
      offsetSec,
      sonicDna,
      gridManual,
    })

    return NextResponse.json({
      success: true,
      data: {
        id: saved.audioFileId || saved.libraryTrackIds[0] || trackId,
        beat_grid_offset: saved.beatGridOffset,
        audioFileId: saved.audioFileId,
        libraryTrackIds: saved.libraryTrackIds,
        sonic_dna: saved.sonicDna,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = /not found|not in the catalog/i.test(message) ? 404 : 500
    console.error('Error in update-beat-grid route:', error)
    return NextResponse.json({ error: message }, { status })
  }
}
