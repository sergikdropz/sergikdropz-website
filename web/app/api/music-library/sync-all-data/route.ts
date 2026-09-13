import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { applyCatalogLock, catalogLockFromTrack, omitLockedCatalogColumns } from '@/lib/catalog-lock'
import { createSupabaseServerClient } from '@/lib/supabase'
import { buildTrackMetadata } from '@/utils/trackIndexUtils'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/music-library/sync-all-data
 * 
 * Syncs all data from audio_files to music_library_tracks.
 * Ensures all track editor fields are populated with latest data.
 * 
 * This endpoint:
 * 1. Fetches all audio_files with analysis data
 * 2. Matches to music_library_tracks
 * 3. Updates tracks with sonic_dna, bpm, key, energy, danceability
 * 4. Ensures consistency between tables
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const supabase = createSupabaseServerClient()

    // Get all tracks with their linked audio files
    const { data: tracks, error: tracksError } = await supabase
      .from('music_library_tracks')
      .select('id, title, audio_file_id, bpm, key_signature, genre, subgenre, energy_level, danceability, sonic_dna, metadata')
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
        message: 'No tracks to sync',
        stats: { total: 0, updated: 0 }
      })
    }

    // Get unique audio file IDs
    const audioFileIds = Array.from(new Set(tracks.map(t => t.audio_file_id).filter(Boolean)))

    // Fetch all audio files data
    const { data: audioFiles, error: audioError } = await supabase
      .from('audio_files')
      .select('id, bpm, key_signature, energy_level, danceability, sonic_dna, waveform_data')
      .in('id', audioFileIds)

    if (audioError) {
      return NextResponse.json(
        { error: `Failed to fetch audio files: ${audioError.message}` },
        { status: 500 }
      )
    }

    // Create lookup map
    const audioFilesMap = new Map<string, any>()
    audioFiles?.forEach(af => audioFilesMap.set(af.id, af))

    const stats = {
      total: tracks.length,
      updated: 0,
      skipped: 0,
      errors: 0,
      fieldsUpdated: {
        sonic_dna: 0,
        bpm: 0,
        key_signature: 0,
        energy_level: 0,
        danceability: 0,
        waveform: 0
      }
    }

    // Sync each track
    for (const track of tracks) {
      const audioFile = audioFilesMap.get(track.audio_file_id)
      if (!audioFile) {
        stats.skipped++
        continue
      }

      const lock = catalogLockFromTrack(track)
      const updates: any = {}
      let needsUpdate = false

      // Sync sonic_dna
      if (audioFile.sonic_dna && Object.keys(audioFile.sonic_dna).length > 3) {
        const audioDnaKeys = Object.keys(audioFile.sonic_dna)
        const hasMoreData = audioDnaKeys.some(k => !['status', 'hasData', 'analyzedAt', '_metadata'].includes(k))
        
        if (hasMoreData) {
          const merged = {
            ...track.sonic_dna,
            ...audioFile.sonic_dna,
            _metadata: {
              ...audioFile.sonic_dna._metadata,
              synced_at: new Date().toISOString()
            }
          }
          updates.sonic_dna = applyCatalogLock(lock, merged, {
            bpm: track.bpm,
            key_signature: track.key_signature,
          }).sonicDNA
          needsUpdate = true
          stats.fieldsUpdated.sonic_dna++
        }
      }

      // Sync BPM / key from analysis only when the catalog column is empty.
      if (audioFile.bpm && audioFile.bpm !== track.bpm) {
        updates.bpm = audioFile.bpm
        needsUpdate = true
        stats.fieldsUpdated.bpm++
      }

      // Sync key signature
      if (audioFile.key_signature && audioFile.key_signature !== 'Unknown' && 
          audioFile.key_signature !== track.key_signature) {
        updates.key_signature = audioFile.key_signature
        needsUpdate = true
        stats.fieldsUpdated.key_signature++
      }

      // Sync energy level (normalize to 1-5)
      if (audioFile.energy_level !== null && audioFile.energy_level !== undefined) {
        let normalizedEnergy = audioFile.energy_level
        if (normalizedEnergy > 5) normalizedEnergy = (normalizedEnergy / 10) * 4 + 1
        normalizedEnergy = Math.round(normalizedEnergy * 10) / 10
        
        if (normalizedEnergy !== track.energy_level) {
          updates.energy_level = normalizedEnergy
          needsUpdate = true
          stats.fieldsUpdated.energy_level++
        }
      }

      // Sync danceability (normalize to 0-1)
      if (audioFile.danceability !== null && audioFile.danceability !== undefined) {
        let normalizedDance = audioFile.danceability
        if (normalizedDance > 1) normalizedDance = normalizedDance / 10
        normalizedDance = Math.round(normalizedDance * 100) / 100
        
        if (normalizedDance !== track.danceability) {
          updates.danceability = normalizedDance
          needsUpdate = true
          stats.fieldsUpdated.danceability++
        }
      }

      // Sync waveform
      if (audioFile.waveform_data && !(track as any).waveform) {
        updates.waveform = audioFile.waveform_data
        needsUpdate = true
        stats.fieldsUpdated.waveform++
      }

      const lockedUpdates = omitLockedCatalogColumns(lock, updates)
      if (updates.bpm !== undefined && lockedUpdates.bpm === undefined && stats.fieldsUpdated.bpm > 0) {
        stats.fieldsUpdated.bpm--
      }
      if (updates.key_signature !== undefined && lockedUpdates.key_signature === undefined && stats.fieldsUpdated.key_signature > 0) {
        stats.fieldsUpdated.key_signature--
      }
      Object.keys(updates).forEach((key) => delete updates[key])
      Object.assign(updates, lockedUpdates)
      needsUpdate = Object.keys(updates).length > 0

      // Update metadata with full index rebuild
      if (needsUpdate) {
        const currentMetadata = track.metadata || {}
        const finalTrackState = {
          bpm: updates.bpm ?? track.bpm,
          key_signature: updates.key_signature ?? track.key_signature,
          sonic_dna: updates.sonic_dna ?? track.sonic_dna,
          waveform: updates.waveform ?? (track as any).waveform,
          artwork_url: (track as any).artwork_url,
          energy_level: updates.energy_level ?? track.energy_level,
          danceability: updates.danceability ?? track.danceability,
          audio_file_id: track.audio_file_id
        }
        // Rebuild index with all flags
        updates.metadata = buildTrackMetadata(finalTrackState, {
          ...currentMetadata,
          last_synced_at: new Date().toISOString()
        })
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
        console.error(`Error updating track ${track.id}:`, updateError.message)
        stats.errors++
      } else {
        stats.updated++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${stats.updated} tracks`,
      stats
    })

  } catch (error: any) {
    console.error('[Sync All Data] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    )
  }
}
