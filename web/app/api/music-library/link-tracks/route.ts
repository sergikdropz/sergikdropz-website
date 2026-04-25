import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

/**
 * POST /api/music-library/link-tracks
 * Link all tracks in music_library_tracks to their corresponding audio_files
 * Matches tracks by file_url, file_path, title, and artist
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fail fast during Supabase outages (prevents timeouts + partial writes)
    if (!(await supabaseIsReachable())) {
      return supabaseUnavailableResponse()
    }

    const supabase = createSupabaseServerClient()
    const body = await request.json().catch(() => ({}))
    const { trackIds, audioFileIds } = body
    
    const stats = {
      tracksProcessed: 0,
      tracksLinked: 0,
      tracksAlreadyLinked: 0,
      tracksNotFound: 0,
      errors: [] as string[],
    }

    // Manual linking mode: trackIds and audioFileIds provided
    if (trackIds && audioFileIds && Array.isArray(trackIds) && Array.isArray(audioFileIds)) {
      if (trackIds.length !== audioFileIds.length) {
        return NextResponse.json(
          { error: 'trackIds and audioFileIds arrays must have the same length' },
          { status: 400 }
        )
      }

      for (let i = 0; i < trackIds.length; i++) {
        const trackId = trackIds[i]
        const audioFileId = audioFileIds[i]
        
        try {
          // Check if track exists
          const { data: track } = await supabase
            .from('music_library_tracks')
            .select('id, audio_file_id')
            .eq('id', trackId)
            .single()

          if (!track) {
            stats.errors.push(`Track ${trackId} not found`)
            continue
          }

          if (track.audio_file_id) {
            stats.tracksAlreadyLinked++
            continue
          }

          // Check if audio file exists
          const { data: audioFile } = await supabase
            .from('audio_files')
            .select('id')
            .eq('id', audioFileId)
            .single()

          if (!audioFile) {
            stats.errors.push(`Audio file ${audioFileId} not found`)
            continue
          }

          // Link them
          const { error: updateError } = await supabase
            .from('music_library_tracks')
            .update({ audio_file_id: audioFileId })
            .eq('id', trackId)

          if (updateError) {
            stats.errors.push(`Failed to link track ${trackId}: ${updateError.message}`)
          } else {
            stats.tracksLinked++
            stats.tracksProcessed++
          }
        } catch (error: any) {
          stats.errors.push(`Error linking track ${trackId}: ${error.message}`)
        }
      }

      return NextResponse.json({
        success: true,
        message: `Linked ${stats.tracksLinked} tracks to audio files`,
        stats,
      })
    }

    // Auto-linking mode: find and link all unlinked tracks
    // Fetch only the fields we need (avoids statement timeout)
    const { data: libraryTracks, error: tracksError } = await supabase
      .from('music_library_tracks')
      .select('id, title, artist, file_url, metadata, audio_file_id')
      .is('audio_file_id', null)

    if (tracksError) {
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
          ...stats,
          tracksAlreadyLinked: 0,
        },
      })
    }

    // Fetch only the fields we need (avoid statement timeout)
    const { data: audioFiles, error: audioError } = await supabase
      .from('audio_files')
      .select('id, title, artist, file_path, file_url, metadata')

    if (audioError) {
      return NextResponse.json(
        { error: `Failed to fetch audio files: ${audioError.message}` },
        { status: 500 }
      )
    }

    if (!audioFiles || audioFiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No audio files found',
        stats,
      })
    }

    // Helper: Normalize path for matching (handles relative paths + Supabase public URLs)
    const normalizePath = (path: string | null | undefined): string => {
      if (!path) return ''
      let p = String(path).trim()
      try { p = decodeURIComponent(p) } catch {}
      p = p.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/audio-files\//i, '')
      p = p.replace(/^\/?public\/audio\//i, '')
      p = p.replace(/^\/?audio\//i, '')
      p = p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/')
      return p.toLowerCase().trim()
    }

    const getFileName = (path: string | null | undefined): string => {
      if (!path) return ''
      let p = String(path)
      try { p = decodeURIComponent(p) } catch {}
      const parts = p.replace(/\\/g, '/').split('/')
      return (parts[parts.length - 1] || '').toLowerCase().trim()
    }

    // Build lookup maps once (avoid O(n*m) scans)
    const audioFilesByPath = new Map<string, any>()
    const audioFilesByFileName = new Map<string, any[]>()
    const audioFilesByTitle = new Map<string, any[]>()
    const audioFilesByTitleArtist = new Map<string, any>()

    for (const af of audioFiles) {
      const pathKey = normalizePath(af.file_path || af.file_url)
      if (pathKey) audioFilesByPath.set(pathKey, af)

      const nameKey = getFileName(af.file_path || af.file_url)
      if (nameKey) {
        const arr = audioFilesByFileName.get(nameKey) || []
        arr.push(af)
        audioFilesByFileName.set(nameKey, arr)
      }

      if (af.title) {
        const titleKey = String(af.title).toLowerCase().trim()
        const arr = audioFilesByTitle.get(titleKey) || []
        arr.push(af)
        audioFilesByTitle.set(titleKey, arr)
      }

      if (af.title && af.artist) {
        const key = `${String(af.title).toLowerCase().trim()}|${String(af.artist).toLowerCase().trim()}`
        audioFilesByTitleArtist.set(key, af)
      }
    }

    const findMatchingAudioFileId = (track: any): string | null => {
      // Strategy 1: exact path match
      if (track.file_url) {
        const key = normalizePath(track.file_url)
        const match = audioFilesByPath.get(key)
        if (match?.id) return match.id

        // Strategy 1b: filename match
        const fileName = getFileName(track.file_url)
        const candidates = audioFilesByFileName.get(fileName)
        if (candidates?.length === 1) return candidates[0].id
      }

      // Strategy 2: metadata file_path match
      const metaPath = track?.metadata && typeof track.metadata === 'object' ? (track.metadata as any).file_path : null
      if (metaPath) {
        const key = normalizePath(String(metaPath))
        const match = audioFilesByPath.get(key)
        if (match?.id) return match.id
      }

      // Strategy 3: title+artist exact match
      if (track.title && track.artist) {
        const key = `${String(track.title).toLowerCase().trim()}|${String(track.artist).toLowerCase().trim()}`
        const match = audioFilesByTitleArtist.get(key)
        if (match?.id) return match.id
      }

      // Strategy 4: title-only (only if unique)
      if (track.title) {
        const titleKey = String(track.title).toLowerCase().trim()
        const candidates = audioFilesByTitle.get(titleKey)
        if (candidates?.length === 1) return candidates[0].id
      }

      return null
    }

    // Process each track (cap to keep requests fast; call repeatedly if needed)
    const maxTracks = Number(body?.maxTracks ?? 300)
    const toProcess = libraryTracks.slice(0, Number.isFinite(maxTracks) ? maxTracks : 300)

    for (const track of toProcess) {
      stats.tracksProcessed++

      try {
        const audioFileId = findMatchingAudioFileId(track)

        if (audioFileId) {
          // Update track with audio_file_id
          const { error: updateError } = await supabase
            .from('music_library_tracks')
            .update({ audio_file_id: audioFileId })
            .eq('id', track.id)

          if (updateError) {
            stats.errors.push(`Failed to link track ${track.title}: ${updateError.message}`)
          } else {
            stats.tracksLinked++
          }
        } else {
          stats.tracksNotFound++
          stats.errors.push(`No matching audio file found for track: ${track.title}`)
        }
      } catch (error: any) {
        stats.errors.push(`Error processing track ${track.title}: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Linked ${stats.tracksLinked} tracks to audio files`,
      stats: {
        ...stats,
        remainingUnlinkedEstimate: Math.max((libraryTracks.length || 0) - toProcess.length - stats.tracksNotFound, 0),
      },
    })
  } catch (error: any) {
    console.error('Error linking tracks:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to link tracks' },
      { status: 500 }
    )
  }
}
