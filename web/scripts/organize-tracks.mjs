#!/usr/bin/env node
/**
 * Organize All Tracks into Library Structure
 * 
 * This script organizes all tracks from audio_files into the music_library_tracks
 * structure, matching them to appropriate folders and sorting them.
 * 
 * Usage: node scripts/organize-tracks.mjs [--strategy=auto] [--sortBy=title] [--sortOrder=asc] [--no-create-folders]
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
const envPath = resolve(__dirname, '..', '.env.local')
dotenv.config({ path: envPath })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables!')
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Parse command line arguments
const args = process.argv.slice(2)
const strategy = args.find(arg => arg.startsWith('--strategy='))?.split('=')[1] || 'auto'
const sortBy = args.find(arg => arg.startsWith('--sortBy='))?.split('=')[1] || 'title'
const sortOrder = args.find(arg => arg.startsWith('--sortOrder='))?.split('=')[1] || 'asc'
const createMissingFolders = !args.includes('--no-create-folders')

console.log('🎵 Organizing Tracks into Library Structure\n')
console.log(`Strategy: ${strategy}`)
console.log(`Sort By: ${sortBy}`)
console.log(`Sort Order: ${sortOrder}`)
console.log(`Create Missing Folders: ${createMissingFolders}\n`)

const stats = {
  audioFilesProcessed: 0,
  tracksCreated: 0,
  tracksUpdated: 0,
  foldersCreated: 0,
  errors: [],
}

// Helper: Normalize path for matching
const normalizePath = (path) => {
  if (!path) return ''
  return path
    .replace(/^\/audio\//, '')
    .replace(/^\//, '')
    .replace(/\\/g, '/')
    .toLowerCase()
    .trim()
}

async function main() {
  try {
    // Fetch all audio files
    console.log('📥 Fetching audio files...')
    const { data: audioFiles, error: audioError } = await supabase
      .from('audio_files')
      .select('*')
      .order('created_at', { ascending: false })

    if (audioError) {
      throw new Error(`Failed to fetch audio files: ${audioError.message}`)
    }

    if (!audioFiles || audioFiles.length === 0) {
      console.log('✅ No audio files found to organize')
      return
    }

    console.log(`✅ Found ${audioFiles.length} audio files\n`)

    // Fetch all existing folders
    console.log('📁 Fetching library folders...')
    const { data: allFolders, error: foldersError } = await supabase
      .from('music_library_folders')
      .select('*')

    if (foldersError) {
      throw new Error(`Failed to fetch folders: ${foldersError.message}`)
    }

    console.log(`✅ Found ${allFolders?.length || 0} folders\n`)

    // Build folder maps
    const folderMap = new Map()
    const folderPathMap = new Map()
    
    allFolders?.forEach((folder) => {
      folderMap.set(folder.id, folder)
      if (folder.metadata && typeof folder.metadata === 'object' && 'path' in folder.metadata) {
        const path = String(folder.metadata.path).toLowerCase()
        folderPathMap.set(path, folder)
      }
    })

    // Find or create "All Tracks" folder
    let allTracksFolder = allFolders?.find((f) => f.id === 'folder-all-tracks')
    if (!allTracksFolder && createMissingFolders) {
      const discographyFolder = allFolders?.find((f) => f.id === 'folder-discography')
      if (discographyFolder) {
        console.log('📁 Creating "All Tracks" folder...')
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
          console.log('✅ Created "All Tracks" folder\n')
        }
      }
    }

    // Helper: Find or create folder by path
    const findOrCreateFolderByPath = async (folderPath, parentId = null) => {
      if (!folderPath || !createMissingFolders) return null

      const normalized = normalizePath(folderPath)
      const pathParts = normalized.split('/').filter(Boolean)
      
      if (pathParts.length === 0) return parentId

      const existing = folderPathMap.get(normalized)
      if (existing) return existing.id

      let currentParentId = parentId
      let currentPath = ''

      for (const part of pathParts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part
        
        const existingAtPath = folderPathMap.get(currentPath)
        if (existingAtPath) {
          currentParentId = existingAtPath.id
          continue
        }

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
          console.error(`   ❌ Failed to create folder ${folderName}:`, createError.message)
          stats.errors.push(`Failed to create folder: ${folderName}`)
        }
      }

      return currentParentId
    }

    // Helper: Determine target folder
    const determineTargetFolder = async (audioFile) => {
      // Strategy: auto - try multiple approaches
      if (strategy === 'auto' || strategy === 'folder_path') {
        if (audioFile.folder_path) {
          const folderId = await findOrCreateFolderByPath(audioFile.folder_path)
          if (folderId) return folderId
        }
      }

      // Strategy: title
      if (strategy === 'auto' || strategy === 'title') {
        if (audioFile.title) {
          const matchingFolder = allFolders?.find(
            (f) => f.name.toLowerCase() === audioFile.title.toLowerCase()
          )
          if (matchingFolder) return matchingFolder.id
        }
      }

      // Strategy: artist
      if (strategy === 'auto' || strategy === 'artist') {
        if (audioFile.artist) {
          const matchingFolder = allFolders?.find(
            (f) => f.name.toLowerCase() === audioFile.artist.toLowerCase()
          )
          if (matchingFolder) return matchingFolder.id
        }
      }

      return allTracksFolder?.id || null
    }

    // Process each audio file
    console.log('🔄 Processing tracks...\n')
    for (let i = 0; i < audioFiles.length; i++) {
      const audioFile = audioFiles[i]
      stats.audioFilesProcessed++

      if ((i + 1) % 10 === 0) {
        process.stdout.write(`\r   Processed ${i + 1}/${audioFiles.length} tracks...`)
      }

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
        const trackData = {
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
          sonic_dna: audioFile.sonic_dna || null,
          waveform: audioFile.waveform_data || null,
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
      } catch (error) {
        stats.errors.push(`Error processing ${audioFile.title || audioFile.file_name}: ${error.message}`)
      }
    }

    console.log(`\n✅ Processed ${stats.audioFilesProcessed} audio files\n`)

    // Sort tracks in each folder
    if (sortBy) {
      console.log('🔀 Sorting tracks...')
      const { data: allTracks } = await supabase
        .from('music_library_tracks')
        .select('*')

      if (allTracks) {
        // Group tracks by folder
        const tracksByFolder = new Map()
        allTracks.forEach((track) => {
          const folderId = track.folder_id || 'null'
          if (!tracksByFolder.has(folderId)) {
            tracksByFolder.set(folderId, [])
          }
          tracksByFolder.get(folderId).push(track)
        })

        // Sort tracks in each folder
        let sortedCount = 0
        for (const [folderId, tracks] of tracksByFolder.entries()) {
          tracks.sort((a, b) => {
            let aVal = null
            let bVal = null

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
          sortedCount++
        }
        console.log(`✅ Sorted tracks in ${sortedCount} folders\n`)
      }
    }

    // Print summary
    console.log('📊 Organization Summary:')
    console.log(`   Audio files processed: ${stats.audioFilesProcessed}`)
    console.log(`   Tracks created: ${stats.tracksCreated}`)
    console.log(`   Tracks updated: ${stats.tracksUpdated}`)
    console.log(`   Folders created: ${stats.foldersCreated}`)
    if (stats.errors.length > 0) {
      console.log(`   Errors: ${stats.errors.length}`)
      if (stats.errors.length <= 10) {
        stats.errors.forEach((error) => console.log(`      - ${error}`))
      } else {
        stats.errors.slice(0, 10).forEach((error) => console.log(`      - ${error}`))
        console.log(`      ... and ${stats.errors.length - 10} more errors`)
      }
    }
    console.log('\n✅ Organization complete!')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

main()
