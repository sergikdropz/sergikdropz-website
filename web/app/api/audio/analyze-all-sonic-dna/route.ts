import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { generateSonicDNAWithAgents } from '@/utils/generateSonicDNAWithAgents'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { updateSonicDNACache } from '@/utils/sonicDNACache'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { lockAnalysisForAudioFile } from '@/lib/catalog-lock'
import { extractMeasured, sonicDnaStatusFromMeasured } from '@/lib/audio/sonic-dna-quality'

export const dynamic = 'force-dynamic'

/**
 * POST /api/audio/analyze-all-sonic-dna
 * 
 * Triggers comprehensive Sonic DNA analysis for all tracks in the database.
 * Processes tracks in batches to avoid overwhelming the system.
 * 
 * Query params:
 * - force: Re-analyze tracks that already have Sonic DNA (default: false)
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
      // IMPORTANT: keep this lean. `audio_files` contains large TOASTed JSON (waveforms/analysis).
      // We only need identifiers + status to decide what to analyze; the per-track worker will fetch details.
      .select('id, title, artist, file_url, file_path, sonic_dna_status', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Filter out tracks that already have Sonic DNA (unless force)
    if (!force) {
      query = query.or('sonic_dna_status.is.null,sonic_dna_status.neq.completed')
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

    const totalTracks = count || tracks.length

    // Start analysis in background (don't wait for completion)
    analyzeTracksBatch(tracks, supabase, batchSize).catch(console.error)

    return NextResponse.json({
      message: 'Analysis started',
      total: totalTracks,
      batchSize,
      force,
      status: 'processing'
    })
  } catch (error: any) {
    console.error('Analyze all error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/audio/analyze-all-sonic-dna
 * 
 * Get analysis progress and statistics
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const supabase = createSupabaseServerClient()

    // Get statistics
    const { count: totalTracks } = await supabase
      .from('audio_files')
      .select('*', { count: 'exact', head: true })

    const { count: completedCount } = await supabase
      .from('audio_files')
      .select('*', { count: 'exact', head: true })
      .eq('sonic_dna_status', 'completed')

    const { count: processingCount } = await supabase
      .from('audio_files')
      .select('*', { count: 'exact', head: true })
      .eq('sonic_dna_status', 'processing')

    const { count: failedCount } = await supabase
      .from('audio_files')
      .select('*', { count: 'exact', head: true })
      .eq('sonic_dna_status', 'failed')

    const { count: pendingCount } = await supabase
      .from('audio_files')
      .select('*', { count: 'exact', head: true })
      .or('sonic_dna_status.is.null,sonic_dna_status.eq.pending')

    return NextResponse.json({
      total: totalTracks || 0,
      completed: completedCount || 0,
      processing: processingCount || 0,
      failed: failedCount || 0,
      pending: pendingCount || 0,
      progress: totalTracks ? ((completedCount || 0) / totalTracks * 100).toFixed(1) : '0'
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
 * Analyze tracks in batches (background process)
 */
async function analyzeTracksBatch(tracks: any[], supabase: any, batchSize: number = 3) {
  console.log(`Starting batch analysis of ${tracks.length} tracks`)

  // Process in batches
  for (let i = 0; i < tracks.length; i += batchSize) {
    const batch = tracks.slice(i, i + batchSize)
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tracks.length / batchSize)}`)

    // Process batch in parallel
    await Promise.allSettled(
      batch.map(track => analyzeTrackAsync(track, supabase))
    )

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < tracks.length) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  console.log('Batch analysis complete')
}

/**
 * Analyze a single track (same logic as sonic-dna route)
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

    // Update status to processing
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
    
    // Store results in database
    const { error: updateError } = await supabase
      .from('audio_files')
      .update({
        sonic_dna: sonicDNA,
        sonic_dna_status: sonicDnaStatusFromMeasured(extractMeasured(sonicDNA)),
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
      })
      .eq('id', track.id)

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`)
    }

    // Update sonic_dna_cache for any music library tracks linked to this audio file
    try {
      const { data: linkedTracks } = await supabase
        .from('music_library_tracks')
        .select('id')
        .eq('audio_file_id', track.id)

      for (const linked of linkedTracks || []) {
        await updateSonicDNACache(linked.id, track.id, sonicDNA, {
          bpm: analysisData.bpm,
          key_signature: analysisData.key_signature,
          energy_level: analysisData.energy_level,
          danceability: analysisData.danceability,
        })
      }
    } catch (cacheErr) {
      console.warn('Failed to update sonic_dna_cache for audio file', track.id, cacheErr)
    }

    console.log(`✅ Completed analysis for: ${fresh.title}`)
  } catch (error: any) {
    console.error(`❌ Error analyzing ${track?.title || track?.id}:`, error.message)

    // Mark as failed
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

