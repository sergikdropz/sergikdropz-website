import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  extractVaultRelativePath,
  normalizeVaultAudioUrl,
} from '@/utils/normalizeVaultAudioUrl'
import { resolveVaultPlaybackUrl } from '@/lib/audio/resolve-vault-playback-url'

const RESOLVE_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
}

/**
 * API Route: Resolve Audio File Path to Supabase URL
 * 
 * GET /api/audio/resolve?path=/audio/unreleased/eps/SERGIK - Are We Awake/SERGIK - It Is What It Is.wav
 * 
 * Query params:
 * - path: The local file path (e.g., /audio/unreleased/eps/...)
 * 
 * Returns: { url: string } or { url: null } if not found in Supabase
 */

// Force dynamic rendering since we use request.url
export const dynamic = 'force-dynamic';

async function resolveOne(filePath: string) {
  const vaultPlayback = await resolveVaultPlaybackUrl(filePath)
  if (vaultPlayback && vaultPlayback.source !== 'normalized') {
    return {
      path: filePath,
      url: vaultPlayback.url,
      fallbackUrl: vaultPlayback.fallbackUrl,
      source: vaultPlayback.source,
      expiresIn: vaultPlayback.expiresIn,
    }
  }
  return null
}

export async function GET(request: Request) {

  try {
    const { searchParams } = new URL(request.url)
    const filePaths = [
      ...searchParams.getAll('path'),
      ...(searchParams.get('paths') || '').split(',').map((p) => p.trim()),
    ].filter(Boolean)

    if (!filePaths.length) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      )
    }

    if (filePaths.length > 1) {
      const limited = filePaths.slice(0, 8)
      const results = await Promise.all(limited.map((path) => resolveOne(path)))
      return NextResponse.json(
        {
          results: results.filter(Boolean),
        },
        { headers: RESOLVE_CACHE_HEADERS },
      )
    }

    const filePath = filePaths[0]
    const vaultPlayback = await resolveOne(filePath)
    if (vaultPlayback) {
      return NextResponse.json(
        {
          url: vaultPlayback.url,
          fallbackUrl: vaultPlayback.fallbackUrl,
          source: vaultPlayback.source,
          expiresIn: vaultPlayback.expiresIn,
        },
        { headers: RESOLVE_CACHE_HEADERS },
      )
    }

    // Remove leading slash and 'audio/' prefix if present
    const storagePath = filePath.replace(/^\/audio\//, '').replace(/^\//, '')

    // The media server addresses files by their vault path, so a recognizable
    // path is already playable. Answer from the path alone and keep playback
    // working while the database/gateway is unreachable.
    const mediaServesByPath =
      !!process.env.NEXT_PUBLIC_AUDIO_BASE_URL || process.env.NEXT_PUBLIC_LOCAL_AUDIO === '1'
    if (mediaServesByPath && extractVaultRelativePath(filePath)) {
      return NextResponse.json(
        { url: normalizeVaultAudioUrl(filePath) },
        { headers: RESOLVE_CACHE_HEADERS },
      )
    }

    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    if (!supabaseUrl || !supabaseServiceKey) {
      if (!isDevelopment) {
        console.error('Supabase not configured in production. Missing environment variables.')
        return NextResponse.json(
          { 
            error: 'Supabase not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.',
            url: null 
          },
          { status: 500 }
        )
      }
      // In development, return null to allow local file fallback
      return NextResponse.json({ url: null })
    }
    
    // Try to find the file in Supabase database by file_path
    let supabase
    try {
      supabase = createSupabaseServerClient()
    } catch (error: any) {
      console.error('Failed to create Supabase client:', error.message)
      if (!isDevelopment) {
        return NextResponse.json(
          { 
            error: `Failed to connect to Supabase: ${error.message}`,
            url: null 
          },
          { status: 500 }
        )
      }
      return NextResponse.json({ url: null })
    }
    
    // Normalize the storage path for comparison
    const normalizedPath = storagePath.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/')
    
    // First, try exact match on file_path (normalized)
    // eslint-disable-next-line prefer-const
    let { data: file, error } = await supabase
      .from('audio_files')
      .select('file_url, file_path, file_name')
      .or(`file_path.eq.${normalizedPath},file_path.eq.${storagePath}`)
      .limit(1)
      .maybeSingle()

    // If not found, try matching by file name (case-insensitive)
    if (!file) {
      const fileName = normalizedPath.split('/').pop()
      if (fileName) {
        const { data: fileByName } = await supabase
          .from('audio_files')
          .select('file_url, file_path, file_name')
          .ilike('file_name', fileName)
          .limit(1)
          .maybeSingle()
        
        if (fileByName) {
          file = fileByName
        }
      }
    }
    
    // If still not found, try partial path matching (for nested folders)
    if (!file && normalizedPath.includes('/')) {
      const pathParts = normalizedPath.split('/')
      const fileName = pathParts[pathParts.length - 1]
      const folderPath = pathParts.slice(0, -1).join('/')
      
      // Try to find by filename in similar folder
      const { data: fileByFolder } = await supabase
        .from('audio_files')
        .select('file_url, file_path, file_name')
        .ilike('file_name', fileName)
        .ilike('folder_path', `%${folderPath}%`)
        .limit(1)
        .maybeSingle()
      
      if (fileByFolder) {
        file = fileByFolder
      }
    }

    // If found in database, return a playable URL (media tunnel / mp3 normalized)
    if (file && file.file_url) {
      return NextResponse.json(
        { url: normalizeVaultAudioUrl(file.file_url) },
        { headers: RESOLVE_CACHE_HEADERS },
      )
    }

    // If not found in database, construct Supabase URL directly
    // This handles cases where files are uploaded but not in database
    if (supabaseUrl && supabase) {
      const { data: urlData } = supabase.storage
        .from('audio-files')
        .getPublicUrl(storagePath)
      
      const publicUrl = normalizeVaultAudioUrl(urlData.publicUrl)

      // In production, ALWAYS return a playable URL (even if file doesn't exist yet)
      // This ensures production never tries to use local files
      if (!isDevelopment) {
        return NextResponse.json({ url: publicUrl })
      } else {
        // Development: allow media-base rewrite, else null for local /audio fallback
        if (process.env.NEXT_PUBLIC_AUDIO_BASE_URL || process.env.NEXT_PUBLIC_LOCAL_AUDIO === '1') {
          return NextResponse.json({ url: publicUrl })
        }
        return NextResponse.json({ url: null })
      }
    }

    // If no Supabase URL configured, return error in production
    if (!isDevelopment) {
      console.error('Supabase not configured in production. Missing NEXT_PUBLIC_SUPABASE_URL')
      return NextResponse.json(
        { 
          error: 'Supabase not configured. Please set NEXT_PUBLIC_SUPABASE_URL in Vercel environment variables.',
          url: null 
        },
        { status: 500 }
      )
    }
    
    // In development, return null to allow local file fallback
    return NextResponse.json({ url: null })
  } catch (error: any) {
    console.error('Resolve error:', error)
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    // In production, return error instead of null
    if (!isDevelopment) {
      return NextResponse.json(
        { 
          error: error.message || 'Failed to resolve audio URL',
          url: null 
        },
        { status: 500 }
      )
    }
    
    // In development, return null to fall back to local path
    return NextResponse.json({ url: null })
  }
}

