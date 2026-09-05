import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { findAudioFile } from '@/lib/findAudioFile'

export const dynamic = 'force-dynamic'

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
    } catch {
      return NextResponse.json({ bpm: null })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes('placeholder')) {
      return NextResponse.json({ bpm: null })
    }

    let track: any = null
    try {
      track = await findAudioFile(supabase, {
        path: filePath,
        trackId,
        select: 'bpm, original_bpm, file_path, file_name, title',
      })
    } catch (queryError: any) {
      console.warn('Database query error (returning null BPM for fallback):', queryError.message)
      return NextResponse.json({ bpm: null })
    }

    if (!track) {
      return NextResponse.json({ bpm: null, searchedPath: filePath })
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
        headers: { 'Cache-Control': 'private, no-cache, must-revalidate' },
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

