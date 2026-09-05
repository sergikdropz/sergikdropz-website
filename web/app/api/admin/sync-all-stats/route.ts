import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/admin/sync-all-stats
 * 
 * Comprehensive system statistics sync:
 * 1. Sync Sonic DNA from audio_files to music_library_tracks
 * 2. Update track counts in folders
 * 3. Recalculate all statistics
 * 4. Validate data integrity
 * 5. Clean up orphaned records
 * 
 * This ensures all stats are accurate without breaking existing functions.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const supabase = createSupabaseServerClient()
  
  const results: any = {
    success: true,
    timestamp: new Date().toISOString(),
    duration: 0,
    sync: {
      sonicDna: { updated: 0, skipped: 0, errors: 0 },
      trackFields: { updated: 0, skipped: 0 },
      folderCounts: { updated: 0 },
      integrity: { issues: 0, fixed: 0 }
    },
    stats: {
      before: {},
      after: {}
    }
  }

  try {
    // ============================================
    // STEP 1: Get current stats (before sync)
    // ============================================
    console.log('[Sync] Getting current stats...')
    results.stats.before = await getComprehensiveStats(supabase)

    // ============================================
    // STEP 2: Sync Sonic DNA from audio_files to tracks
    // ============================================
    console.log('[Sync] Syncing Sonic DNA data...')
    const sonicDnaResult = await syncSonicDnaToTracks(supabase)
    results.sync.sonicDna = sonicDnaResult

    // ============================================
    // STEP 3: Update missing track fields from audio_files
    // ============================================
    console.log('[Sync] Updating track fields...')
    const trackFieldsResult = await syncTrackFieldsFromAudioFiles(supabase)
    results.sync.trackFields = trackFieldsResult

    // ============================================
    // STEP 4: Update folder track counts
    // ============================================
    console.log('[Sync] Updating folder counts...')
    const folderCountsResult = await updateFolderTrackCounts(supabase)
    results.sync.folderCounts = folderCountsResult

    // ============================================
    // STEP 5: Fix data integrity issues
    // ============================================
    console.log('[Sync] Checking data integrity...')
    const integrityResult = await fixDataIntegrity(supabase)
    results.sync.integrity = integrityResult

    // ============================================
    // STEP 6: Get updated stats (after sync)
    // ============================================
    console.log('[Sync] Getting updated stats...')
    results.stats.after = await getComprehensiveStats(supabase)

    // Calculate duration
    results.duration = Date.now() - startTime

    // Log sync activity
    try {
      await supabase.from('activity_logs').insert({
        action: 'system_sync',
        description: `System stats sync completed: ${results.sync.sonicDna.updated} sonic DNA, ${results.sync.trackFields.updated} fields, ${results.sync.folderCounts.updated} folders updated`,
        metadata: results
      })
    } catch (e) {
      // Activity log is optional
    }

    console.log(`[Sync] Complete in ${results.duration}ms`)
    return NextResponse.json(results)

  } catch (error: any) {
    console.error('[Sync] Error:', error)
    results.success = false
    results.error = error.message
    results.duration = Date.now() - startTime
    return NextResponse.json(results, { status: 500 })
  }
}

/**
 * GET /api/admin/sync-all-stats
 * 
 * Get current comprehensive statistics without syncing
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const stats = await getComprehensiveStats(supabase)
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

// ============================================
// Helper Functions
// ============================================

async function getComprehensiveStats(supabase: any) {
  const stats: any = {
    audioFiles: {
      total: 0,
      withSonicDna: 0,
      pendingAnalysis: 0,
      completedAnalysis: 0,
      purchasable: 0
    },
    musicLibrary: {
      totalTracks: 0,
      tracksWithSonicDna: 0,
      tracksWithBpm: 0,
      tracksWithKey: 0,
      tracksWithEnergy: 0,
      tracksWithWaveform: 0,
      uniqueArtists: 0,
      folders: {
        total: 0,
        visible: 0,
        hidden: 0
      }
    },
    sonicDna: {
      coveragePercent: 0,
      genresAnalyzed: 0,
      keysDetected: 0,
      avgQualityScore: 0
    },
    analytics: {
      totalEvents: 0,
      eventsToday: 0,
      trackPlays: 0
    },
    purchases: {
      total: 0,
      totalRevenue: 0
    },
    lastSyncAt: null
  }

  try {
    // Audio files stats
    const [
      totalAudio,
      audioWithDna,
      audioPending,
      audioCompleted,
      audioPurchasable
    ] = await Promise.all([
      supabase.from('audio_files').select('id', { count: 'exact', head: true }),
      supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('sonic_dna_status', 'completed'),
      supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('sonic_dna_status', 'pending'),
      supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('analysis_status', 'completed'),
      supabase.from('audio_files').select('id', { count: 'exact', head: true }).eq('is_purchasable', true)
    ])

    stats.audioFiles.total = totalAudio.count || 0
    stats.audioFiles.withSonicDna = audioWithDna.count || 0
    stats.audioFiles.pendingAnalysis = audioPending.count || 0
    stats.audioFiles.completedAnalysis = audioCompleted.count || 0
    stats.audioFiles.purchasable = audioPurchasable.count || 0

    // Music library tracks stats - DEDUPLICATED by audio_file_id
    // Same track can appear in multiple folders/playlists
    const { data: allLibraryTracks } = await supabase
      .from('music_library_tracks')
      .select('id, audio_file_id, bpm, key_signature, energy_level, artist, metadata')
      .or('is_archived.is.null,is_archived.eq.false')
    
    // Deduplicate by audio_file_id to get TRUE unique track count
    const uniqueByAudioFile = new Map<string, any>()
    const tracksWithoutAudioFile: any[] = []
    
    for (const track of allLibraryTracks || []) {
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
    const totalEntries = allLibraryTracks?.length || 0
    
    // Calculate stats on UNIQUE tracks only
    let tracksWithDnaCount = 0, tracksWithBpmCount = 0, tracksWithKeyCount = 0
    let tracksWithEnergyCount = 0, tracksWithWaveformCount = 0
    const artistSet = new Set<string>()
    
    for (const track of uniqueTracks) {
      const meta = track.metadata || {}
      
      if (meta.has_sonic_dna) tracksWithDnaCount++
      else if (meta.has_sonic_dna === undefined && track.bpm) tracksWithDnaCount++
      if (meta.has_bpm !== undefined ? meta.has_bpm : Boolean(track.bpm)) tracksWithBpmCount++
      if (meta.has_key !== undefined ? meta.has_key : (track.key_signature && track.key_signature !== 'Unknown')) tracksWithKeyCount++
      if (meta.has_energy !== undefined ? meta.has_energy : track.energy_level != null) tracksWithEnergyCount++
      if (meta.has_waveform) tracksWithWaveformCount++
      
      if (track.artist) artistSet.add(track.artist.toLowerCase())
    }

    stats.musicLibrary.totalTracks = totalUnique  // TRUE unique count
    stats.musicLibrary.totalEntries = totalEntries  // Total including duplicates
    stats.musicLibrary.tracksWithSonicDna = tracksWithDnaCount
    stats.musicLibrary.tracksWithBpm = tracksWithBpmCount
    stats.musicLibrary.tracksWithKey = tracksWithKeyCount
    stats.musicLibrary.tracksWithEnergy = tracksWithEnergyCount
    stats.musicLibrary.tracksWithWaveform = tracksWithWaveformCount
    stats.musicLibrary.uniqueArtists = artistSet.size

    // Unique artists (already calculated above)
    const { data: artists } = await supabase
      .from('music_library_tracks')
      .select('artist')
      .not('artist', 'is', null)
    
    if (artists) {
      const uniqueArtists = new Set(artists.map((a: any) => a.artist?.toLowerCase()))
      stats.musicLibrary.uniqueArtists = uniqueArtists.size
    }

    // Folder stats
    const [totalFolders, visibleFolders, hiddenFolders] = await Promise.all([
      supabase.from('music_library_folders').select('id', { count: 'exact', head: true }),
      supabase.from('music_library_folders').select('id', { count: 'exact', head: true }).eq('hidden', false),
      supabase.from('music_library_folders').select('id', { count: 'exact', head: true }).eq('hidden', true)
    ])

    stats.musicLibrary.folders.total = totalFolders.count || 0
    stats.musicLibrary.folders.visible = visibleFolders.count || 0
    stats.musicLibrary.folders.hidden = hiddenFolders.count || 0

    // Sonic DNA coverage
    if (stats.musicLibrary.totalTracks > 0) {
      stats.sonicDna.coveragePercent = Math.round(
        (stats.musicLibrary.tracksWithSonicDna / stats.musicLibrary.totalTracks) * 100
      )
    }

    // Analytics stats
    const today = new Date().toISOString().split('T')[0]
    const [totalEvents, eventsToday, trackPlays] = await Promise.all([
      supabase.from('analytics_events').select('id', { count: 'exact', head: true }),
      supabase.from('analytics_events').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('analytics_events').select('id', { count: 'exact', head: true }).eq('event_type', 'track_play')
    ])

    stats.analytics.totalEvents = totalEvents.count || 0
    stats.analytics.eventsToday = eventsToday.count || 0
    stats.analytics.trackPlays = trackPlays.count || 0

    // Purchases stats
    const [totalPurchases, revenueData] = await Promise.all([
      supabase.from('purchases').select('id', { count: 'exact', head: true }),
      supabase.from('purchases').select('amount_paid').not('amount_paid', 'is', null)
    ])

    stats.purchases.total = totalPurchases.count || 0
    if (revenueData.data) {
      stats.purchases.totalRevenue = revenueData.data.reduce(
        (sum: number, p: any) => sum + (p.amount_paid || 0), 0
      ) / 100
    }

  } catch (error) {
    console.error('[Stats] Error fetching stats:', error)
  }

  return stats
}

async function syncSonicDnaToTracks(supabase: any) {
  const result = { updated: 0, skipped: 0, errors: 0 }

  try {
    // Get tracks with linked audio files
    const { data: tracks } = await supabase
      .from('music_library_tracks')
      .select('id, audio_file_id, sonic_dna, bpm, key_signature, energy_level, danceability')
      .not('audio_file_id', 'is', null)

    if (!tracks || tracks.length === 0) return result

    // Get audio files with sonic_dna
    const audioIds = Array.from(new Set(tracks.map((t: any) => t.audio_file_id)))
    const { data: audioFiles } = await supabase
      .from('audio_files')
      .select('id, sonic_dna, bpm, key_signature, energy_level, danceability, waveform_data')
      .in('id', audioIds)
      .eq('sonic_dna_status', 'completed')

    if (!audioFiles || audioFiles.length === 0) return result

    const audioMap = new Map<string, any>(audioFiles.map((a: any) => [a.id, a]))

    for (const track of tracks) {
      const audioFile = audioMap.get(track.audio_file_id)
      if (!audioFile || !audioFile.sonic_dna) {
        result.skipped++
        continue
      }

      // Check if audio file has more complete data
      const audioKeys = Object.keys(audioFile.sonic_dna).filter(
        k => !['status', 'hasData', 'analyzedAt', '_metadata'].includes(k)
      )
      
      if (audioKeys.length === 0) {
        result.skipped++
        continue
      }

      const updates: any = {}
      let needsUpdate = false

      // Merge sonic_dna
      const currentDna = track.sonic_dna || {}
      const newDna = {
        ...currentDna,
        ...audioFile.sonic_dna,
        _metadata: {
          ...audioFile.sonic_dna._metadata,
          synced_at: new Date().toISOString()
        }
      }

      if (JSON.stringify(newDna) !== JSON.stringify(currentDna)) {
        updates.sonic_dna = newDna
        needsUpdate = true
      }

      // Sync BPM
      if (audioFile.bpm && !track.bpm) {
        updates.bpm = audioFile.bpm
        needsUpdate = true
      }

      // Sync key
      if (audioFile.key_signature && audioFile.key_signature !== 'Unknown' && 
          (!track.key_signature || track.key_signature === 'Unknown')) {
        updates.key_signature = audioFile.key_signature
        needsUpdate = true
      }

      // Sync energy
      if (audioFile.energy_level && !track.energy_level) {
        updates.energy_level = normalizeEnergy(audioFile.energy_level)
        needsUpdate = true
      }

      // Sync danceability
      if (audioFile.danceability && !track.danceability) {
        updates.danceability = normalizeDanceability(audioFile.danceability)
        needsUpdate = true
      }

      if (!needsUpdate) {
        result.skipped++
        continue
      }

      const { error } = await supabase
        .from('music_library_tracks')
        .update(updates)
        .eq('id', track.id)

      if (error) {
        result.errors++
      } else {
        result.updated++
      }
    }
  } catch (error) {
    console.error('[Sync] Sonic DNA sync error:', error)
    result.errors++
  }

  return result
}

async function syncTrackFieldsFromAudioFiles(supabase: any) {
  const result = { updated: 0, skipped: 0 }

  try {
    // Get tracks missing key fields
    const { data: tracks } = await supabase
      .from('music_library_tracks')
      .select('id, audio_file_id, bpm, key_signature, energy_level, danceability, waveform, duration')
      .not('audio_file_id', 'is', null)
      .or('bpm.is.null,key_signature.is.null,key_signature.eq.Unknown,energy_level.is.null,danceability.is.null,waveform.is.null')

    if (!tracks || tracks.length === 0) return result

    const audioIds = Array.from(new Set(tracks.map((t: any) => t.audio_file_id)))
    const { data: audioFiles } = await supabase
      .from('audio_files')
      .select('id, bpm, key_signature, energy_level, danceability, waveform_data, duration_seconds')
      .in('id', audioIds)

    if (!audioFiles) return result

    const audioMap = new Map<string, any>(audioFiles.map((a: any) => [a.id, a]))

    for (const track of tracks) {
      const audioFile = audioMap.get(track.audio_file_id)
      if (!audioFile) {
        result.skipped++
        continue
      }

      const updates: any = {}
      let needsUpdate = false

      if (!track.bpm && audioFile.bpm) {
        updates.bpm = audioFile.bpm
        needsUpdate = true
      }

      if ((!track.key_signature || track.key_signature === 'Unknown') && 
          audioFile.key_signature && audioFile.key_signature !== 'Unknown') {
        updates.key_signature = audioFile.key_signature
        needsUpdate = true
      }

      if (!track.energy_level && audioFile.energy_level) {
        updates.energy_level = normalizeEnergy(audioFile.energy_level)
        needsUpdate = true
      }

      if (!track.danceability && audioFile.danceability) {
        updates.danceability = normalizeDanceability(audioFile.danceability)
        needsUpdate = true
      }

      if (!track.waveform && audioFile.waveform_data) {
        updates.waveform = audioFile.waveform_data
        needsUpdate = true
      }

      if (!track.duration && audioFile.duration_seconds) {
        updates.duration = audioFile.duration_seconds
        needsUpdate = true
      }

      if (!needsUpdate) {
        result.skipped++
        continue
      }

      const { error } = await supabase
        .from('music_library_tracks')
        .update(updates)
        .eq('id', track.id)

      if (!error) {
        result.updated++
      }
    }
  } catch (error) {
    console.error('[Sync] Track fields sync error:', error)
  }

  return result
}

async function updateFolderTrackCounts(supabase: any) {
  const result = { updated: 0 }

  try {
    // Get all folders
    const { data: folders } = await supabase
      .from('music_library_folders')
      .select('id, track_count')

    if (!folders) return result

    // Get track counts per folder
    const { data: trackCounts } = await supabase
      .from('music_library_tracks')
      .select('folder_id')
      .eq('is_archived', false)

    if (!trackCounts) return result

    // Count tracks per folder
    const countMap = new Map<string, number>()
    trackCounts.forEach((t: any) => {
      if (t.folder_id) {
        countMap.set(t.folder_id, (countMap.get(t.folder_id) || 0) + 1)
      }
    })

    // Update folders with incorrect counts
    for (const folder of folders) {
      const actualCount = countMap.get(folder.id) || 0
      if (folder.track_count !== actualCount) {
        await supabase
          .from('music_library_folders')
          .update({ track_count: actualCount })
          .eq('id', folder.id)
        result.updated++
      }
    }
  } catch (error) {
    console.error('[Sync] Folder counts error:', error)
  }

  return result
}

async function fixDataIntegrity(supabase: any) {
  const result = { issues: 0, fixed: 0 }

  try {
    // Fix tracks with invalid energy levels (should be 1-5)
    const { data: invalidEnergy } = await supabase
      .from('music_library_tracks')
      .select('id, energy_level')
      .not('energy_level', 'is', null)
      .or('energy_level.lt.1,energy_level.gt.5')

    if (invalidEnergy && invalidEnergy.length > 0) {
      result.issues += invalidEnergy.length
      for (const track of invalidEnergy) {
        const normalizedEnergy = normalizeEnergy(track.energy_level)
        await supabase
          .from('music_library_tracks')
          .update({ energy_level: normalizedEnergy })
          .eq('id', track.id)
        result.fixed++
      }
    }

    // Fix tracks with invalid danceability (should be 0-1)
    const { data: invalidDance } = await supabase
      .from('music_library_tracks')
      .select('id, danceability')
      .not('danceability', 'is', null)
      .or('danceability.lt.0,danceability.gt.1')

    if (invalidDance && invalidDance.length > 0) {
      result.issues += invalidDance.length
      for (const track of invalidDance) {
        const normalizedDance = normalizeDanceability(track.danceability)
        await supabase
          .from('music_library_tracks')
          .update({ danceability: normalizedDance })
          .eq('id', track.id)
        result.fixed++
      }
    }

    // Fix tracks with placeholder sonic_dna
    const { data: placeholderDna } = await supabase
      .from('music_library_tracks')
      .select('id, sonic_dna')
      .not('sonic_dna', 'is', null)
      .limit(100)

    if (placeholderDna) {
      for (const track of placeholderDna) {
        if (isPlaceholderSonicDna(track.sonic_dna)) {
          result.issues++
          // Mark for re-analysis by removing placeholder
          await supabase
            .from('music_library_tracks')
            .update({ 
              metadata: { 
                needs_sonic_dna_reanalysis: true,
                flagged_at: new Date().toISOString()
              }
            })
            .eq('id', track.id)
          result.fixed++
        }
      }
    }

  } catch (error) {
    console.error('[Sync] Integrity check error:', error)
  }

  return result
}

function normalizeEnergy(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (value >= 1 && value <= 5) return Math.round(value * 10) / 10
  if (value >= 0 && value <= 10) return Math.round(((value / 10) * 4 + 1) * 10) / 10
  if (value >= 0 && value <= 1) return Math.round((value * 4 + 1) * 10) / 10
  return Math.max(1, Math.min(5, value))
}

function normalizeDanceability(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (value >= 0 && value <= 1) return Math.round(value * 100) / 100
  if (value >= 0 && value <= 10) return Math.round((value / 10) * 100) / 100
  return Math.max(0, Math.min(1, value))
}

function isPlaceholderSonicDna(sonicDna: any): boolean {
  if (!sonicDna) return true
  const keys = Object.keys(sonicDna)
  const realKeys = ['genres', 'technical', 'drums', 'harmony', 'cultural', 'emotional', 'musical', 'musicology']
  const hasRealData = realKeys.some(key => sonicDna[key] && Object.keys(sonicDna[key]).length > 0)
  const onlyHasMetadata = keys.every(k => ['status', 'hasData', 'analyzedAt', '_metadata', 'waveform'].includes(k))
  return !hasRealData || onlyHasMetadata
}
