import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DISTRIBUTED_STATUSES = new Set(['delivered', 'live'])

/**
 * POST /api/music-library/tracks/pull-studio-release-dates
 * Body: { trackIds: string[], apply?: boolean, onlyMissing?: boolean }
 *
 * Reads Release Studio distribution_releases.release_date for linked tracks
 * that are actually distributed (delivered/live). Optionally writes to
 * music_library_tracks.date (Date released).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const body = await request.json().catch(() => ({}))
    const trackIds = Array.isArray(body.trackIds)
      ? body.trackIds.map((id: unknown) => String(id || '')).filter(Boolean)
      : []
    const apply = body.apply !== false
    const onlyMissing = body.onlyMissing !== false

    if (!trackIds.length) {
      return NextResponse.json({ error: 'trackIds required' }, { status: 400 })
    }
    if (trackIds.length > 200) {
      return NextResponse.json({ error: 'Max 200 tracks per request' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    const { data: distTracks, error: distErr } = await supabase
      .from('distribution_tracks')
      .select(
        'music_library_track_id, release_id, distribution_releases(id, title, release_date, distributor_status)',
      )
      .in('music_library_track_id', trackIds)

    if (distErr) {
      return NextResponse.json({ error: distErr.message }, { status: 500 })
    }

    const byTrack = new Map<
      string,
      { releaseDate: string; releaseTitle: string; status: string; releaseId: string }
    >()

    for (const row of distTracks || []) {
      const trackId = row.music_library_track_id as string | null
      if (!trackId) continue
      const release = Array.isArray(row.distribution_releases)
        ? row.distribution_releases[0]
        : row.distribution_releases
      if (!release?.release_date) continue
      const status = String(release.distributor_status || '')
      if (!DISTRIBUTED_STATUSES.has(status)) continue
      // Prefer earliest live release date if multiple
      const existing = byTrack.get(trackId)
      if (!existing || String(release.release_date) < existing.releaseDate) {
        byTrack.set(trackId, {
          releaseDate: String(release.release_date).slice(0, 10),
          releaseTitle: String(release.title || ''),
          status,
          releaseId: String(release.id || row.release_id || ''),
        })
      }
    }

    const { data: libraryTracks } = await supabase
      .from('music_library_tracks')
      .select('id, title, date, year')
      .in('id', trackIds)

    const updated: {
      trackId: string
      title?: string
      date: string
      releaseTitle: string
      status: string
    }[] = []
    const skipped: { trackId: string; reason: string }[] = []
    const suggestions: {
      trackId: string
      date: string
      releaseTitle: string
      status: string
    }[] = []

    for (const trackId of trackIds) {
      const hit = byTrack.get(trackId)
      if (!hit) {
        skipped.push({ trackId, reason: 'no_distributed_studio_release' })
        continue
      }
      suggestions.push({
        trackId,
        date: hit.releaseDate,
        releaseTitle: hit.releaseTitle,
        status: hit.status,
      })

      if (!apply) continue

      const lib = (libraryTracks || []).find((t: any) => t.id === trackId)
      if (onlyMissing && lib?.date) {
        skipped.push({ trackId, reason: 'already_has_release_date' })
        continue
      }

      const { error: upErr } = await supabase
        .from('music_library_tracks')
        .update({
          date: hit.releaseDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', trackId)

      if (upErr) {
        skipped.push({ trackId, reason: upErr.message })
        continue
      }

      updated.push({
        trackId,
        title: lib?.title,
        date: hit.releaseDate,
        releaseTitle: hit.releaseTitle,
        status: hit.status,
      })
    }

    return NextResponse.json({
      success: true,
      updated,
      suggestions,
      skipped,
      updatedCount: updated.length,
      skippedCount: skipped.length,
    })
  } catch (err: any) {
    console.error('pull-studio-release-dates error:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to pull studio release dates' },
      { status: 500 },
    )
  }
}
