import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { generateSonicDNAWithAgents } from '@/utils/generateSonicDNAWithAgents'
import { extractPathFromSupabaseUrl } from '@/utils/extractPathFromSupabaseUrl'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { updateSonicDNACache } from '@/utils/sonicDNACache'
import { mergeSonicDNA } from '@/utils/mergeSonicDNA'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('path')
    
    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      )
    }
    
    // Extract local path from Supabase URL if needed
    let localPath = extractPathFromSupabaseUrl(filePath)
    if (!localPath) {
      // If extraction failed, use the original path
      localPath = filePath
    }
    
    const storagePath = localPath.replace(/^\/audio\//, '').replace(/^\//, '')
    const supabase = createSupabaseServerClient()
    
    // Get track from database - try multiple path formats
    let { data: track, error: trackError } = await supabase
      .from('audio_files')
      // Prefer Storage-backed JSON artifact to avoid reading TOASTed `sonic_dna` from Postgres.
      .select('id, title, artist, file_path, file_url, sonic_dna_json_url, sonic_dna, sonic_dna_status, sonic_dna_analyzed_at, sonic_dna_error')
      .eq('file_path', storagePath)
      .maybeSingle()
    
    // If not found, try with file name
    if (!track && !trackError) {
      const fileName = storagePath.split('/').pop()
      if (fileName) {
        const { data: fileByName } = await supabase
          .from('audio_files')
          .select('id, title, artist, file_path, file_url, sonic_dna_json_url, sonic_dna, sonic_dna_status, sonic_dna_analyzed_at, sonic_dna_error')
          .ilike('file_name', fileName)
          .limit(1)
          .maybeSingle()
        
        if (fileByName) {
          track = fileByName
        }
      }
    }
    
    // If still not found, try searching by title/artist from the path
    if (!track && !trackError) {
      console.log('Track not found in database, searching by path:', storagePath)
      // Return a more helpful error
      return NextResponse.json(
        { 
          error: 'Track not found in database',
          details: `Could not find track with path: ${storagePath}. The track may need to be added to the database first.`,
          status: 'not_found'
        },
        { status: 404 }
      )
    }
    
    if (trackError) {
      console.error('Database error:', trackError)
      return NextResponse.json(
        { error: 'Database error', details: trackError.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    
    if (!track) {
      return NextResponse.json(
        { 
          error: 'Track not found in database',
          details: `Could not find track with path: ${storagePath}. The track may need to be added to the database first.`,
          status: 'not_found'
        },
        { status: 404 }
      )
    }
    
    // Check if Sonic DNA already exists
    if (track.sonic_dna_status === 'completed' && (track.sonic_dna_json_url || track.sonic_dna)) {
      // 1) Prefer the artifact file in Storage (CDN + SW cached)
      if (track.sonic_dna_json_url) {
        try {
          const res = await fetch(track.sonic_dna_json_url, { cache: 'force-cache' })
          if (res.ok) {
            const sonicDNA = await res.json()
            return NextResponse.json(
              {
                sonicDNA,
                status: 'completed',
                cached: true,
                analyzedAt: track.sonic_dna_analyzed_at,
                sonic_dna_json_url: track.sonic_dna_json_url,
              },
              { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
            )
          }
        } catch {
          // fall back to DB column
        }
      }

      return NextResponse.json(
        {
          sonicDNA: track.sonic_dna,
          status: 'completed',
          cached: false, // Data now comes from DB, not cached file
          analyzedAt: track.sonic_dna_analyzed_at,
          sonic_dna_json_url: track.sonic_dna_json_url || null,
          _dataVersion: '2026-01-30', // Cache buster for enhanced data
        },
        {
          // Shorter cache time after data updates - 5 minutes with 1 hour stale
          headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
        },
      )
    }
    
    // If processing, return status with more info
    if (track.sonic_dna_status === 'processing') {
      return NextResponse.json(
        {
          status: 'processing',
          message: 'Analysis in progress...',
          trackId: track.id,
          startedAt: track.sonic_dna_analyzed_at || new Date().toISOString(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    
    // If failed, return error status
    if (track.sonic_dna_status === 'failed') {
      return NextResponse.json(
        {
          status: 'failed',
          error: track.sonic_dna_error || 'Analysis failed',
          message: 'Previous analysis failed. You can retry by triggering a new analysis.',
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    
    // If pending or no data, just return status - don't auto-start analysis
    return NextResponse.json(
      {
        status: 'pending',
        message: 'No Sonic DNA data available. Analysis must be triggered manually.',
        trackId: track.id,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error: any) {
    console.error('Sonic DNA API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

// POST endpoint to trigger comprehensive analysis
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('path')
    const force = searchParams.get('force') === 'true' // Add force parameter
    
    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      )
    }
    
    // Extract local path from Supabase URL if needed
    let localPath = extractPathFromSupabaseUrl(filePath)
    if (!localPath) {
      // If extraction failed, use the original path
      localPath = filePath
    }
    
    const storagePath = localPath.replace(/^\/audio\//, '').replace(/^\//, '')
    const supabase = createSupabaseServerClient()
    
    // Get track from database
    let { data: track, error: trackError } = await supabase
      .from('audio_files')
      // Avoid selecting * (large TOAST columns). Only load what the agent pipeline needs.
      .select('id, title, artist, file_url, file_path, file_name, bpm, key_signature, duration_seconds, energy_level, danceability, frequency_bands, waveform_data, waveform_samples, artwork_url, metadata, sonic_dna, sonic_dna_status')
      .eq('file_path', storagePath)
      .maybeSingle()
    
    if (!track && !trackError) {
      const fileName = storagePath.split('/').pop()
      if (fileName) {
        const { data: fileByName } = await supabase
          .from('audio_files')
          .select('id, title, artist, file_url, file_path, file_name, bpm, key_signature, duration_seconds, energy_level, danceability, frequency_bands, waveform_data, waveform_samples, artwork_url, metadata, sonic_dna, sonic_dna_status')
          .ilike('file_name', fileName)
          .limit(1)
          .maybeSingle()
        
        if (fileByName) {
          track = fileByName
        }
      }
    }
    
    if (trackError || !track) {
      return NextResponse.json(
        { error: 'Track not found in database' },
        { status: 404 }
      )
    }
    
    // Check if existing analysis has comprehensive field
    const hasComprehensive = track.sonic_dna && 
      typeof track.sonic_dna === 'object' && 
      'comprehensive' in track.sonic_dna
    
    // Check if already processing (unless forcing)
    if (!force && track.sonic_dna_status === 'processing') {
      return NextResponse.json({
        status: 'processing',
        message: 'Analysis already in progress'
      })
    }
    
    // Check if already completed and not forcing
    if (!force && track.sonic_dna_status === 'completed' && track.sonic_dna) {
      if (hasComprehensive) {
        return NextResponse.json({
          status: 'completed',
          message: 'Comprehensive analysis already exists. Use force=true to regenerate.',
          hasComprehensive: true
        })
      }
    }
    
    // Mark as processing and start analysis
    await supabase
      .from('audio_files')
      .update({ sonic_dna_status: 'processing' })
      .eq('id', track.id)
    
    // Start comprehensive analysis in background
    analyzeTrackAsync(track, supabase).catch(console.error)
    
    return NextResponse.json({
      status: 'processing',
      message: force ? 'Regenerating comprehensive analysis...' : 'Comprehensive analysis started. This may take a few moments.',
      force
    })
  } catch (error: any) {
    console.error('Sonic DNA POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

async function analyzeTrackAsync(track: any, supabase: any) {
  try {
    console.log('Starting comprehensive analysis for track:', track.id, track.title)
    
    // Store existing Sonic DNA for merging
    const existingSonicDNA = track.sonic_dna
    
    // Update status to processing with timestamp
    await supabase
      .from('audio_files')
      .update({
        sonic_dna_status: 'processing',
        sonic_dna_analyzed_at: new Date().toISOString()
      })
      .eq('id', track.id)
    
    // Generate Sonic DNA using agent pipeline
    console.log(`[${track.title}] Generating Sonic DNA with agent team...`)
    const newSonicDNA = await generateSonicDNAWithAgents(
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
      }
    )
    
    console.log(`[${track.title}] Agent pipeline completed`)
    
    // MERGE new Sonic DNA with existing data (never lose old data)
    console.log(`[${track.title}] Merging with existing Sonic DNA data...`)
    const sonicDNA = existingSonicDNA 
      ? mergeSonicDNA(existingSonicDNA, newSonicDNA, {
          preferNew: true,
          preserveUserTags: true,
          mergeArrays: true,
          trackHistory: true
        })
      : newSonicDNA
    
    console.log(`[${track.title}] Merge complete. Preserved fields: ${sonicDNA._metadata?.preservedFields || 0}`)
    
    // Store results in database
    console.log(`[${track.title}] Storing results in database...`)
    
    // Prepare analysis data
    const analysisData = {
      bpm: sonicDNA.technical?.bpm || track.bpm || null,
      key_signature: sonicDNA.harmony?.keySignature || sonicDNA.technical?.key?.key || track.key_signature || null,
      energy_level: sonicDNA.technical?.energyLevel || track.energy_level || null,
      danceability: sonicDNA.technical?.danceability || null,
      waveform_data: sonicDNA.waveform?.data || track.waveform_data || null,
      waveform_samples: sonicDNA.waveform?.samples || track.waveform_samples || null,
      duration_seconds: track.duration_seconds || null,
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
        console.warn('original_bpm column not found, retrying without it:', updateError.message)
        delete updateData.original_bpm
        
        const { error: retryError } = await supabase
          .from('audio_files')
          .update(updateData)
          .eq('id', track.id)
        
        if (retryError) {
          throw new Error(`Database update failed: ${retryError.message}`)
        } else {
          console.log('✅ Update succeeded without original_bpm column')
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

    console.log('✅ Analysis completed and stored for track:', track.id)
    
  } catch (error: any) {
    console.error('❌ Analysis error for track', track.id, ':', error)
    console.error('Error stack:', error.stack)
    
    // Mark as failed with detailed error
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

