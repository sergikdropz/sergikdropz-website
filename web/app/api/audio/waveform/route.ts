import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { findAudioFile } from '@/lib/findAudioFile'
import { extractVaultRelativePath, normalizeVaultAudioUrl } from '@/utils/normalizeVaultAudioUrl'

export const dynamic = 'force-dynamic'

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
      try {
        const res = await fetch(track.waveform_json_url, { cache: 'no-store' })
        if (res.ok) {
          const waveform_data = await res.json()
          if (Array.isArray(waveform_data) && waveform_data.length > 0) {
            return NextResponse.json(
              {
                waveform_data,
                file_path: track.file_path,
                waveform_svg_url: track.waveform_svg_url || null,
              },
              {
                headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
              },
            )
          }
        }
      } catch {
        // fall through to DB waveform_data
      }
    }

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
