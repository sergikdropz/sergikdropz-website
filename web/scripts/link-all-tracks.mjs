#!/usr/bin/env node
/**
 * Link All Tracks to Audio Files
 * 
 * This script links all tracks in music_library_tracks to their corresponding
 * audio_files by matching file URLs, paths, titles, and artists.
 * 
 * Usage: node scripts/link-all-tracks.mjs
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

const stats = {
  tracksProcessed: 0,
  tracksLinked: 0,
  tracksAlreadyLinked: 0,
  tracksNotFound: 0,
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

// Helper: Extract filename from path
const getFileName = (path) => {
  if (!path) return ''
  const parts = path.split('/')
  return parts[parts.length - 1].toLowerCase()
}

// Helper: Find matching audio file
const findMatchingAudioFile = (track, audioFiles) => {
  // Strategy 1: Match by file_url
  if (track.file_url) {
    const normalizedTrackUrl = normalizePath(track.file_url)
    const match = audioFiles.find((af) => {
      const normalizedAfUrl = normalizePath(af.file_url || af.file_path)
      return normalizedTrackUrl === normalizedAfUrl || 
             normalizedTrackUrl.includes(getFileName(af.file_path)) ||
             getFileName(af.file_path) === getFileName(track.file_url)
    })
    if (match) return match.id
  }

  // Strategy 2: Match by title and artist
  if (track.title && track.artist) {
    const match = audioFiles.find((af) => {
      const titleMatch = af.title?.toLowerCase() === track.title.toLowerCase()
      const artistMatch = af.artist?.toLowerCase() === track.artist.toLowerCase()
      return titleMatch && artistMatch
    })
    if (match) return match.id
  }

  // Strategy 3: Match by title only (fuzzy)
  if (track.title) {
    const match = audioFiles.find((af) => {
      return af.title?.toLowerCase().includes(track.title.toLowerCase()) ||
             track.title.toLowerCase().includes(af.title?.toLowerCase() || '')
    })
    if (match) return match.id
  }

  // Strategy 4: Match by metadata file_path
  if (track.metadata && typeof track.metadata === 'object' && 'file_path' in track.metadata) {
    const trackPath = String(track.metadata.file_path)
    const normalizedTrackPath = normalizePath(trackPath)
    const match = audioFiles.find((af) => {
      const normalizedAfPath = normalizePath(af.file_path)
      return normalizedTrackPath === normalizedAfPath ||
             normalizedTrackPath.includes(getFileName(af.file_path)) ||
             getFileName(af.file_path) === getFileName(trackPath)
    })
    if (match) return match.id
  }

  return null
}

async function main() {
  try {
    console.log('🔗 Linking All Tracks to Audio Files\n')

    // Fetch all tracks that need linking
    console.log('📥 Fetching tracks...')
    const { data: libraryTracks, error: tracksError } = await supabase
      .from('music_library_tracks')
      .select('*')
      .is('audio_file_id', null)

    if (tracksError) {
      throw new Error(`Failed to fetch tracks: ${tracksError.message}`)
    }

    if (!libraryTracks || libraryTracks.length === 0) {
      console.log('✅ All tracks are already linked!')
      return
    }

    console.log(`✅ Found ${libraryTracks.length} tracks that need linking\n`)

    // Fetch all audio files
    console.log('📥 Fetching audio files...')
    const { data: audioFiles, error: audioError } = await supabase
      .from('audio_files')
      .select('*')

    if (audioError) {
      throw new Error(`Failed to fetch audio files: ${audioError.message}`)
    }

    if (!audioFiles || audioFiles.length === 0) {
      console.log('⚠️  No audio files found')
      return
    }

    console.log(`✅ Found ${audioFiles.length} audio files\n`)

    // Process each track
    console.log('🔄 Linking tracks...\n')
    for (let i = 0; i < libraryTracks.length; i++) {
      const track = libraryTracks[i]
      stats.tracksProcessed++

      if ((i + 1) % 10 === 0) {
        process.stdout.write(`\r   Processed ${i + 1}/${libraryTracks.length} tracks...`)
      }

      try {
        // Check if already linked
        if (track.audio_file_id) {
          stats.tracksAlreadyLinked++
          continue
        }

        // Find matching audio file
        const audioFileId = findMatchingAudioFile(track, audioFiles)

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
      } catch (error) {
        stats.errors.push(`Error processing track ${track.title}: ${error.message}`)
      }
    }

    console.log(`\n✅ Processed ${stats.tracksProcessed} tracks\n`)

    // Print summary
    console.log('📊 Linking Summary:')
    console.log(`   Tracks processed: ${stats.tracksProcessed}`)
    console.log(`   Tracks linked: ${stats.tracksLinked}`)
    console.log(`   Tracks already linked: ${stats.tracksAlreadyLinked}`)
    console.log(`   Tracks not found: ${stats.tracksNotFound}`)
    if (stats.errors.length > 0) {
      console.log(`   Errors: ${stats.errors.length}`)
      if (stats.errors.length <= 10) {
        stats.errors.forEach((error) => console.log(`      - ${error}`))
      } else {
        stats.errors.slice(0, 10).forEach((error) => console.log(`      - ${error}`))
        console.log(`      ... and ${stats.errors.length - 10} more errors`)
      }
    }
    console.log('\n✅ Linking complete!')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

main()
