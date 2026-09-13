import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  clearAdminStatsCache,
  readAdminStatsCache,
  writeAdminStatsCache,
} from '@/lib/api/admin-stats-cache'

export const dynamic = 'force-dynamic'

type AdminStatsPayload = {
  success: true
  stats: Record<string, unknown>
  timestamp: string
  cached?: boolean
}

function emptyStats() {
  return {
    audioFiles: {
      total: 0,
      purchasable: 0,
      analyzed: 0,
      sonicDNACompleted: 0,
      pending: 0,
      processing: 0,
    },
    purchases: {
      total: 0,
      totalRevenue: 0,
    },
    licenses: {
      total: 0,
      totalRevenue: 0,
    },
    tips: {
      total: 0,
      totalRevenue: 0,
    },
    instagram: {
      total: 0,
      active: 0,
      images: 0,
      videos: 0,
    },
    musicLibrary: {
      folders: {
        total: 0,
        visible: 0,
        hidden: 0,
      },
      tracks: 0,
      totalEntries: 0,
      tracksWithSonicDna: 0,
      tracksWithBpm: 0,
      tracksWithKey: 0,
      tracksWithWaveform: 0,
      uniqueArtists: 0,
    },
    analytics: {
      totalEvents: 0,
      eventsToday: 0,
      trackPlays: 0,
    },
    activityLogs: {
      total: 0,
      today: 0,
    },
    sonicDnaCoverage: {
      percent: 0,
      complete: 0,
      partial: 0,
      missing: 0,
    },
  }
}

async function sumAmountPaid(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: 'purchases' | 'licenses',
  filter?: { column: string; value: string }
): Promise<{ total: number; revenueCents: number }> {
  let countQuery = supabase.from(table).select('id', { count: 'exact', head: true })
  let sumQuery = supabase
    .from(table)
    .select('amount_paid')
    .not('amount_paid', 'is', null)
    .limit(5000)
  if (filter) {
    countQuery = countQuery.eq(filter.column, filter.value)
    sumQuery = sumQuery.eq(filter.column, filter.value)
  }
  const [countRes, sumRes] = await Promise.all([countQuery, sumQuery])
  const revenueCents = (sumRes.data || []).reduce(
    (sum: number, row: { amount_paid?: number | null }) => sum + (row.amount_paid || 0),
    0
  )
  return { total: countRes.count || 0, revenueCents }
}

/**
 * GET /api/admin/stats
 * Dashboard aggregates — cached briefly; queries run in parallel with lean selects.
 * Pass ?refresh=1 to bypass process cache after mutations.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    if (url.searchParams.get('refresh') === '1') {
      clearAdminStatsCache()
    }

    const cached = readAdminStatsCache()
    if (cached) {
      return NextResponse.json({ ...cached, cached: true })
    }

    const supabase = createSupabaseServerClient()
    const stats = emptyStats()
    const today = new Date().toISOString().split('T')[0]

    const [
      audioTotal,
      audioPurchasable,
      audioAnalyzed,
      audioSonic,
      audioPending,
      audioProcessing,
      purchases,
      tips,
      licenses,
      igTotal,
      igActive,
      igImages,
      igVideos,
      foldersTotal,
      foldersVisible,
      foldersHidden,
      trackRows,
      analyticsTotal,
      analyticsToday,
      trackPlays,
      activityTotal,
      activityToday,
    ] = await Promise.all([
      supabase.from('audio_files').select('id', { count: 'exact', head: true }),
      supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('is_purchasable', true),
      supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('analysis_status', 'completed'),
      supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('sonic_dna_status', 'completed'),
      supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('analysis_status', 'pending'),
      supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('analysis_status', 'processing'),
      sumAmountPaid(supabase, 'purchases'),
      sumAmountPaid(supabase, 'purchases', { column: 'product_type', value: 'tip' }),
      sumAmountPaid(supabase, 'licenses'),
      supabase.from('instagram_media').select('id', { count: 'exact', head: true }),
      supabase.from('instagram_media').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('instagram_media').select('id', { count: 'exact', head: true }).eq('media_type', 'image'),
      supabase.from('instagram_media').select('id', { count: 'exact', head: true }).eq('media_type', 'video'),
      supabase.from('music_library_folders').select('id', { count: 'exact', head: true }),
      supabase.from('music_library_folders').select('id', { count: 'exact', head: true }).eq('hidden', false),
      supabase.from('music_library_folders').select('id', { count: 'exact', head: true }).eq('hidden', true),
      supabase
        .from('music_library_tracks')
        .select('audio_file_id, bpm, key_signature, artist')
        .or('is_archived.is.null,is_archived.eq.false'),
      supabase.from('analytics_events').select('id', { count: 'exact', head: true }),
      supabase.from('analytics_events').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('analytics_events').select('id', { count: 'exact', head: true }).eq('event_type', 'track_play'),
      supabase.from('activity_logs').select('id', { count: 'exact', head: true }),
      supabase.from('activity_logs').select('id', { count: 'exact', head: true }).gte('created_at', today),
    ])

    stats.audioFiles.total = audioTotal.count || 0
    stats.audioFiles.purchasable = audioPurchasable.count || 0
    stats.audioFiles.analyzed = audioAnalyzed.count || 0
    stats.audioFiles.sonicDNACompleted = audioSonic.count || 0
    stats.audioFiles.pending = audioPending.count || 0
    stats.audioFiles.processing = audioProcessing.count || 0

    stats.purchases.total = purchases.total
    stats.purchases.totalRevenue = purchases.revenueCents / 100
    stats.tips.total = tips.total
    stats.tips.totalRevenue = tips.revenueCents / 100
    stats.licenses.total = licenses.total
    stats.licenses.totalRevenue = licenses.revenueCents / 100

    stats.instagram.total = igTotal.count || 0
    stats.instagram.active = igActive.count || 0
    stats.instagram.images = igImages.count || 0
    stats.instagram.videos = igVideos.count || 0

    stats.musicLibrary.folders.total = foldersTotal.count || 0
    stats.musicLibrary.folders.visible = foldersVisible.count || 0
    stats.musicLibrary.folders.hidden = foldersHidden.count || 0

    const uniqueByAudioFile = new Map<
      string,
      { bpm: number | null; key_signature: string | null; artist: string | null }
    >()
    const withoutAudio: Array<{
      bpm: number | null
      key_signature: string | null
      artist: string | null
    }> = []
    for (const track of trackRows.data || []) {
      const row = {
        bpm: track.bpm ?? null,
        key_signature: track.key_signature ?? null,
        artist: track.artist ?? null,
      }
      if (track.audio_file_id) {
        if (!uniqueByAudioFile.has(track.audio_file_id)) {
          uniqueByAudioFile.set(track.audio_file_id, row)
        }
      } else {
        withoutAudio.push(row)
      }
    }
    const uniqueTracks = [...uniqueByAudioFile.values(), ...withoutAudio]
    let withBpm = 0
    let withKey = 0
    const artistSet = new Set<string>()
    for (const track of uniqueTracks) {
      if (track.bpm) withBpm++
      if (track.key_signature && track.key_signature !== 'Unknown') withKey++
      if (track.artist) artistSet.add(track.artist.toLowerCase())
    }
    const totalUnique = uniqueTracks.length
    const withSonicDna = stats.audioFiles.sonicDNACompleted
    stats.musicLibrary.tracks = totalUnique
    stats.musicLibrary.totalEntries = trackRows.data?.length || 0
    stats.musicLibrary.tracksWithSonicDna = withSonicDna
    stats.musicLibrary.tracksWithBpm = withBpm
    stats.musicLibrary.tracksWithKey = withKey
    stats.musicLibrary.tracksWithWaveform = stats.audioFiles.analyzed
    stats.musicLibrary.uniqueArtists = artistSet.size
    stats.sonicDnaCoverage.percent =
      totalUnique > 0 ? Math.round((withSonicDna / totalUnique) * 100) : 0
    stats.sonicDnaCoverage.complete = withSonicDna
    stats.sonicDnaCoverage.missing = Math.max(0, totalUnique - withSonicDna)

    stats.analytics.totalEvents = analyticsTotal.count || 0
    stats.analytics.eventsToday = analyticsToday.count || 0
    stats.analytics.trackPlays = trackPlays.count || 0
    stats.activityLogs.total = activityTotal.count || 0
    stats.activityLogs.today = activityToday.count || 0

    const body: AdminStatsPayload = {
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    }
    writeAdminStatsCache(body)

    return NextResponse.json(body)
  } catch (error: unknown) {
    console.error('Error fetching admin stats:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch stats'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
