import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/music-library/stats
 * 
 * Fast statistics endpoint that uses pre-indexed metadata.
 * Shows UNIQUE track counts based on audio_file_id (not duplicate entries).
 * 
 * Returns track coverage statistics calculated server-side.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await getMusicVaultApiAccess(request)
    if (!gate.ok) return gate.response

    const supabase = createSupabaseServerClient()

    // Fetch only the lightweight fields needed for stats
    // metadata contains pre-indexed flags: has_bpm, has_key, has_sonic_dna, etc.
    const { data: tracks, error } = await supabase
      .from('music_library_tracks')
      .select('id, bpm, key_signature, energy_level, danceability, artwork_url, audio_file_id, metadata')
      .or('is_archived.is.null,is_archived.eq.false')

    if (error) {
      console.error('Error fetching tracks for stats:', error)
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }

    // Deduplicate by audio_file_id to get TRUE unique tracks
    // Same track can appear in multiple folders/playlists
    const uniqueTracksMap = new Map<string, any>()
    const tracksWithoutAudioFile: any[] = []
    
    for (const track of tracks || []) {
      if (track.audio_file_id) {
        // Only keep one entry per unique audio file
        if (!uniqueTracksMap.has(track.audio_file_id)) {
          uniqueTracksMap.set(track.audio_file_id, track)
        }
      } else {
        // Tracks without audio_file_id are counted separately
        tracksWithoutAudioFile.push(track)
      }
    }
    
    // Combine unique tracks
    const uniqueTracks = [...Array.from(uniqueTracksMap.values()), ...tracksWithoutAudioFile]
    const totalUnique = uniqueTracks.length
    const totalEntries = tracks?.length || 0

    if (totalUnique === 0) {
      return NextResponse.json({
        success: true,
        stats: {
          total: 0,
          totalEntries: 0,
          completeness: {
            bpm: 0, key: 0, genre: 0, artwork: 0, linked: 0,
            sonicDna: 0, energy: 0, danceability: 0, waveform: 0
          }
        }
      })
    }

    // Calculate stats using UNIQUE tracks only
    let withBpm = 0, withKey = 0, withGenre = 0, withArtwork = 0, linked = 0
    let withSonicDna = 0, withEnergy = 0, withDanceability = 0, withWaveform = 0

    for (const track of uniqueTracks) {
      const meta = track.metadata || {}

      // Use indexed flags if available, otherwise check direct fields
      if (meta.has_bpm !== undefined ? meta.has_bpm : track.bpm) withBpm++
      if (meta.has_key !== undefined ? meta.has_key : (track.key_signature && track.key_signature !== 'Unknown')) withKey++
      if (meta.has_sonic_dna !== undefined ? meta.has_sonic_dna : false) withSonicDna++
      if (meta.has_waveform !== undefined ? meta.has_waveform : false) withWaveform++
      if (meta.has_artwork !== undefined ? meta.has_artwork : track.artwork_url) withArtwork++
      if (meta.has_energy !== undefined ? meta.has_energy : (track.energy_level != null)) withEnergy++
      if (meta.has_danceability !== undefined ? meta.has_danceability : (track.danceability != null)) withDanceability++
      if (meta.is_linked !== undefined ? meta.is_linked : track.audio_file_id) linked++
      
      // Genre from indexed metadata
      if (meta.primary_genre || meta.genres?.length > 0) withGenre++
    }

    const stats = {
      total: totalUnique,  // TRUE unique track count
      totalEntries,        // Total rows (includes duplicates in playlists)
      withBpm,
      withKey,
      withGenre,
      withArtwork,
      linked,
      withSonicDna,
      withEnergy,
      withDanceability,
      withWaveform,
      completeness: {
        bpm: Math.round((withBpm / totalUnique) * 100),
        key: Math.round((withKey / totalUnique) * 100),
        genre: Math.round((withGenre / totalUnique) * 100),
        artwork: Math.round((withArtwork / totalUnique) * 100),
        linked: Math.round((linked / totalUnique) * 100),
        sonicDna: Math.round((withSonicDna / totalUnique) * 100),
        energy: Math.round((withEnergy / totalUnique) * 100),
        danceability: Math.round((withDanceability / totalUnique) * 100),
        waveform: Math.round((withWaveform / totalUnique) * 100),
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      cached: false,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Stats API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
