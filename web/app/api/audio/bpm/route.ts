import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { extractPathFromSupabaseUrl } from '@/utils/extractPathFromSupabaseUrl'

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
      // Return 200 with null BPM to avoid console errors - client will handle fallback
      return NextResponse.json(
        { bpm: null }
      )
    }
    
    // Check if Supabase is actually configured (not placeholder)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes('placeholder')) {
      // Return 200 with null BPM to avoid console errors - client will handle fallback
      return NextResponse.json(
        { bpm: null }
      )
    }
    
    // Extract local path from Supabase URL if needed
    let localPath = extractPathFromSupabaseUrl(filePath)
    if (!localPath) {
      // If extraction failed, use the original path
      localPath = filePath
    }
    
    // Normalize the path - try multiple formats
    const storagePath = localPath.replace(/^\/audio\//, '').replace(/^\//, '')
    const pathVariations = [
      storagePath,
      filePath,
      filePath.replace(/^\/audio\//, ''),
      `audio/${storagePath}`,
      `/audio/${storagePath}`
    ]
    
    let track = null
    let error = null
    
    // Try each path variation
    for (const path of pathVariations) {
      const { data, error: queryError } = await supabase
        .from('audio_files')
        .select('bpm, original_bpm, file_path, file_name, title')
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
          .select('bpm, original_bpm, file_path, file_name, title')
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
    
    // If there's a real database error, log it but return 200 with null BPM
    // to avoid console errors - client will handle fallback
    if (error) {
      console.warn('Database query error (returning null BPM for fallback):', error.message)
      return NextResponse.json(
        { bpm: null }
      )
    }
    
    if (!track) {
      // Return 200 with null BPM to avoid console errors - client will handle fallback
      return NextResponse.json(
        { bpm: null, searchedPath: storagePath }
      )
    }
    
    // Return BPM (prefer bpm over original_bpm, but use original_bpm if bpm is null)
    const bpm = track.bpm ?? track.original_bpm ?? null
    
    if (bpm === null || bpm <= 0) {
      // Return 200 with null BPM to avoid console errors - client will handle fallback
      return NextResponse.json(
        { bpm: null, track: track.title }
      )
    }
    
    return NextResponse.json(
      {
        bpm: bpm,
        original_bpm: track.original_bpm,
        file_path: track.file_path
      },
      {
        // Precomputed BPM should be cacheable.
        headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' }
      }
    )
  } catch (error: any) {
    console.error('BPM fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

