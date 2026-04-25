import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/stats
 * Get comprehensive statistics from all Supabase tables
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()

    const stats: any = {
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

    // Audio Files Stats
    try {
      const [total, purchasable, analyzed, sonicDNA, pending, processing] = await Promise.all([
        supabase.from('audio_files').select('id', { count: 'exact', head: true }),
        supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('is_purchasable', true),
        supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('analysis_status', 'completed'),
        supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('sonic_dna_status', 'completed'),
        supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('analysis_status', 'pending'),
        supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('analysis_status', 'processing'),
      ])
      stats.audioFiles.total = total.count || 0
      stats.audioFiles.purchasable = purchasable.count || 0
      stats.audioFiles.analyzed = analyzed.count || 0
      stats.audioFiles.sonicDNACompleted = sonicDNA.count || 0
      stats.audioFiles.pending = pending.count || 0
      stats.audioFiles.processing = processing.count || 0
    } catch (error) {
      console.error('Error fetching audio files stats:', error)
    }

    // Purchases Stats
    try {
      const [total, revenueData] = await Promise.all([
        supabase.from('purchases').select('id', { count: 'exact', head: true }),
        supabase.from('purchases').select('amount_paid').not('amount_paid', 'is', null),
      ])
      stats.purchases.total = total.count || 0
      
      if (revenueData.data && Array.isArray(revenueData.data)) {
        const totalRevenue = revenueData.data.reduce((sum: number, p: any) => sum + (p.amount_paid || 0), 0)
        stats.purchases.totalRevenue = totalRevenue / 100 // Convert cents to dollars
      }
    } catch (error) {
      console.error('Error fetching purchases stats:', error)
    }

    // Instagram Media Stats
    try {
      const [total, active, images, videos] = await Promise.all([
        supabase.from('instagram_media').select('id', { count: 'exact', head: true }),
        supabase.from('instagram_media').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('instagram_media').select('id', { count: 'exact', head: true }).eq('media_type', 'image'),
        supabase.from('instagram_media').select('id', { count: 'exact', head: true }).eq('media_type', 'video'),
      ])
      stats.instagram.total = total.count || 0
      stats.instagram.active = active.count || 0
      stats.instagram.images = images.count || 0
      stats.instagram.videos = videos.count || 0
    } catch (error) {
      console.error('Error fetching instagram stats:', error)
    }

    // Music Library Folders Stats
    try {
      const [total, visible, hidden] = await Promise.all([
        supabase.from('music_library_folders').select('id', { count: 'exact', head: true }),
        supabase.from('music_library_folders').select('id', { count: 'exact', head: true }).eq('hidden', false),
        supabase.from('music_library_folders').select('id', { count: 'exact', head: true }).eq('hidden', true),
      ])
      stats.musicLibrary.folders.total = total.count || 0
      stats.musicLibrary.folders.visible = visible.count || 0
      stats.musicLibrary.folders.hidden = hidden.count || 0
    } catch (error) {
      console.error('Error fetching music library folders stats:', error)
    }

    // Music Library Tracks Stats (comprehensive) - DEDUPLICATED by audio_file_id
    try {
      // Fetch all tracks with minimal data for deduplication
      const { data: allTracks } = await supabase
        .from('music_library_tracks')
        .select('id, audio_file_id, bpm, key_signature, sonic_dna, waveform, artist, metadata')
        .or('is_archived.is.null,is_archived.eq.false')

      // Deduplicate by audio_file_id (same track can appear in multiple playlists)
      const uniqueByAudioFile = new Map<string, any>()
      const tracksWithoutAudioFile: any[] = []
      
      for (const track of allTracks || []) {
        if (track.audio_file_id) {
          if (!uniqueByAudioFile.has(track.audio_file_id)) {
            uniqueByAudioFile.set(track.audio_file_id, track)
          }
        } else {
          tracksWithoutAudioFile.push(track)
        }
      }
      
      const uniqueTracks = [...Array.from(uniqueByAudioFile.values()), ...tracksWithoutAudioFile]
      const totalUnique = uniqueTracks.length
      const totalEntries = allTracks?.length || 0
      
      // Calculate stats on UNIQUE tracks only
      let withSonicDna = 0, withBpm = 0, withKey = 0, withWaveform = 0
      const artistSet = new Set<string>()
      
      for (const track of uniqueTracks) {
        const meta = track.metadata || {}
        
        // Use indexed flags if available, otherwise check direct fields
        if (meta.has_sonic_dna !== undefined ? meta.has_sonic_dna : track.sonic_dna) withSonicDna++
        if (meta.has_bpm !== undefined ? meta.has_bpm : track.bpm) withBpm++
        if (meta.has_key !== undefined ? meta.has_key : (track.key_signature && track.key_signature !== 'Unknown')) withKey++
        if (meta.has_waveform !== undefined ? meta.has_waveform : track.waveform) withWaveform++
        
        if (track.artist) artistSet.add(track.artist.toLowerCase())
      }
      
      stats.musicLibrary.tracks = totalUnique  // TRUE unique count
      stats.musicLibrary.totalEntries = totalEntries  // Total rows including duplicates
      stats.musicLibrary.tracksWithSonicDna = withSonicDna
      stats.musicLibrary.tracksWithBpm = withBpm
      stats.musicLibrary.tracksWithKey = withKey
      stats.musicLibrary.tracksWithWaveform = withWaveform
      stats.musicLibrary.uniqueArtists = artistSet.size

      // Calculate Sonic DNA coverage on unique tracks
      stats.sonicDnaCoverage.percent = totalUnique > 0 ? Math.round((withSonicDna / totalUnique) * 100) : 0
      stats.sonicDnaCoverage.complete = withSonicDna
      stats.sonicDnaCoverage.missing = totalUnique - withSonicDna
    } catch (error) {
      console.error('Error fetching music library tracks stats:', error)
    }

    // Analytics Events Stats
    try {
      const today = new Date().toISOString().split('T')[0]
      const [total, todayData, trackPlays] = await Promise.all([
        supabase.from('analytics_events').select('id', { count: 'exact', head: true }),
        supabase.from('analytics_events').select('id', { count: 'exact', head: true }).gte('created_at', today),
        supabase.from('analytics_events').select('id', { count: 'exact', head: true }).eq('event_type', 'track_play'),
      ])
      stats.analytics.totalEvents = total.count || 0
      stats.analytics.eventsToday = todayData.count || 0
      stats.analytics.trackPlays = trackPlays.count || 0
    } catch (error) {
      console.error('Error fetching analytics stats:', error)
    }

    // Licenses Stats
    try {
      const [total, revenueData] = await Promise.all([
        supabase.from('licenses').select('id', { count: 'exact', head: true }),
        supabase.from('licenses').select('amount_paid').not('amount_paid', 'is', null),
      ])
      stats.licenses.total = total.count || 0
      if (revenueData.data && Array.isArray(revenueData.data)) {
        const totalRevenue = revenueData.data.reduce((sum: number, l: any) => sum + (l.amount_paid || 0), 0)
        stats.licenses.totalRevenue = totalRevenue / 100
      }
    } catch (error) {
      console.error('Error fetching licenses stats:', error)
    }

    // Tips Stats (purchases where product_type = 'tip')
    try {
      const [total, revenueData] = await Promise.all([
        supabase.from('purchases').select('id', { count: 'exact', head: true }).eq('product_type', 'tip'),
        supabase.from('purchases').select('amount_paid').eq('product_type', 'tip').not('amount_paid', 'is', null),
      ])
      stats.tips.total = total.count || 0
      if (revenueData.data && Array.isArray(revenueData.data)) {
        const totalRevenue = revenueData.data.reduce((sum: number, t: any) => sum + (t.amount_paid || 0), 0)
        stats.tips.totalRevenue = totalRevenue / 100
      }
    } catch (error) {
      console.error('Error fetching tips stats:', error)
    }

    // Activity Logs Stats
    try {
      const today = new Date().toISOString().split('T')[0]
      const [total, todayData] = await Promise.all([
        supabase.from('activity_logs').select('id', { count: 'exact', head: true }),
        supabase.from('activity_logs').select('id', { count: 'exact', head: true }).gte('created_at', today),
      ])
      stats.activityLogs.total = total.count || 0
      stats.activityLogs.today = todayData.count || 0
    } catch (error) {
      console.error('Error fetching activity logs stats:', error)
    }

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Error fetching admin stats:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
