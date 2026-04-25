/**
 * Automatic Processing for Uploaded Tracks
 * Triggers agent pipeline analysis immediately after upload
 */

import { createSupabaseServerClient } from '@/lib/supabase'
import { generateSonicDNAWithAgents } from './generateSonicDNAWithAgents'
import { analyzeComprehensive } from './comprehensiveMusicAnalysis'
import { getMusicBrainzArtistDetails } from './musicbrainz'

/**
 * Process a newly uploaded track automatically
 * Runs in background - doesn't block upload response
 */
export async function processUploadAutomatically(trackId: string) {
  // Run in background - don't await
  setImmediate(async () => {
    try {
      console.log(`[Auto-Process] Starting automatic analysis for track: ${trackId}`)
      
      const supabase = createSupabaseServerClient()

      // Get track from database
      const { data: track, error: trackError } = await supabase
        .from('audio_files')
        .select('*')
        .eq('id', trackId)
        .single()

      if (trackError || !track) {
        console.error(`[Auto-Process] Track not found: ${trackId}`, trackError)
        return
      }

      // Check if already processed
      if (track.sonic_dna_status === 'completed' && track.sonic_dna) {
        const hasComprehensive = track.sonic_dna && 
          typeof track.sonic_dna === 'object' && 
          'comprehensive' in track.sonic_dna
        if (hasComprehensive) {
          console.log(`[Auto-Process] Track ${trackId} already has comprehensive analysis`)
          return
        }
      }

      // Mark as processing
      await supabase
        .from('audio_files')
        .update({ sonic_dna_status: 'processing' })
        .eq('id', trackId)

      console.log(`[Auto-Process] Step 1: Comprehensive analysis for ${track.title}`)
      
      // Step 1: Get comprehensive analysis
      const comprehensiveAnalysis = await analyzeComprehensive(
        track.title,
        track.artist,
        track.file_url || '',
        {
          bpm: track.bpm,
          key: track.key_signature,
          duration: track.duration_seconds || 0,
          energyLevel: track.energy_level,
          frequencyBands: track.frequency_bands
        }
      )

      // Step 2: Get MusicBrainz data
      console.log(`[Auto-Process] Step 2: MusicBrainz lookup for ${track.title}`)
      let musicbrainzData = null
      if (comprehensiveAnalysis.musicbrainz.artistId) {
        musicbrainzData = await getMusicBrainzArtistDetails(comprehensiveAnalysis.musicbrainz.artistId)
      }

      // Step 3: Generate Sonic DNA using agent pipeline (includes waveform generation)
      console.log(`[Auto-Process] Step 3: Agent pipeline for ${track.title}`)
      const sonicDNA = await generateSonicDNAWithAgents(
        track.title,
        track.artist,
        track.id,
        {
          bpm: track.bpm,
          key: track.key_signature,
          duration: track.duration_seconds || 0,
          energyLevel: track.energy_level,
          frequencyBands: track.frequency_bands,
          audioFileUrl: track.file_url || null,
          filePath: track.file_path || null
        }
      )

      // Step 4: Store results
      console.log(`[Auto-Process] Step 4: Storing results for ${track.title}`)
      const updateData: any = {
        sonic_dna: sonicDNA,
        sonic_dna_status: 'completed',
        sonic_dna_analyzed_at: new Date().toISOString(),
        ai_analysis: sonicDNA,
        sonic_dna_error: null,
        bpm: sonicDNA.technical?.bpm || track.bpm || null,
        key_signature: sonicDNA.harmony?.keySignature || sonicDNA.technical?.key?.key || track.key_signature || null,
        energy_level: sonicDNA.technical?.energyLevel || track.energy_level || null,
        danceability: sonicDNA.technical?.danceability || null,
        // Store waveform data from WaveformGenerator agent (The "Father")
        waveform_data: sonicDNA.waveform?.data || track.waveform_data || null,
        waveform_samples: sonicDNA.waveform?.samples || track.waveform_samples || null
      }

      // Conditionally add original_bpm
      if (track.original_bpm !== undefined) {
        updateData.original_bpm = track.original_bpm || sonicDNA.technical?.bpm || track.bpm || null
      }

      const { error: updateError } = await supabase
        .from('audio_files')
        .update(updateData)
        .eq('id', trackId)

      if (updateError) {
        // Handle original_bpm gracefully
        if (updateError.message.includes('original_bpm')) {
          delete updateData.original_bpm
          const { error: retryError } = await supabase
            .from('audio_files')
            .update(updateData)
            .eq('id', trackId)
          
          if (retryError) {
            throw new Error(`Database update failed: ${retryError.message}`)
          }
        } else {
          throw new Error(`Database update failed: ${updateError.message}`)
        }
      }

      console.log(`[Auto-Process] ✅ Successfully processed ${track.title} (${trackId})`)
    } catch (error: any) {
      console.error(`[Auto-Process] ❌ Error processing track ${trackId}:`, error)
      
      // Mark as failed
      try {
        const supabase = createSupabaseServerClient()
        await supabase
          .from('audio_files')
          .update({
            sonic_dna_status: 'failed',
            sonic_dna_error: error.message || 'Unknown error',
            sonic_dna_analyzed_at: new Date().toISOString()
          })
          .eq('id', trackId)
      } catch (updateError) {
        console.error(`[Auto-Process] Failed to update error status:`, updateError)
      }
    }
  })
}

