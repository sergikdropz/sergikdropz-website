import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

/**
 * POST /api/music-library/recover
 * Emergency recovery endpoint to restore audio_file_id links
 * This can be called directly via curl or browser to restore broken links
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await supabaseIsReachable())) {
      return supabaseUnavailableResponse()
    }

    const supabase = createSupabaseServerClient()
    
    console.log('[RECOVER] Starting recovery process...')
    
    // Fetch all tracks that need linking
    const { data: libraryTracks, error: tracksError } = await supabase
      .from('music_library_tracks')
      .select('id, title, artist, file_url, metadata, audio_file_id')
      .is('audio_file_id', null)

    if (tracksError) {
      console.error('[RECOVER] Error fetching tracks:', tracksError)
      return NextResponse.json(
        { error: `Failed to fetch tracks: ${tracksError.message}` },
        { status: 500 }
      )
    }

    if (!libraryTracks || libraryTracks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All tracks are already linked',
        stats: {
          tracksProcessed: 0,
          tracksLinked: 0,
          tracksAlreadyLinked: 0,
          tracksNotFound: 0,
          errors: [],
        },
      })
    }

    console.log(`[RECOVER] Found ${libraryTracks.length} unlinked tracks`)

    // Fetch all audio files
    const { data: audioFiles, error: audioError } = await supabase
      .from('audio_files')
      .select('id, title, artist, file_path, file_url, metadata')

    if (audioError) {
      console.error('[RECOVER] Error fetching audio files:', audioError)
      return NextResponse.json(
        { error: `Failed to fetch audio files: ${audioError.message}` },
        { status: 500 }
      )
    }

    if (!audioFiles || audioFiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No audio files found',
        stats: {
          tracksProcessed: 0,
          tracksLinked: 0,
          tracksAlreadyLinked: 0,
          tracksNotFound: 0,
          errors: [],
        },
      })
    }

    console.log(`[RECOVER] Found ${audioFiles.length} audio files`)

    // Helper: Normalize path for matching (handles relative paths + Supabase public URLs)
    const normalizePath = (path: string | null | undefined): string => {
      if (!path) return ''
      let p = String(path).trim()
      try {
        p = decodeURIComponent(p)
      } catch {
        // ignore bad URI encoding
      }

      // Strip Supabase public storage prefixes (common for audio-files bucket)
      p = p.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/audio-files\//i, '')
      p = p.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/audio-files\//i, '')

      // Strip common local prefixes
      p = p.replace(/^\/?public\/audio\//i, '')
      p = p.replace(/^\/?audio\//i, '')

      // Normalize slashes + leading slash
      p = p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/')
      return p.toLowerCase().trim()
    }

    // Helper: Extract filename from path
    const getFileName = (path: string | null | undefined): string => {
      if (!path) return ''
      let p = String(path)
      try {
        p = decodeURIComponent(p)
      } catch {}
      const parts = p.replace(/\\/g, '/').split('/')
      return (parts[parts.length - 1] || '').toLowerCase().trim()
    }

    // Create lookup maps for audio files
    const audioFilesByPath = new Map<string, any>()
    const audioFilesByFileName = new Map<string, any[]>()
    const audioFilesByTitle = new Map<string, any[]>()

    audioFiles.forEach((file: any) => {
      const normalizedPath = normalizePath(file.file_path || file.file_url)
      if (normalizedPath) {
        audioFilesByPath.set(normalizedPath, file)
      }
      
      const fileName = getFileName(file.file_path || file.file_url)
      if (fileName) {
        if (!audioFilesByFileName.has(fileName)) {
          audioFilesByFileName.set(fileName, [])
        }
        audioFilesByFileName.get(fileName)!.push(file)
      }
      
      if (file.title) {
        const normalizedTitle = file.title.toLowerCase().trim()
        if (!audioFilesByTitle.has(normalizedTitle)) {
          audioFilesByTitle.set(normalizedTitle, [])
        }
        audioFilesByTitle.get(normalizedTitle)!.push(file)
      }
    })

    const stats = {
      tracksProcessed: 0,
      tracksLinked: 0,
      tracksNotFound: 0,
      errors: [] as string[],
    }

    // Try to link each track
    for (const track of libraryTracks) {
      stats.tracksProcessed++
      let matchedFile: any = null

      // Strategy 1: Match by file_url/file_path
      if (track.file_url) {
        const normalizedTrackPath = normalizePath(track.file_url)
        matchedFile = audioFilesByPath.get(normalizedTrackPath)
      }

      // Strategy 2: Match by filename
      if (!matchedFile && track.file_url) {
        const trackFileName = getFileName(track.file_url)
        const candidates = audioFilesByFileName.get(trackFileName)
        if (candidates && candidates.length === 1) {
          matchedFile = candidates[0]
        }
      }

      // Strategy 3: Match by title and artist
      if (!matchedFile && track.title) {
        const normalizedTitle = track.title.toLowerCase().trim()
        const candidates = audioFilesByTitle.get(normalizedTitle)
        if (candidates) {
          // If artist matches, prefer that
          const artistMatch = candidates.find(
            (f: any) => f.artist?.toLowerCase().trim() === track.artist?.toLowerCase().trim()
          )
          matchedFile = artistMatch || (candidates.length === 1 ? candidates[0] : null)
        }
      }

      if (matchedFile) {
        // Link the track to the audio file
        const { error: updateError } = await supabase
          .from('music_library_tracks')
          .update({ audio_file_id: matchedFile.id })
          .eq('id', track.id)

        if (updateError) {
          stats.errors.push(`Failed to link track "${track.title}" (${track.id}): ${updateError.message}`)
        } else {
          stats.tracksLinked++
          console.log(`[RECOVER] Linked track "${track.title}" to audio file ${matchedFile.id}`)
        }
      } else {
        stats.tracksNotFound++
        stats.errors.push(`Track "${track.title}" (${track.id}) - No matching audio file found`)
      }
    }

    console.log(`[RECOVER] Recovery complete: ${stats.tracksLinked} linked, ${stats.tracksNotFound} not found`)

    return NextResponse.json({
      success: true,
      message: `Recovery complete! Linked ${stats.tracksLinked} tracks`,
      stats,
    })
  } catch (error: any) {
    console.error('[RECOVER] Recovery error:', error)
    return NextResponse.json(
      { error: error.message || 'Recovery failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/music-library/recover
 * Check recovery status
 */
export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await supabaseIsReachable())) {
      return supabaseUnavailableResponse()
    }

    const supabase = createSupabaseServerClient()
    
    const { data: unlinkedTracks, error } = await supabase
      .from('music_library_tracks')
      .select('id, title')
      .is('audio_file_id', null)

    if (error) {
      return NextResponse.json(
        { error: `Failed to check status: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      unlinkedTracks: unlinkedTracks?.length || 0,
      needsRecovery: (unlinkedTracks?.length || 0) > 0,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to check status' },
      { status: 500 }
    )
  }
}
