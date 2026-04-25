/**
 * Optimized Upload Processing
 * Agents work DURING upload - parallel processing for maximum efficiency
 */

import { createSupabaseServerClient } from '@/lib/supabase'
import { generateSonicDNAWithAgents } from './generateSonicDNAWithAgents'
import { analyzeComprehensive } from './comprehensiveMusicAnalysis'
import { getMusicBrainzArtistDetails } from './musicbrainz'
import { extractMetadataFromBuffer } from './extractMetadataFromBuffer'
import { generateWaveformFromBuffer } from './generateWaveformFromBuffer'
import { mergeSonicDNAIntoMetadata } from './mergeSonicDNAIntoMetadata'

interface EarlyAnalysis {
  metadata: any
  waveform: any
  musicbrainz: any
}

/**
 * Process upload with early analysis (during upload)
 */
export async function processUploadOptimized(
  trackId: string,
  buffer: Buffer,
  fileName: string,
  fileUrl: string,
  filePath: string,
  earlyAnalysis?: EarlyAnalysis
) {
  // Run in background - don't await
  setImmediate(async () => {
    try {
      console.log(`[Optimized] Starting parallel analysis for track: ${trackId}`)
      
      const supabase = createSupabaseServerClient()

      // Get track from database
      const { data: track, error: trackError } = await supabase
        .from('audio_files')
        .select('*')
        .eq('id', trackId)
        .single()

      if (trackError || !track) {
        console.error(`[Optimized] Track not found: ${trackId}`, trackError)
        return
      }

      // Check if already processed
      if (track.sonic_dna_status === 'completed' && track.sonic_dna) {
        const hasComprehensive = track.sonic_dna && 
          typeof track.sonic_dna === 'object' && 
          'comprehensive' in track.sonic_dna
        if (hasComprehensive) {
          console.log(`[Optimized] Track ${trackId} already has comprehensive analysis`)
          return
        }
      }

      // Mark as processing
      await supabase
        .from('audio_files')
        .update({ sonic_dna_status: 'processing' })
        .eq('id', trackId)

      // Use early analysis results if available
      const metadata = earlyAnalysis?.metadata || {
        title: track.title,
        artist: track.artist,
        duration: track.duration_seconds || 0
      }

      const waveform = earlyAnalysis?.waveform
      const musicbrainzData = earlyAnalysis?.musicbrainz

      console.log(`[Optimized] Step 1: Comprehensive analysis for ${track.title}`)
      
      // Step 1: Get comprehensive analysis (can use early metadata)
      const comprehensiveAnalysis = await analyzeComprehensive(
        metadata.title || track.title,
        metadata.artist || track.artist,
        fileUrl,
        {
          bpm: metadata.bpm || track.bpm,
          key: metadata.key || track.key_signature,
          duration: metadata.duration || track.duration_seconds || 0,
          energyLevel: track.energy_level,
          frequencyBands: track.frequency_bands
        }
      )

      // Step 2: Get MusicBrainz data (use early result if available)
      let finalMusicbrainzData = musicbrainzData
      if (!finalMusicbrainzData && comprehensiveAnalysis.musicbrainz.artistId) {
        console.log(`[Optimized] Step 2: MusicBrainz lookup for ${track.title}`)
        finalMusicbrainzData = await getMusicBrainzArtistDetails(comprehensiveAnalysis.musicbrainz.artistId)
      }

      // Step 3: Generate Sonic DNA using agent pipeline
      console.log(`[Optimized] Step 3: Agent pipeline for ${track.title}`)
      const sonicDNA = await generateSonicDNAWithAgents(
        metadata.title || track.title,
        metadata.artist || track.artist,
        track.id,
        {
          bpm: metadata.bpm || track.bpm,
          key: metadata.key || track.key_signature,
          duration: metadata.duration || track.duration_seconds || 0,
          energyLevel: track.energy_level,
          frequencyBands: track.frequency_bands,
          audioFileUrl: fileUrl,
          filePath: filePath
        }
      )

      // Use early waveform if available, otherwise use agent-generated
      const finalWaveform = waveform || sonicDNA.waveform

      // Step 4: Store results
      console.log(`[Optimized] Step 4: Storing results for ${track.title}`)
      
      // Prepare analysis data
      const analysisData = {
        bpm: sonicDNA.technical?.bpm || metadata.bpm || track.bpm || null,
        key_signature: sonicDNA.harmony?.keySignature || sonicDNA.technical?.key?.key || metadata.key || track.key_signature || null,
        energy_level: sonicDNA.technical?.energyLevel || track.energy_level || null,
        danceability: sonicDNA.technical?.danceability || null,
        waveform_data: finalWaveform?.data || sonicDNA.waveform?.data || track.waveform_data || null,
        waveform_samples: finalWaveform?.samples || sonicDNA.waveform?.samples || track.waveform_samples || null,
        duration_seconds: metadata.duration || track.duration_seconds || null,
        artwork_url: track.artwork_url || null
      }
      
      // Merge sonic DNA and analysis data into metadata
      const updatedMetadata = mergeSonicDNAIntoMetadata(
        track.metadata || {},
        sonicDNA,
        analysisData
      )
      
      const updateData: any = {
        sonic_dna: sonicDNA,
        sonic_dna_status: 'completed',
        sonic_dna_analyzed_at: new Date().toISOString(),
        ai_analysis: sonicDNA,
        sonic_dna_error: null,
        bpm: analysisData.bpm,
        key_signature: analysisData.key_signature,
        energy_level: analysisData.energy_level,
        danceability: analysisData.danceability,
        waveform_data: analysisData.waveform_data,
        waveform_samples: analysisData.waveform_samples,
        duration_seconds: analysisData.duration_seconds,
        metadata: updatedMetadata // Always save sonic DNA to metadata
      }

      // Conditionally add original_bpm
      if (track.original_bpm !== undefined) {
        updateData.original_bpm = track.original_bpm || sonicDNA.technical?.bpm || metadata.bpm || track.bpm || null
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

      console.log(`[Optimized] ✅ Successfully processed ${track.title} (${trackId})`)
    } catch (error: any) {
      console.error(`[Optimized] ❌ Error processing track ${trackId}:`, error)
      
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
        console.error(`[Optimized] Failed to update error status:`, updateError)
      }
    }
  })
}

