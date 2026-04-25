/**
 * Sonic DNA Agent Pipeline API
 * Uses specialized AI agents for efficient analysis
 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { generateSonicDNAWithAgents } from '@/utils/generateSonicDNAWithAgents'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { updateSonicDNACache } from '@/utils/sonicDNACache'

export const dynamic = 'force-dynamic'

/**
 * POST /api/audio/sonic-dna-agents
 * 
 * Generate Sonic DNA using the agent pipeline system
 * 
 * Query params:
 * - trackId: Track ID in database
 * - force: Force regeneration (default: false)
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const trackId = searchParams.get('trackId')
    const force = searchParams.get('force') === 'true'
    let userDirective: string | undefined

    if (!trackId) {
      return NextResponse.json(
        { error: 'Missing trackId parameter' },
        { status: 400 }
      )
    }

    try {
      const body = await request.json()
      if (body?.directive && typeof body.directive === 'string') {
        userDirective = body.directive.trim()
      }
    } catch {
      // Ignore missing/invalid JSON body
    }

    const supabase = createSupabaseServerClient()

    // Get track from database with all necessary fields
    const { data: track, error: trackError } = await supabase
      .from('audio_files')
      .select('*')
      .eq('id', trackId)
      .single()

    if (trackError || !track) {
      console.error('Track not found in database:', { trackId, error: trackError })
      return NextResponse.json(
        { error: 'Track not found in database', details: trackError?.message },
        { status: 404 }
      )
    }

    // Log track information for debugging
    console.log('Processing track:', {
      id: track.id,
      title: track.title,
      artist: track.artist,
      file_url: track.file_url,
      file_path: track.file_path,
      hasAudioFile: !!(track.file_url || track.file_path)
    })

    // Check if already has comprehensive analysis (unless forcing)
    if (!force && track.sonic_dna_status === 'completed' && track.sonic_dna) {
      const hasComprehensive = track.sonic_dna && 
        typeof track.sonic_dna === 'object' && 
        'comprehensive' in track.sonic_dna
      
      if (hasComprehensive) {
        return NextResponse.json({
          status: 'completed',
          message: 'Track already has comprehensive analysis',
          sonicDNA: track.sonic_dna,
          cached: true
        })
      }
    }

    // Mark as processing
    await supabase
      .from('audio_files')
      .update({ sonic_dna_status: 'processing' })
      .eq('id', trackId)

    // Generate using agent pipeline
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
        audioFileUrl: track.file_url || track.file_path || null,
        filePath: track.file_path || null,
        // Pass existing waveform data if available (skip regeneration)
        waveformData: track.waveform_data && Array.isArray(track.waveform_data) && track.waveform_data.length > 0 
          ? track.waveform_data 
          : undefined,
        waveformSamples: track.waveform_samples || undefined
      },
      userDirective
    )

    // Prepare analysis data
    const analysisData = {
      bpm: sonicDNA.technical?.bpm || track.bpm || null,
      key_signature: sonicDNA.harmony?.keySignature || sonicDNA.technical?.key?.key || track.key_signature || null,
      energy_level: sonicDNA.technical?.energyLevel || track.energy_level || null,
      danceability: sonicDNA.technical?.danceability || null,
      waveform_data: track.waveform_data || null,
      waveform_samples: track.waveform_samples || null,
      duration_seconds: track.duration_seconds || null,
      artwork_url: track.artwork_url || null
    }
    
    // Merge sonic DNA and analysis data into metadata
    const updatedMetadata = mergeSonicDNAIntoMetadata(
      track.metadata || {},
      sonicDNA,
      analysisData
    )
    
    // Store results
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
      metadata: updatedMetadata // Always save sonic DNA to metadata
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
      // Handle original_bpm column gracefully
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

    // Update sonic_dna_cache for any music library tracks linked to this audio file
    try {
      const { data: linkedTracks } = await supabase
        .from('music_library_tracks')
        .select('id')
        .eq('audio_file_id', trackId)

      for (const linked of linkedTracks || []) {
        await updateSonicDNACache(linked.id, trackId, sonicDNA, {
          bpm: analysisData.bpm,
          key_signature: analysisData.key_signature,
          energy_level: analysisData.energy_level,
          danceability: analysisData.danceability,
        })
      }
    } catch (cacheErr) {
      console.warn('Failed to update sonic_dna_cache for audio file', trackId, cacheErr)
    }

    return NextResponse.json({
      status: 'completed',
      message: 'Analysis completed using agent pipeline',
      sonicDNA,
      cached: false
    })

  } catch (error: any) {
    console.error('Agent pipeline error:', error)
    return NextResponse.json(
      { error: 'Analysis failed', details: error.message },
      { status: 500 }
    )
  }
}
