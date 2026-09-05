import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { generateSonicDNAWithAgents } from '@/utils/generateSonicDNAWithAgents'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { lockAnalysisForAudioFile } from '@/lib/catalog-lock'

export const dynamic = 'force-dynamic'

/**
 * POST /api/audio/regenerate-all-sonic-dna
 * 
 * Regenerates comprehensive Sonic DNA analysis for all tracks.
 * Only regenerates tracks that don't have comprehensive analysis, or all if force=true
 * 
 * Query params:
 * - force: Regenerate all tracks even if they have comprehensive analysis (default: false)
 * - limit: Limit number of tracks to analyze (default: all)
 * - batchSize: Number of tracks to process in parallel (default: 3)
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam) : null
    const batchSizeParam = searchParams.get('batchSize')
    const batchSize = batchSizeParam ? parseInt(batchSizeParam) : 3

    const supabase = createSupabaseServerClient()

    // Get tracks to analyze
    let query = supabase
      .from('audio_files')
      // Keep the initial scan lean; load full per-track details only when actually regenerating.
      .select('id, title, artist, sonic_dna, sonic_dna_status', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Filter based on force parameter
    if (!force) {
      // Only get tracks that don't have comprehensive analysis
      // Check for tracks where sonic_dna doesn't have 'comprehensive' field
      query = query.or('sonic_dna.is.null,sonic_dna_status.neq.completed')
    }

    if (limit) {
      query = query.limit(limit)
    }

    const { data: tracks, error, count } = await query

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch tracks', details: error.message },
        { status: 500 }
      )
    }

    if (!tracks || tracks.length === 0) {
      return NextResponse.json({
        message: 'No tracks to analyze',
        total: 0,
        analyzed: 0
      })
    }

    // Filter tracks that need comprehensive analysis (if not forcing)
    let tracksToAnalyze = tracks
    if (!force) {
      tracksToAnalyze = tracks.filter(track => {
        // Check if track has comprehensive analysis
        if (!track.sonic_dna || track.sonic_dna_status !== 'completed') {
          return true
        }
        // Check if sonic_dna has comprehensive field
        const hasComprehensive = track.sonic_dna && 
          typeof track.sonic_dna === 'object' && 
          'comprehensive' in track.sonic_dna
        return !hasComprehensive
      })
    }

    const totalTracks = tracksToAnalyze.length

    if (totalTracks === 0) {
      return NextResponse.json({
        message: 'All tracks already have comprehensive analysis',
        total: tracks.length,
        analyzed: 0,
        needsRegeneration: false
      })
    }

    // Start analysis in background
    analyzeTracksBatch(tracksToAnalyze, supabase, batchSize).catch(console.error)

    return NextResponse.json({
      message: 'Comprehensive analysis regeneration started',
      total: totalTracks,
      batchSize,
      force,
      status: 'processing'
    })
  } catch (error: any) {
    console.error('Regenerate all error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/audio/regenerate-all-sonic-dna
 * 
 * Get regeneration progress and statistics
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const supabase = createSupabaseServerClient()

    // Get all tracks
    const { count: totalTracks } = await supabase
      .from('audio_files')
      .select('*', { count: 'exact', head: true })

    // Get tracks with comprehensive analysis
    const { data: allTracks } = await supabase
      .from('audio_files')
      .select('id, sonic_dna, sonic_dna_status')

    let comprehensiveCount = 0
    let basicCount = 0
    let noAnalysisCount = 0

    if (allTracks) {
      allTracks.forEach(track => {
        if (track.sonic_dna_status === 'completed' && track.sonic_dna) {
          const hasComprehensive = track.sonic_dna && 
            typeof track.sonic_dna === 'object' && 
            'comprehensive' in track.sonic_dna
          if (hasComprehensive) {
            comprehensiveCount++
          } else {
            basicCount++
          }
        } else {
          noAnalysisCount++
        }
      })
    }

    return NextResponse.json({
      total: totalTracks || 0,
      comprehensive: comprehensiveCount,
      basic: basicCount,
      noAnalysis: noAnalysisCount,
      needsRegeneration: basicCount + noAnalysisCount,
      progress: totalTracks ? ((comprehensiveCount / totalTracks) * 100).toFixed(1) : '0'
    })
  } catch (error: any) {
    console.error('Get progress error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * Analyze tracks in batches (same as analyze-all-sonic-dna)
 */
async function analyzeTracksBatch(tracks: any[], supabase: any, batchSize: number = 3) {
  console.log(`Starting comprehensive regeneration for ${tracks.length} tracks`)

  for (let i = 0; i < tracks.length; i += batchSize) {
    const batch = tracks.slice(i, i + batchSize)
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tracks.length / batchSize)}`)

    await Promise.allSettled(
      batch.map(track => analyzeTrackAsync(track, supabase))
    )

    if (i + batchSize < tracks.length) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  console.log('Comprehensive regeneration complete')
}

/**
 * Analyze a single track with comprehensive analysis
 */
async function analyzeTrackAsync(track: any, supabase: any) {
  try {
    // Fetch per-track details only when needed (prevents TOAST-heavy full-table scans).
    const { data: fresh, error: freshErr } = await supabase
      .from('audio_files')
      .select('id, title, artist, file_url, file_path, bpm, key_signature, duration_seconds, energy_level, danceability, frequency_bands, waveform_data, waveform_samples, artwork_url, metadata')
      .eq('id', track.id)
      .maybeSingle()

    if (freshErr || !fresh) {
      throw new Error(`Failed to load track details: ${freshErr?.message || 'not found'}`)
    }

    await supabase
      .from('audio_files')
      .update({
        sonic_dna_status: 'processing',
        sonic_dna_analyzed_at: new Date().toISOString()
      })
      .eq('id', track.id)

    // Generate Sonic DNA using agent pipeline
    console.log(`[${fresh.title}] Generating Sonic DNA with agent team...`)
    let sonicDNA = await generateSonicDNAWithAgents(
      fresh.title,
      fresh.artist,
      fresh.id,
      {
        bpm: fresh.bpm,
        key: fresh.key_signature,
        duration: fresh.duration_seconds || 0,
        energyLevel: fresh.energy_level,
        frequencyBands: fresh.frequency_bands,
        audioFileUrl: fresh.file_url || fresh.file_path || null,
        filePath: fresh.file_path || null,
        // Pass existing waveform data if available (skip regeneration)
        waveformData: fresh.waveform_data && Array.isArray(fresh.waveform_data) && fresh.waveform_data.length > 0
          ? fresh.waveform_data
          : undefined,
        waveformSamples: fresh.waveform_samples || undefined
      }
    )
    console.log(`[${fresh.title}] Agent pipeline completed`)

    // Store results
    console.log(`[${track.title}] Storing results in database...`)
    
    // Prepare analysis data
    let analysisData = {
      bpm: sonicDNA.technical?.bpm || fresh.bpm || null,
      key_signature: sonicDNA.harmony?.keySignature || sonicDNA.technical?.key?.key || fresh.key_signature || null,
      energy_level: sonicDNA.technical?.energyLevel || fresh.energy_level || null,
      danceability: sonicDNA.technical?.danceability || null,
      waveform_data: sonicDNA.waveform?.data || fresh.waveform_data || null,
      waveform_samples: sonicDNA.waveform?.samples || fresh.waveform_samples || null,
      duration_seconds: fresh.duration_seconds || null,
      artwork_url: fresh.artwork_url || null
    }

    const locked = await lockAnalysisForAudioFile(supabase, fresh.id, sonicDNA, analysisData)
    sonicDNA = locked.sonicDNA
    analysisData = locked.analysisData
    
    // Merge sonic DNA and analysis data into metadata
    const updatedMetadata = mergeSonicDNAIntoMetadata(
      fresh.metadata || {},
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
      metadata: updatedMetadata // Always save sonic DNA to metadata
    }
    
    // Only include original_bpm if track already has it (column exists in DB)
    if (track.original_bpm !== undefined) {
      updateData.original_bpm = track.original_bpm || sonicDNA.technical?.bpm || track.bpm || null
    }
    
    const { error: updateError } = await supabase
      .from('audio_files')
      .update(updateData)
      .eq('id', track.id)

    if (updateError) {
      // If error is about original_bpm column not existing, retry without it
      if (updateError.message.includes('original_bpm') || updateError.message.includes('column')) {
        console.warn(`[${track.title}] original_bpm column not found, retrying without it:`, updateError.message)
        delete updateData.original_bpm
        
        const { error: retryError } = await supabase
          .from('audio_files')
          .update(updateData)
          .eq('id', track.id)
        
        if (retryError) {
          throw new Error(`Database update failed: ${retryError.message}`)
        } else {
          console.log(`[${track.title}] ✅ Update succeeded without original_bpm column`)
          return // Success, exit early
        }
      }
      throw new Error(`Database update failed: ${updateError.message}`)
    }

    console.log(`✅ Comprehensive analysis completed for: ${track.title}`)
  } catch (error: any) {
    console.error(`❌ Error analyzing ${track.title}:`, error.message)

    await supabase
      .from('audio_files')
      .update({
        sonic_dna_status: 'failed',
        sonic_dna_error: error.message || 'Unknown error during analysis',
        sonic_dna_analyzed_at: new Date().toISOString()
      })
      .eq('id', track.id)
  }
}

