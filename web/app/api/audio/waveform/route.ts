import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { fetchWaveformData } from '@/lib/fetchFromStorage'
import { extractPathFromSupabaseUrl } from '@/utils/extractPathFromSupabaseUrl'
import { normalizeVaultAudioUrl } from '@/utils/normalizeVaultAudioUrl'

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
    
    // Try to create Supabase client - handle missing env vars gracefully
    let supabase
    try {
      supabase = createSupabaseServerClient()
    } catch (supabaseError: any) {
      console.warn('Supabase not configured, returning 404 to allow fallback:', supabaseError.message)
      // Return 404 instead of 500 so client can fallback to generating waveform
      return NextResponse.json(
        { error: 'Track not found', waveform_data: null },
        { status: 404 }
      )
    }
    
    // Check if Supabase is actually configured (not placeholder)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes('placeholder')) {
      console.warn('Supabase not configured, returning 404 to allow fallback')
      return NextResponse.json(
        { error: 'Track not found', waveform_data: null },
        { status: 404 }
      )
    }
    
    // Extract local path from Supabase URL if needed
    const normalizedParam = normalizeVaultAudioUrl(filePath)
    let localPath = extractPathFromSupabaseUrl(normalizedParam)
    if (!localPath) {
      // If extraction failed, use the original path
      localPath = normalizedParam
    }
    localPath = normalizeVaultAudioUrl(localPath)
    
    // Normalize the path - try multiple formats
    const storagePath = localPath.replace(/^\/audio\//, '').replace(/^\//, '')
    const pathVariations = [
      storagePath,
      normalizedParam,
      normalizedParam.replace(/^\/audio\//, ''),
      `audio/${storagePath}`,
      `/audio/${storagePath}`
    ]
    
    let track: any = null
    let error = null
    
    // Try each path variation
    for (const path of pathVariations) {
      const { data, error: queryError } = await supabase
        .from('audio_files')
        // Prefer Storage-backed waveform JSON (smaller DB reads). If missing, we'll fall back to waveform_data.
        .select('waveform_json_url, waveform_svg_url, file_path, file_name, title')
        .eq('file_path', path)
        .maybeSingle()
      
      if (data) {
        track = data
        break
      }
      
      // Only break on actual errors, not "not found" errors
      if (queryError && queryError.code !== 'PGRST116') {
        error = queryError
        break
      }
    }
    
    // If not found, try with file name
    if (!track && !error) {
      const fileName = storagePath.split('/').pop()
      if (fileName) {
        const { data: fileByName, error: nameError } = await supabase
          .from('audio_files')
          .select('waveform_json_url, waveform_svg_url, file_path, file_name, title')
          .ilike('file_name', fileName)
          .limit(1)
          .maybeSingle()
        
        if (fileByName) {
          track = fileByName
        }
        
        // Only treat as error if it's not a "not found" error
        if (nameError && nameError.code !== 'PGRST116') {
          error = nameError
        }
      }
    }
    
    // If there's a real database error (not just "not found"), log it but return 404
    // so the client can fallback to generating the waveform
    if (error) {
      console.warn('Database query error (returning 404 for fallback):', error.message)
      return NextResponse.json(
        { error: 'Track not found', waveform_data: null },
        { status: 404 }
      )
    }
    
    if (!track) {
      // Return 404 instead of 500 when track not found
      return NextResponse.json(
        { error: 'Track not found', waveform_data: null, searchedPath: storagePath },
        { status: 404 }
      )
    }

    // 1) Prefer waveform JSON in Storage (CDN + SW cached)
    if (track.waveform_json_url) {
      try {
        const res = await fetch(track.waveform_json_url, { cache: 'force-cache' })
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
                headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
              },
            )
          }
        }
      } catch {
        // fall through to DB waveform_data
      }
    }

    // 2) Fallback: fetch waveform_data from Postgres (heavier)
    const { data: withWaveform } = await supabase
      .from('audio_files')
      .select('waveform_data, file_path, file_name, title, waveform_svg_url')
      .eq('file_path', track.file_path)
      .maybeSingle()
    if (withWaveform) track = withWaveform
    
    if (!track.waveform_data || !Array.isArray(track.waveform_data)) {
      return NextResponse.json(
        { error: 'Waveform not found', waveform_data: null, track: track.title },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      {
        waveform_data: track.waveform_data,
        file_path: track.file_path,
        waveform_svg_url: track.waveform_svg_url || null,
      },
      {
        // Precomputed waveform data should be highly cacheable.
        headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' }
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

