/**
 * Regenerate All Sonic DNA Using Agent Pipeline
 * Efficient batch processing with specialized agents
 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { generateSonicDNAWithAgents, batchProcessTracks } from '@/utils/generateSonicDNAWithAgents'
import { requireAdminApi } from '@/lib/auth/route-policy'

export const dynamic = 'force-dynamic'

/**
 * POST /api/audio/regenerate-all-sonic-dna-agents
 * 
 * Regenerate comprehensive Sonic DNA for all tracks using agent pipeline
 * 
 * Query params:
 * - force: Regenerate all tracks (default: false)
 * - limit: Limit number of tracks (default: all)
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
      // Keep the initial scan lean; `audio_files` contains large TOASTed JSON (waveform/analysis).
      // We'll fetch full per-track details only when actually processing the track.
      .select('id, title, artist, file_url, file_path, sonic_dna, sonic_dna_status', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (!force) {
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
        if (!track.sonic_dna || track.sonic_dna_status !== 'completed') {
          return true
        }
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

    // Start batch processing in background
    processTracksBatch(tracksToAnalyze, supabase, batchSize).catch(console.error)

    return NextResponse.json({
      message: 'Agent pipeline analysis started',
      total: totalTracks,
      batchSize,
      force,
      status: 'processing',
      method: 'agent_pipeline'
    })
  } catch (error: any) {
    console.error('Agent pipeline batch error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * Process tracks in batches using agent pipeline
 */
async function processTracksBatch(tracks: any[], supabase: any, batchSize: number = 3) {
  const total = tracks.length
  let completed = 0
  let failed = 0

  console.log(`🚀 Starting agent pipeline batch processing: ${total} tracks`)

  // Process in batches
  for (let i = 0; i < tracks.length; i += batchSize) {
    const batch = tracks.slice(i, i + batchSize)
    
    // Process batch in parallel
    const batchPromises = batch.map(async (track) => {
      try {
        // Load full per-track details only when needed (prevents TOAST-heavy scans).
        const { data: fresh, error: freshErr } = await supabase
          .from('audio_files')
          .select('id, title, artist, file_url, file_path, bpm, key_signature, duration_seconds, energy_level, danceability, frequency_bands, waveform_data, waveform_samples, original_bpm')
          .eq('id', track.id)
          .maybeSingle()

        if (freshErr || !fresh) {
          throw new Error(`Failed to load track details: ${freshErr?.message || 'not found'}`)
        }

        // Mark as processing
        await supabase
          .from('audio_files')
          .update({ sonic_dna_status: 'processing' })
          .eq('id', track.id)

        // Generate using agent pipeline
        const sonicDNA = await generateSonicDNAWithAgents(
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

        // Store results
        const updateData: any = {
          sonic_dna: sonicDNA,
          sonic_dna_status: 'completed',
          sonic_dna_analyzed_at: new Date().toISOString(),
          ai_analysis: sonicDNA,
          sonic_dna_error: null,
          bpm: sonicDNA.technical?.bpm || fresh.bpm || null,
          key_signature: sonicDNA.harmony?.keySignature || sonicDNA.technical?.key?.key || fresh.key_signature || null,
          energy_level: sonicDNA.technical?.energyLevel || fresh.energy_level || null,
          danceability: sonicDNA.technical?.danceability || null
        }

        // Conditionally add original_bpm
        if ((fresh as any).original_bpm !== undefined) {
          updateData.original_bpm = (fresh as any).original_bpm || sonicDNA.technical?.bpm || fresh.bpm || null
        }

        const { error: updateError } = await supabase
          .from('audio_files')
          .update(updateData)
          .eq('id', track.id)

        if (updateError) {
          // Handle original_bpm gracefully
          if (updateError.message.includes('original_bpm')) {
            delete updateData.original_bpm
            const { error: retryError } = await supabase
              .from('audio_files')
              .update(updateData)
              .eq('id', track.id)
            
            if (retryError) {
              throw new Error(`Database update failed: ${retryError.message}`)
            }
          } else {
            throw new Error(`Database update failed: ${updateError.message}`)
          }
        }

        completed++
        console.log(`✅ [${completed}/${total}] ${track.title} - Agent pipeline complete`)
        return { success: true, trackId: track.id }
      } catch (error: any) {
        failed++
        console.error(`❌ [${track.title}] Agent pipeline failed:`, error.message)
        
        await supabase
          .from('audio_files')
          .update({
            sonic_dna_status: 'failed',
            sonic_dna_error: error.message || 'Unknown error',
            sonic_dna_analyzed_at: new Date().toISOString()
          })
          .eq('id', track.id)

        return { success: false, trackId: track.id, error: error.message }
      }
    })

    await Promise.all(batchPromises)

    // Small delay between batches
    if (i + batchSize < tracks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  console.log(`🎉 Agent pipeline batch complete: ${completed} completed, ${failed} failed`)
}

/**
 * GET /api/audio/regenerate-all-sonic-dna-agents
 * 
 * Get agent pipeline progress and statistics
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
    let processingCount = 0

    if (allTracks) {
      allTracks.forEach(track => {
        if (track.sonic_dna_status === 'processing') {
          processingCount++
        } else if (track.sonic_dna_status === 'completed' && track.sonic_dna) {
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
      processing: processingCount,
      needsRegeneration: basicCount + noAnalysisCount,
      progress: totalTracks ? ((comprehensiveCount / totalTracks) * 100).toFixed(1) : '0',
      method: 'agent_pipeline'
    })
  } catch (error: any) {
    console.error('Get progress error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

