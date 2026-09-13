import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { generateSonicDNAWithAgents } from '@/utils/generateSonicDNAWithAgents'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { updateSonicDNACache } from '@/utils/sonicDNACache'
import { mergeSonicDNA } from '@/utils/mergeSonicDNA'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { lockAnalysisForAudioFile } from '@/lib/catalog-lock'
import { findAudioFile, hasStoredSonicDna } from '@/lib/findAudioFile'
import { loadSonicDnaIntelligenceCard, resolveMeasuredLookupIds } from '@/lib/audio/load-local-measured'
import {
  extractMeasured,
  hasDspMeasuredGroove,
  mergePreferredSonicDna,
  parseSonicDna,
  sonicDnaCompletenessPercent,
  sonicDnaStatusFromMeasured,
} from '@/lib/audio/sonic-dna-quality'
import { ensureSonicDnaReportSectionsFilled } from '@/lib/audio/sonic-dna-report-sections'
import { hasUnifiedSonicDnaIntelligence } from '@/lib/audio/compose-unified-sonic-dna'
import { isSonicDnaReadyForDisplay } from '@/lib/audio/sonic-dna-pipeline'
import {
  intelligenceCardSourceLabel,
  prepareSonicDnaFromIntelligence,
} from '@/lib/audio/sonic-dna-intelligence-load'
import { sonicDnaLookupPath } from '@/lib/audio/sonic-dna-query'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Fill thin DNA only — compiled intelligence + encyclopedia cards are returned as-is. */
function prepareSonicDnaResponse(dna: unknown): unknown {
  if (!dna) return dna
  const prepared = prepareSonicDnaFromIntelligence(dna)
  if (prepared) return prepared
  try {
    return ensureSonicDnaReportSectionsFilled(dna)
  } catch {
    return dna
  }
}

function loadKnowledgeSonicDna(opts: {
  trackId?: string | null
  audioFileId?: string | null
  filePath?: string | null
}) {
  return loadSonicDnaIntelligenceCard(opts)
}

function prefersDatabaseSonicDna(dna: unknown): boolean {
  const measured = extractMeasured(dna)
  if (!measured) return false
  return Boolean(
    measured.intelligence ||
      measured.report?.layers ||
      hasDspMeasuredGroove(measured),
  )
}

async function loadSonicDnaCache(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  opts: {
    libraryTrackId?: string | null
    audioFileId?: string | null
  },
) {
  const usable = (dna: unknown) => hasStoredSonicDna(dna) || Boolean(extractMeasured(dna))
  if (opts.libraryTrackId) {
    const { data } = await supabase
      .from('sonic_dna_cache')
      .select('sonic_dna')
      .eq('track_id', opts.libraryTrackId)
      .maybeSingle()
    if (usable(data?.sonic_dna)) return data?.sonic_dna
  }
  if (opts.audioFileId && UUID_RE.test(opts.audioFileId)) {
    const { data } = await supabase
      .from('sonic_dna_cache')
      .select('sonic_dna')
      .eq('audio_file_id', opts.audioFileId)
      .limit(1)
      .maybeSingle()
    if (usable(data?.sonic_dna)) return data?.sonic_dna
  }
  return null
}

async function loadLibrarySonicDna(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  opts: {
    libraryTrackId?: string | null
    audioFileId?: string | null
    title?: string | null
    filePath?: string | null
  },
) {
  const usable = (dna: unknown) => hasStoredSonicDna(dna) || Boolean(extractMeasured(dna))
  if (opts.libraryTrackId) {
    const { data } = await supabase
      .from('music_library_tracks')
      .select('sonic_dna')
      .eq('id', opts.libraryTrackId)
      .maybeSingle()
    if (usable(data?.sonic_dna)) return data?.sonic_dna
  }
  const audioIds = [
    opts.audioFileId,
    ...resolveMeasuredLookupIds(opts.libraryTrackId, opts.filePath),
    ...resolveMeasuredLookupIds(opts.audioFileId, opts.filePath),
  ]
  for (const audioFileId of audioIds) {
    if (!audioFileId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(audioFileId)) continue
    const { data } = await supabase
      .from('music_library_tracks')
      .select('sonic_dna')
      .eq('audio_file_id', audioFileId)
      .limit(1)
      .maybeSingle()
    if (usable(data?.sonic_dna)) return data?.sonic_dna
  }
  if (opts.title && opts.title.trim().length >= 3) {
    const { data } = await supabase
      .from('music_library_tracks')
      .select('sonic_dna')
      .eq('title', opts.title.trim())
      .limit(2)
    const rows = Array.isArray(data) ? data : data ? [data] : []
    if (rows.length === 1 && usable(rows[0]?.sonic_dna)) return rows[0].sonic_dna
  }
  return loadSonicDnaCache(supabase, {
    libraryTrackId: opts.libraryTrackId,
    audioFileId: opts.audioFileId,
  })
}

function persistMeasuredOverlay(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  audioFileId: string,
  merged: Record<string, any>,
) {
  const measured = extractMeasured(merged)
  if (!hasDspMeasuredGroove(measured)) return
  const status = sonicDnaStatusFromMeasured(measured)
  void Promise.all([
    supabase
      .from('audio_files')
      .update({
        sonic_dna: merged,
        sonic_dna_status: status,
        sonic_dna_analyzed_at: new Date().toISOString(),
      })
      .eq('id', audioFileId),
    supabase.from('music_library_tracks').update({ sonic_dna: merged }).eq('audio_file_id', audioFileId),
  ]).catch((err) => console.warn('[sonic-dna] persist overlay failed', err))
}

function withPercent(payload: Record<string, unknown>, status?: string | null, sonicDna?: unknown) {
  const resolvedStatus = typeof payload.status === 'string' ? payload.status : status
  return {
    ...payload,
    percent: sonicDnaCompletenessPercent(resolvedStatus, sonicDna),
  }
}

/** Completed DNA with measured groove is stable enough for CDN SWR. */
const DNA_COMPLETED_CACHE =
  'public, s-maxage=86400, stale-while-revalidate=604800'
const DNA_NO_STORE = 'no-store'

function dnaResponseCacheControl(status?: string | null, sonicDna?: unknown): string {
  if (status !== 'completed') return DNA_NO_STORE
  // Stub encyclopedia ("Awaiting audio analysis") must not stick in the CDN for a day.
  if (sonicDnaCompletenessPercent(status, sonicDna) <= 0) return DNA_NO_STORE
  if (!hasDspMeasuredGroove(extractMeasured(sonicDna))) return DNA_NO_STORE
  return DNA_COMPLETED_CACHE
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const filePath = sonicDnaLookupPath(searchParams.get('path'))
    const trackId = searchParams.get('trackId')
    const audioFileId = searchParams.get('audioFileId')
    const title = searchParams.get('title')

    if (!filePath && !trackId && !audioFileId) {
      return NextResponse.json(
        { error: 'Missing path or trackId parameter' },
        { status: 400 }
      )
    }

    const intelligenceCard = loadKnowledgeSonicDna({ trackId, audioFileId, filePath })
    const intelligenceDna = prepareSonicDnaFromIntelligence(intelligenceCard)
    if (intelligenceDna) {
      const sonicDNA = prepareSonicDnaResponse(intelligenceDna)
      const source = intelligenceCardSourceLabel(sonicDNA) || 'intelligence-encyclopedia'
      return NextResponse.json(
        withPercent(
          {
            sonicDNA,
            status: 'completed',
            cached: false,
            source,
            analyzedAt: extractMeasured(sonicDNA)?.analyzedAt || null,
          },
          'completed',
          sonicDNA,
        ),
        { headers: { 'Cache-Control': dnaResponseCacheControl('completed', sonicDNA) } },
      )
    }

    const supabase = createSupabaseServerClient()
    const sonicSelect = 'id, title, artist, file_path, file_url, sonic_dna_json_url, sonic_dna, sonic_dna_status, sonic_dna_analyzed_at, sonic_dna_error'
    let track: any = null
    try {
      track = await findAudioFile(supabase, {
        path: filePath,
        trackId,
        audioFileId,
        title,
        select: sonicSelect,
      })
    } catch (trackError: any) {
      console.error('Database error:', trackError)
      return NextResponse.json(
        { error: 'Database error', details: trackError.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (!track) {
      const lookupIds = [
        ...resolveMeasuredLookupIds(trackId, filePath),
        ...resolveMeasuredLookupIds(audioFileId, filePath),
      ]
      const localMeasured = loadKnowledgeSonicDna({
        trackId,
        audioFileId,
        filePath,
      })
      const libraryDna = await loadLibrarySonicDna(supabase, {
        libraryTrackId: trackId,
        audioFileId,
        title,
        filePath,
      })
      const merged = mergePreferredSonicDna(localMeasured, libraryDna)
      if (merged || hasStoredSonicDna(libraryDna) || localMeasured) {
        const sonicDNA = prepareSonicDnaResponse(merged || libraryDna || localMeasured)
        return NextResponse.json(
          withPercent(
            {
              sonicDNA,
              status: 'completed',
              cached: false,
              analyzedAt: null,
            },
            'completed',
            sonicDNA,
          ),
          { headers: { 'Cache-Control': dnaResponseCacheControl('completed', sonicDNA) } },
        )
      }
      return NextResponse.json(
        {
          error: 'Track not found in database',
          details: `Could not find track with path: ${filePath || trackId}. The track may need to be added to the database first.`,
          status: 'not_found'
        },
        { status: 404 }
      )
    }

    const storedHadMeasured = hasDspMeasuredGroove(extractMeasured(track.sonic_dna))
    const localMeasured = loadKnowledgeSonicDna({
      trackId,
      audioFileId: audioFileId || track.id,
      filePath,
    })
    if (localMeasured) {
      const intelligencePreferred = prepareSonicDnaFromIntelligence(localMeasured)
      track.sonic_dna = mergePreferredSonicDna(intelligencePreferred || localMeasured, track.sonic_dna)
    }

    const libraryDna = await loadLibrarySonicDna(supabase, {
      libraryTrackId: trackId,
      audioFileId: audioFileId || track.id,
      title,
      filePath,
    })
    if (libraryDna) {
      track.sonic_dna = mergePreferredSonicDna(track.sonic_dna, libraryDna)
    }

    const cacheDna = await loadSonicDnaCache(supabase, {
      libraryTrackId: trackId,
      audioFileId: audioFileId || track.id,
    })
    if (cacheDna) {
      track.sonic_dna = mergePreferredSonicDna(track.sonic_dna, cacheDna)
    }

    if ((!hasStoredSonicDna(track.sonic_dna) && !track.sonic_dna_json_url) && trackId) {
      const { data: lib } = await supabase
        .from('music_library_tracks')
        .select('sonic_dna')
        .eq('id', trackId)
        .maybeSingle()
      if (lib && hasStoredSonicDna(lib.sonic_dna)) {
        track.sonic_dna = mergePreferredSonicDna(track.sonic_dna, lib.sonic_dna)
      }
    }

    const mergedDna = parseSonicDna(track.sonic_dna)
    if (!storedHadMeasured && mergedDna && hasDspMeasuredGroove(extractMeasured(mergedDna))) {
      persistMeasuredOverlay(supabase, track.id, mergedDna)
    }

    // Prefer live DB DNA (measured groove + encyclopedia) over stale Storage JSON artifacts.
    if (hasStoredSonicDna(track.sonic_dna) || extractMeasured(track.sonic_dna) || track.sonic_dna_json_url) {
      if (prefersDatabaseSonicDna(track.sonic_dna)) {
        const sonicDNA = prepareSonicDnaResponse(parseSonicDna(track.sonic_dna) || track.sonic_dna)
        return NextResponse.json(
          withPercent(
            {
              sonicDNA,
              status: track.sonic_dna_status || 'completed',
              cached: false,
              analyzedAt: track.sonic_dna_analyzed_at,
              sonic_dna_json_url: track.sonic_dna_json_url || null,
              _dataVersion: '20260819-live-all',
            },
            track.sonic_dna_status || 'completed',
            sonicDNA,
          ),
          {
            headers: {
              'Cache-Control': dnaResponseCacheControl(track.sonic_dna_status || 'completed', sonicDNA),
            },
          },
        )
      }
      if (track.sonic_dna_json_url) {
        try {
          const res = await fetch(track.sonic_dna_json_url, { cache: 'force-cache' })
          if (res.ok) {
            const sonicDNA = prepareSonicDnaResponse(
              mergePreferredSonicDna(track.sonic_dna, await res.json()),
            )
            const parsedJsonDna = parseSonicDna(sonicDNA)
            if (!storedHadMeasured && parsedJsonDna && hasDspMeasuredGroove(extractMeasured(parsedJsonDna))) {
              persistMeasuredOverlay(supabase, track.id, parsedJsonDna)
            }
            return NextResponse.json(
              withPercent(
                {
                  sonicDNA,
                  status: track.sonic_dna_status || 'completed',
                  cached: true,
                  analyzedAt: track.sonic_dna_analyzed_at,
                  sonic_dna_json_url: track.sonic_dna_json_url,
                },
                track.sonic_dna_status || 'completed',
                sonicDNA,
              ),
              {
                headers: {
                  'Cache-Control': dnaResponseCacheControl(track.sonic_dna_status || 'completed', sonicDNA),
                },
              },
            )
          }
        } catch {
          // fall back to DB column
        }
      }

      const sonicDNA = prepareSonicDnaResponse(track.sonic_dna)
      return NextResponse.json(
        withPercent(
          {
            sonicDNA,
            status: track.sonic_dna_status || 'completed',
            cached: false, // Data now comes from DB, not cached file
            analyzedAt: track.sonic_dna_analyzed_at,
            sonic_dna_json_url: track.sonic_dna_json_url || null,
            _dataVersion: '2026-08-19',
          },
          track.sonic_dna_status || 'completed',
          sonicDNA,
        ),
        {
          headers: {
            'Cache-Control': dnaResponseCacheControl(track.sonic_dna_status || 'completed', sonicDNA),
          },
        },
      )
    }
    
    // If processing, return status with more info
    if (track.sonic_dna_status === 'processing') {
      return NextResponse.json(
        withPercent(
          {
            status: 'processing',
            message: 'Analysis in progress...',
            trackId: track.id,
            startedAt: track.sonic_dna_analyzed_at || new Date().toISOString(),
          },
          'processing',
        ),
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    
    // If failed, return error status
    if (track.sonic_dna_status === 'failed') {
      return NextResponse.json(
        withPercent(
          {
            status: 'failed',
            error: track.sonic_dna_error || 'Analysis failed',
            message: 'Previous analysis failed. You can retry by triggering a new analysis.',
          },
          'failed',
        ),
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    
    // Intelligence + encyclopedia fallback after DB row exists but columns are empty/stub-only.
    const intelligenceFallback = prepareSonicDnaFromIntelligence(localMeasured)
    if (intelligenceFallback) {
      const sonicDNA = prepareSonicDnaResponse(intelligenceFallback)
      const source = intelligenceCardSourceLabel(sonicDNA) || 'intelligence-encyclopedia'
      return NextResponse.json(
        withPercent(
          {
            sonicDNA,
            status: 'completed',
            cached: false,
            source,
            analyzedAt: extractMeasured(sonicDNA)?.analyzedAt || null,
          },
          'completed',
          sonicDNA,
        ),
        { headers: { 'Cache-Control': dnaResponseCacheControl('completed', sonicDNA) } },
      )
    }

    // If pending or no data, just return status - don't auto-start analysis
    return NextResponse.json(
      withPercent(
        {
          status: 'pending',
          message: 'No Sonic DNA data available. Analysis must be triggered manually.',
          trackId: track.id,
        },
        'pending',
      ),
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
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { searchParams } = new URL(request.url)
    const filePath = sonicDnaLookupPath(searchParams.get('path'))
    const trackId = searchParams.get('trackId')
    const audioFileId = searchParams.get('audioFileId')
    const title = searchParams.get('title')
    const force = searchParams.get('force') === 'true' // Add force parameter
    
    if (!filePath && !trackId && !audioFileId) {
      return NextResponse.json(
        { error: 'Missing path or trackId parameter' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()
    const postSelect = 'id, title, artist, file_url, file_path, file_name, bpm, key_signature, duration_seconds, energy_level, danceability, frequency_bands, waveform_data, waveform_samples, artwork_url, metadata, sonic_dna, sonic_dna_status'
    const track = await findAudioFile(supabase, {
      path: filePath,
      trackId,
      audioFileId,
      title,
      select: postSelect,
    })
    
    if (!track?.id) {
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
    let sonicDNA = existingSonicDNA 
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
    let analysisData = {
      bpm: sonicDNA.technical?.bpm || track.bpm || null,
      key_signature: sonicDNA.harmony?.keySignature || sonicDNA.technical?.key?.key || track.key_signature || null,
      energy_level: sonicDNA.technical?.energyLevel || track.energy_level || null,
      danceability: sonicDNA.technical?.danceability || null,
      waveform_data: sonicDNA.waveform?.data || track.waveform_data || null,
      waveform_samples: sonicDNA.waveform?.samples || track.waveform_samples || null,
      duration_seconds: track.duration_seconds || null,
      artwork_url: track.artwork_url || null
    }

    const locked = await lockAnalysisForAudioFile(supabase, track.id, sonicDNA, analysisData)
    sonicDNA = locked.sonicDNA
    analysisData = locked.analysisData
    
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

