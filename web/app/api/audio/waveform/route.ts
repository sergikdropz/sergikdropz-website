import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { findAudioFile } from '@/lib/findAudioFile'
import { extractVaultRelativePath, normalizeVaultAudioUrl } from '@/utils/normalizeVaultAudioUrl'
import { persistAudioFileArtifacts } from '@/utils/analysisArtifacts'
import { sanitizeWaveformPeaks } from '@/lib/audio/sanitize-waveform-peaks'
import { fetchWaveformPeaksFromUrl } from '@/lib/audio/waveform-peaks-source'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const WAVEFORM_SELECT = 'waveform_json_url, waveform_svg_url, file_path, file_name, title'

export async function GET(request: Request) {
    try {
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('path')
    const trackId = searchParams.get('trackId')

    if (!filePath && !trackId) {
      return NextResponse.json(
        { error: 'Missing path or trackId parameter' },
        { status: 400 }
      )
    }

    let supabase
    try {
      supabase = createSupabaseServerClient()
    } catch (supabaseError: any) {
      console.warn('Supabase not configured, returning 404 to allow fallback:', supabaseError.message)
      return NextResponse.json(
        { error: 'Track not found', waveform_data: null },
        { status: 404 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes('placeholder')) {
      console.warn('Supabase not configured, returning 404 to allow fallback')
      return NextResponse.json(
        { error: 'Track not found', waveform_data: null },
        { status: 404 }
      )
    }

    const lookupPath = filePath
      ? extractVaultRelativePath(filePath, { preferMp3: false }) ||
        extractVaultRelativePath(normalizeVaultAudioUrl(filePath), { preferMp3: false })
      : null
    let track: any = null
    try {
      track = await findAudioFile(supabase, {
        path: lookupPath,
        trackId,
        select: WAVEFORM_SELECT,
      })
    } catch (queryError: any) {
      console.warn('Database query error (returning 404 for fallback):', queryError.message)
      return NextResponse.json(
        { error: 'Track not found', waveform_data: null },
        { status: 404 }
      )
    }

    if (!track) {
      return NextResponse.json(
        { error: 'Track not found', waveform_data: null, searchedPath: lookupPath },
        { status: 404 }
      )
    }

    if (track.waveform_json_url) {
      const peaks = await fetchWaveformPeaksFromUrl(track.waveform_json_url)
      if (peaks?.length) {
        return NextResponse.json(
          {
            waveform_data: peaks,
            file_path: track.file_path,
            waveform_svg_url: track.waveform_svg_url || null,
          },
          {
            headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
          },
        )
      }
    }

    // Fallback for rows that predate the Storage backfill.
    const { data: withWaveform } = await supabase
      .from('audio_files')
      .select('waveform_data, file_path, file_name, title, waveform_svg_url')
      .eq('file_path', track.file_path)
      .maybeSingle()
    if (withWaveform) track = withWaveform

    if (!track.waveform_data || !Array.isArray(track.waveform_data)) {
      // Track exists but peaks were never generated — 200 avoids noisy client 404s.
      return NextResponse.json(
        { waveform_data: null, available: false, track: track.title, file_path: track.file_path },
        {
          status: 200,
          headers: { 'Cache-Control': 'private, no-store, max-age=0' },
        },
      )
    }

    return NextResponse.json(
      {
        waveform_data: track.waveform_data,
        file_path: track.file_path,
        waveform_svg_url: track.waveform_svg_url || null,
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }
      }
    )
  } catch (error: any) {
    console.error('Waveform fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/audio/waveform
 * Persist client-rescanned peaks onto audio_files + linked library tracks.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const body = await request.json().catch(() => ({}))
    const peaks = sanitizeWaveformPeaks(body.peaks ?? body.waveform_data)
    if (!peaks) {
      return NextResponse.json(
        { error: 'peaks must be an array of at least 64 numbers' },
        { status: 400 },
      )
    }

    const supabase = createSupabaseServerClient()
    const track = await findAudioFile(supabase, {
      path: body.path || null,
      trackId: body.trackId || null,
      audioFileId: body.audioFileId || null,
      title: body.title || null,
      select: 'id, file_path, file_name, metadata, waveform_svg_url, waveform_json_url',
    })
    if (!track?.id) {
      return NextResponse.json({ error: 'Audio file not found for this track' }, { status: 404 })
    }

    // Peaks are stored once in the audio-analysis bucket rather than as a TOASTed
    // JSONB column duplicated across audio_files and every linked library track.
    try {
      await persistAudioFileArtifacts({
        audioFileId: track.id,
        filePath: track.file_path,
        fileName: track.file_name,
        waveformData: peaks,
        existingMetadata: track.metadata,
        force: true,
      })
    } catch (err: any) {
      console.error('[waveform POST] artifact persist failed:', err?.message || err)
      return NextResponse.json(
        { error: err?.message || 'Failed to store waveform' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      audioFileId: track.id,
      samples: peaks.length,
    })
  } catch (error: any) {
    console.error('Waveform persist error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save waveform' },
      { status: 500 },
    )
  }
}
