import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/auth/route-policy'

/**
 * API Route: List Audio Files from Supabase
 * 
 * GET /api/audio/list?format=WAV&purchasable=true&limit=50
 * 
 * Query params:
 * - format: Filter by format (WAV, MP3, FLAC, etc.)
 * - purchasable: Filter purchasable tracks (true/false)
 * - folder: Filter by folder path
 * - limit: Limit results (default: 100)
 * - offset: Pagination offset
 * 
 * Returns: { files: AudioFile[], total: number }
 */

// Force dynamic rendering since we use request.url
export const dynamic = 'force-dynamic'

// Cache audio list for 5 minutes
export const revalidate = 300

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format')
    const purchasable = searchParams.get('purchasable')
    const folder = searchParams.get('folder')
    const limitRaw = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')
    const includeWaveform = searchParams.get('include_waveform') === 'true'
    const includeMetadata = searchParams.get('include_metadata') === 'true'
    const includeAI = searchParams.get('include_ai') === 'true'
    const includeFrequencyBands = searchParams.get('include_frequency_bands') === 'true'
    const includeMusicBrainz = searchParams.get('include_musicbrainz') === 'true'
    const includeSonicDNA = searchParams.get('include_sonic_dna') === 'true'
    const includeCount = searchParams.get('include_count') === 'true'

    // Guardrails: prevent accidentally pulling massive TOAST columns at high volume.
    // (Waveform + metadata + AI analysis are the biggest Disk IO drivers in this project.)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 2000)) : 100
    // DNA/waveform blobs are selected-track only — refuse bulk TOAST reads.
    if ((includeSonicDNA || includeWaveform) && limit > 1) {
      return NextResponse.json(
        {
          error:
            'include_sonic_dna / include_waveform require limit=1. Load analysis per selected track via /api/audio/sonic-dna and /api/audio/waveform.',
        },
        { status: 400 },
      )
    }

    const supabase = createSupabaseServerClient()

    // Default: keep the payload lean to avoid loading large TOASTed JSON (waveforms, AI analysis, etc.)
    // Admin pages can opt-in via include_* query params when needed.
    const selectFields: string[] = [
      'id',
      'title',
      'artist',
      'file_name',
      'file_path',
      'file_url',
      'format',
      'size_bytes',
      'size_mb',
      'duration_seconds',
      'folder_path',
      'is_purchasable',
      'price_usd',
      'artwork_url',
      'analysis_status',
      'analysis_error',
      'analyzed_at',
      'sonic_dna_status',
      'sonic_dna_analyzed_at',
      'sonic_dna_error',
      'bpm',
      'key_signature',
      'energy_level',
      'danceability',
      'musicbrainz_id',
      'created_at',
      'updated_at',
    ]

    if (includeSonicDNA) selectFields.push('sonic_dna')
    if (includeWaveform) selectFields.push('waveform_data')
    if (includeMetadata) selectFields.push('metadata')
    if (includeAI) selectFields.push('ai_analysis')
    if (includeFrequencyBands) selectFields.push('frequency_bands')
    if (includeMusicBrainz) selectFields.push('musicbrainz_data')

    // Build query
    let query = supabase
      .from('audio_files')
      .select(selectFields.join(','), includeCount ? { count: 'exact' } : undefined)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (format) {
      query = query.eq('format', format.toUpperCase())
    }

    if (purchasable !== null) {
      query = query.eq('is_purchasable', purchasable === 'true')
    }

    if (folder) {
      query = query.eq('folder_path', folder)
    }

    const { data: files, error, count } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch audio files', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      files: files || [],
      ...(includeCount ? { total: count || 0 } : {}),
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('List error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

