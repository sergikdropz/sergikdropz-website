import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

/**
 * POST /api/music-library/organize
 * Organize and sort all tracks from audio_files into the library structure
 * 
 * Body:
 * - strategy: 'folder_path' | 'title' | 'artist' | 'date' | 'auto'
 * - targetFolderId: Optional folder ID to organize into (default: finds appropriate folder)
 * - sortBy: 'title' | 'artist' | 'date' | 'bpm' | 'duration'
 * - sortOrder: 'asc' | 'desc'
 * - createMissingFolders: boolean (create folders based on folder_path if they don't exist)
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
    const body = await request.json()
    
    const {
      strategy = 'auto',
      targetFolderId = null,
      sortBy = 'title',
      sortOrder = 'asc',
      createMissingFolders = true,
    } = body

    const stats = {
      audioFilesProcessed: 0,
      tracksCreated: 0,
      tracksUpdated: 0,
      foldersCreated: 0,
      errors: [] as string[],
    }

    // Fetch only the fields we need (avoid statement timeouts)
    const { data: audioFiles, error: audioError } = await supabase
      .from('audio_files')
      .select('id, title, artist, file_path, file_url, created_at, bpm, key_signature, energy_level, danceability, duration_seconds, artwork_url, metadata, format, file_name, date, year')
      .order('created_at', { ascending: false })

    if (audioError) {
      return NextResponse.json(
        { error: `Failed to fetch audio files: ${audioError.message}` },
        { status: 500 }
      )
    }

    if (!audioFiles || audioFiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No audio files found to organize',
        stats,
      })
    }

    // Fetch only the fields we need
    const { data: allFolders, error: foldersError } = await supabase
      .from('music_library_folders')
      .select('id, name, type, parent_id, hidden, artwork_url, year, display_order, metadata')

    if (foldersError) {
      return NextResponse.json(
        { error: `Failed to fetch folders: ${foldersError.message}` },
        { status: 500 }
      )
    }

    // Build folder map for quick lookup
    const folderMap = new Map<string, any>()
    const folderPathMap = new Map<string, any>() // Maps folder_path to folder
    
    allFolders?.forEach((folder) => {
      folderMap.set(folder.id, folder)
      // Store folder by normalized path if it has metadata
      if (folder.metadata && typeof folder.metadata === 'object' && 'path' in folder.metadata) {
        const path = String(folder.metadata.path).toLowerCase()
        folderPathMap.set(path, folder)
      }
    })

    // Find or create "All Tracks" folder
    let allTracksFolder = allFolders?.find((f) => f.id === 'folder-all-tracks')
    if (!allTracksFolder && createMissingFolders) {
      // Find Discography folder first
      const discographyFolder = allFolders?.find((f) => f.id === 'folder-discography')
      if (discographyFolder) {
        const { data: newFolder, error: createError } = await supabase
          .from('music_library_folders')
          .insert({
            id: 'folder-all-tracks',
            name: 'All Tracks',
            type: 'folder',
            parent_id: discographyFolder.id,
            hidden: false,
            display_order: 0,
          })
          .select()
          .single()

        if (!createError && newFolder) {
          allTracksFolder = newFolder
          folderMap.set(newFolder.id, newFolder)
          stats.foldersCreated++
        }
      }
    }

    // Helper: Normalize path for matching
    const normalizePath = (path: string | null | undefined): string => {
      if (!path) return ''
      return path
        .replace(/^\/audio\//, '')
        .replace(/^\//, '')
        .replace(/\\/g, '/')
        .toLowerCase()
        .trim()
    }

    // Helper: Find or create folder by path
    const findOrCreateFolderByPath = async (folderPath: string, parentId: string | null = null): Promise<string | null> => {
      if (!folderPath || !createMissingFolders) return null

      const normalized = normalizePath(folderPath)
      const pathParts = normalized.split('/').filter(Boolean)
      
      if (pathParts.length === 0) return parentId

      // Try to find existing folder
      const existing = folderPathMap.get(normalized)
      if (existing) return existing.id

      // Build folder hierarchy
      let currentParentId = parentId
      let currentPath = ''

      for (const part of pathParts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part
        
        // Check if folder exists at this path
        const existingAtPath = folderPathMap.get(currentPath)
        if (existingAtPath) {
          currentParentId = existingAtPath.id
          continue
        }

        // Create folder
        const folderName = part
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')

        const folderId = `folder-${part.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

        const { data: newFolder, error: createError } = await supabase
          .from('music_library_folders')
          .insert({
            id: folderId,
            name: folderName,
            type: 'folder',
            parent_id: currentParentId,
            hidden: false,
            metadata: { path: currentPath },
            display_order: 0,
          })
          .select()
          .single()

        if (!createError && newFolder) {
          folderMap.set(newFolder.id, newFolder)
          folderPathMap.set(currentPath, newFolder)
          currentParentId = newFolder.id
          stats.foldersCreated++
        } else if (createError) {
          console.error(`Failed to create folder ${folderName}:`, createError)
          stats.errors.push(`Failed to create folder: ${folderName}`)
        }
      }

      return currentParentId
    }

    // Helper: Determine target folder for an audio file
    const determineTargetFolder = async (audioFile: any): Promise<string | null> => {
      if (targetFolderId) return targetFolderId

      // Strategy: auto - try multiple approaches
      if (strategy === 'auto' || strategy === 'folder_path') {
        if (audioFile.folder_path) {
          // Try to find or create folder based on folder_path
          const folderId = await findOrCreateFolderByPath(audioFile.folder_path)
          if (folderId) return folderId
        }
      }

      // Strategy: title - try to match by title/album
      if (strategy === 'auto' || strategy === 'title') {
        if (audioFile.title) {
          // Look for folder with matching name
          const matchingFolder = allFolders?.find(
            (f) => f.name.toLowerCase() === audioFile.title.toLowerCase()
          )
          if (matchingFolder) return matchingFolder.id
        }
      }

      // Strategy: artist - try to match by artist
      if (strategy === 'auto' || strategy === 'artist') {
        if (audioFile.artist) {
          const matchingFolder = allFolders?.find(
            (f) => f.name.toLowerCase() === audioFile.artist.toLowerCase()
          )
          if (matchingFolder) return matchingFolder.id
        }
      }

      // Default: use "All Tracks" folder
      return allTracksFolder?.id || null
    }

    // Process each audio file
    for (const audioFile of audioFiles) {
      stats.audioFilesProcessed++

      try {
        // Check if track already exists
        const { data: existingTrack } = await supabase
          .from('music_library_tracks')
          .select('id')
          .eq('audio_file_id', audioFile.id)
          .maybeSingle()

        // Determine target folder
        const folderId = await determineTargetFolder(audioFile)

        // Prepare track data
        const trackId = existingTrack?.id || `track-${audioFile.id}`
        const trackData: any = {
          id: trackId,
          folder_id: folderId,
          audio_file_id: audioFile.id,
          title: audioFile.title || audioFile.file_name || 'Untitled',
          artist: audioFile.artist || 'SERGIK',
          duration: audioFile.duration_seconds || null,
          file_url: audioFile.file_url || audioFile.file_path || '',
          artwork_url: audioFile.artwork_url || null,
          bpm: audioFile.bpm || null,
          key_signature: audioFile.key_signature || null,
          sonic_dna: null, // sonic_dna is now in storage, not in database
          waveform: null, // peaks live in the audio-analysis bucket (waveform_json_url)
          energy_level: audioFile.energy_level || null,
          danceability: audioFile.danceability || null,
          created_at: audioFile.created_at || null,
          date: audioFile.date || null,
          year: audioFile.year || null,
          display_order: 0,
          metadata: {
            format: audioFile.format,
            file_path: audioFile.file_path,
            file_name: audioFile.file_name,
            ...(audioFile.metadata || {}),
          },
        }

        if (existingTrack) {
          // Update existing track
          const { error: updateError } = await supabase
            .from('music_library_tracks')
            .update(trackData)
            .eq('id', trackId)

          if (updateError) {
            stats.errors.push(`Failed to update track ${trackData.title}: ${updateError.message}`)
          } else {
            stats.tracksUpdated++
          }
        } else {
          // Create new track
          const { error: insertError } = await supabase
            .from('music_library_tracks')
            .insert(trackData)

          if (insertError) {
            stats.errors.push(`Failed to create track ${trackData.title}: ${insertError.message}`)
          } else {
            stats.tracksCreated++
          }
        }
      } catch (error: any) {
        stats.errors.push(`Error processing ${audioFile.title || audioFile.file_name}: ${error.message}`)
      }
    }

    // Sort tracks in each folder
    if (sortBy) {
      const { data: allTracks } = await supabase
        .from('music_library_tracks')
        .select('*')

      if (allTracks) {
        // Group tracks by folder
        const tracksByFolder = new Map<string, any[]>()
        allTracks.forEach((track) => {
          const folderId = track.folder_id || 'null'
          if (!tracksByFolder.has(folderId)) {
            tracksByFolder.set(folderId, [])
          }
          tracksByFolder.get(folderId)!.push(track)
        })

        // Sort tracks in each folder
        for (const [folderId, tracks] of Array.from(tracksByFolder.entries())) {
          tracks.sort((a, b) => {
            let aVal: any = null
            let bVal: any = null

            switch (sortBy) {
              case 'title':
                aVal = a.title?.toLowerCase() || ''
                bVal = b.title?.toLowerCase() || ''
                break
              case 'artist':
                aVal = a.artist?.toLowerCase() || ''
                bVal = b.artist?.toLowerCase() || ''
                break
              case 'date':
                aVal = a.created_at || a.date || ''
                bVal = b.created_at || b.date || ''
                break
              case 'bpm':
                aVal = a.bpm || 0
                bVal = b.bpm || 0
                break
              case 'duration':
                aVal = a.duration || 0
                bVal = b.duration || 0
                break
              default:
                aVal = a.title?.toLowerCase() || ''
                bVal = b.title?.toLowerCase() || ''
            }

            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
            return 0
          })

          // Update display_order
          for (let i = 0; i < tracks.length; i++) {
            await supabase
              .from('music_library_tracks')
              .update({ display_order: i })
              .eq('id', tracks[i].id)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Organized ${stats.audioFilesProcessed} audio files`,
      stats,
    })
  } catch (error: any) {
    console.error('Error organizing tracks:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to organize tracks' },
      { status: 500 }
    )
  }
}
