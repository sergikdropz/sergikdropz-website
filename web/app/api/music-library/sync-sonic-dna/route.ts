import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { getServerSession } from '@/lib/auth'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

/**
 * POST /api/music-library/sync-sonic-dna
 * Sync Sonic DNA data from audio_files to music_library_tracks
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await supabaseIsReachable())) {
      return supabaseUnavailableResponse()
    }

    const supabase = createSupabaseServerClient()

    // Get all tracks with audio_file_id
    const { data: tracks, error: tracksError } = await supabase
      .from('music_library_tracks')
      .select('id, title, audio_file_id, sonic_dna, bpm, key_signature, energy_level, danceability, waveform, duration, artwork_url, created_at, date, year, metadata')
      .not('audio_file_id', 'is', null)

    if (tracksError) {
      return NextResponse.json(
        { error: `Failed to fetch tracks: ${tracksError.message}` },
        { status: 500 }
      )
    }

    if (!tracks || tracks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No tracks with audio_file_id found',
        stats: {
          total: 0,
          updated: 0,
          skipped: 0,
          errors: 0,
        },
      })
    }

    // Get all unique audio_file_ids
    const audioFileIds = Array.from(new Set(tracks.map(t => t.audio_file_id).filter(Boolean)))

    // Fetch audio files data - get ALL relevant fields
    const { data: audioFiles, error: audioFilesError } = await supabase
      .from('audio_files')
      .select('id, sonic_dna, bpm, key_signature, energy_level, danceability, waveform_data, sonic_dna_status, duration_seconds, artwork_url, created_at, metadata')
      .in('id', audioFileIds)

    if (audioFilesError) {
      return NextResponse.json(
        { error: `Failed to fetch audio files: ${audioFilesError.message}` },
        { status: 500 }
      )
    }

    if (!audioFiles || audioFiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No audio files found',
        stats: {
          total: tracks.length,
          updated: 0,
          skipped: 0,
          errors: 0,
        },
      })
    }

    // Create a map for quick lookup
    const audioFilesMap = new Map()
    audioFiles.forEach(af => {
      audioFilesMap.set(af.id, af)
    })

    // Process each track
    const stats = {
      total: tracks.length,
      updated: 0,
      skipped: 0,
      errors: 0,
      sonicDnaUpdated: 0,
      bpmUpdated: 0,
      keySignatureUpdated: 0,
      energyLevelUpdated: 0,
      danceabilityUpdated: 0,
      waveformUpdated: 0,
      durationUpdated: 0,
      artworkUpdated: 0,
      metadataUpdated: 0,
    }

    const errors: string[] = []

    for (const track of tracks) {
      const audioFile = audioFilesMap.get(track.audio_file_id)

      if (!audioFile) {
        errors.push(`Track "${track.title}" (ID: ${track.id}) - Audio file not found`)
        stats.errors++
        continue
      }

      // Check what needs updating
      const updates: any = {}
      let needsUpdate = false

      // Check sonic_dna - only update if audio_file has actual analysis data
      if (audioFile.sonic_dna) {
        const audioDna = typeof audioFile.sonic_dna === 'string' ? JSON.parse(audioFile.sonic_dna) : audioFile.sonic_dna
        // Check if audio_file has actual analysis data (not just status metadata)
        const hasActualData = !!(audioDna.genres || audioDna.musical || audioDna.technical || audioDna.drums || audioDna.comprehensive)
        
        if (hasActualData) {
          const trackDnaStr = track.sonic_dna ? JSON.stringify(track.sonic_dna) : null
          const audioDnaStr = JSON.stringify(audioFile.sonic_dna)
          // Only update if different AND track doesn't have actual data
          const trackDna = track.sonic_dna ? (typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna) : null
          const trackHasActualData = trackDna ? !!(trackDna.genres || trackDna.musical || trackDna.technical || trackDna.drums || trackDna.comprehensive) : false
          
          if (!trackHasActualData || trackDnaStr !== audioDnaStr) {
            updates.sonic_dna = audioFile.sonic_dna
            needsUpdate = true
            stats.sonicDnaUpdated++
          }
        }
      }

      // Check bpm
      if (audioFile.bpm && (!track.bpm || track.bpm !== audioFile.bpm)) {
        updates.bpm = audioFile.bpm
        needsUpdate = true
        stats.bpmUpdated++
      }

      // Check key_signature
      if (audioFile.key_signature && (!track.key_signature || track.key_signature !== audioFile.key_signature)) {
        updates.key_signature = audioFile.key_signature
        needsUpdate = true
        stats.keySignatureUpdated++
      }

      // Check energy_level
      if (audioFile.energy_level !== null && audioFile.energy_level !== undefined &&
          (!track.energy_level || track.energy_level !== audioFile.energy_level)) {
        updates.energy_level = audioFile.energy_level
        needsUpdate = true
        stats.energyLevelUpdated++
      }

      // Check danceability
      if (audioFile.danceability !== null && audioFile.danceability !== undefined &&
          (!track.danceability || track.danceability !== audioFile.danceability)) {
        updates.danceability = audioFile.danceability
        needsUpdate = true
        stats.danceabilityUpdated++
      }

      // Check waveform
      if (audioFile.waveform_data) {
        const trackWaveformStr = track.waveform ? JSON.stringify(track.waveform) : null
        const audioWaveformStr = JSON.stringify(audioFile.waveform_data)
        if (trackWaveformStr !== audioWaveformStr) {
          updates.waveform = audioFile.waveform_data
          needsUpdate = true
          stats.waveformUpdated++
        }
      }

      // Check duration (if missing in track)
      if (audioFile.duration_seconds && (!track.duration || track.duration !== audioFile.duration_seconds)) {
        updates.duration = audioFile.duration_seconds
        needsUpdate = true
        stats.durationUpdated++
      }

      // Check artwork (if missing in track)
      if (audioFile.artwork_url && (!track.artwork_url || track.artwork_url !== audioFile.artwork_url)) {
        updates.artwork_url = audioFile.artwork_url
        needsUpdate = true
        stats.artworkUpdated++
      }

      // Check created_at/date (if missing in track)
      if (audioFile.created_at && !track.created_at) {
        updates.created_at = audioFile.created_at
        needsUpdate = true
      }

      // Always sync metadata to include sonic DNA and all analysis data
      const analysisData = {
        bpm: updates.bpm !== undefined ? updates.bpm : track.bpm,
        key_signature: updates.key_signature !== undefined ? updates.key_signature : track.key_signature,
        energy_level: updates.energy_level !== undefined ? updates.energy_level : track.energy_level,
        danceability: updates.danceability !== undefined ? updates.danceability : track.danceability,
        waveform_data: updates.waveform !== undefined ? updates.waveform : track.waveform,
        duration_seconds: updates.duration !== undefined ? updates.duration : track.duration,
        artwork_url: updates.artwork_url !== undefined ? updates.artwork_url : track.artwork_url
      }
      
      // Get the final sonic DNA (from updates or existing)
      const finalSonicDNA = updates.sonic_dna !== undefined ? updates.sonic_dna : track.sonic_dna
      
      // Merge sonic DNA and analysis data into metadata
      const trackMetadata = track.metadata || {}
      const audioMetadata = audioFile.metadata && typeof audioFile.metadata === 'object' ? audioFile.metadata : {}
      
      // Start with audio_file metadata, then merge track metadata, then add sonic DNA
      const mergedMetadata = mergeSonicDNAIntoMetadata(
        { ...audioMetadata, ...trackMetadata },
        finalSonicDNA,
        analysisData
      )
      
      // Always update metadata to ensure sonic DNA is included
      const metadataStr = JSON.stringify(mergedMetadata)
      const trackMetadataStr = JSON.stringify(trackMetadata)
      
      if (metadataStr !== trackMetadataStr) {
        updates.metadata = mergedMetadata
        needsUpdate = true
        stats.metadataUpdated++
      }

      if (!needsUpdate) {
        stats.skipped++
        continue
      }

      // Apply updates
      const { error: updateError } = await supabase
        .from('music_library_tracks')
        .update(updates)
        .eq('id', track.id)

      if (updateError) {
        errors.push(`Error updating track "${track.title}": ${updateError.message}`)
        stats.errors++
      } else {
        stats.updated++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced Sonic DNA data. Updated ${stats.updated} tracks.`,
      stats: {
        ...stats,
        errors: errors.length > 0 ? errors : undefined,
      },
    })
  } catch (error: any) {
    console.error('Error syncing Sonic DNA:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync Sonic DNA' },
      { status: 500 }
    )
  }
}
