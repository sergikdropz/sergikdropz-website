#!/usr/bin/env node
/**
 * Remove Duplicate Audio File Links
 * 
 * When the same audio_file_id appears in multiple tracks, keep only one
 * (preferring the one in the most appropriate folder).
 * 
 * Usage: node scripts/remove-duplicate-audio-links.mjs
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
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const stats = {
  duplicatesFound: 0,
  duplicatesRemoved: 0,
  errors: [],
}

async function main() {
  try {
    console.log('🔗 Removing Duplicate Audio File Links\n')

    // Find all tracks with audio_file_id
    const { data: linkedTracks, error } = await supabase
      .from('music_library_tracks')
      .select('*')
      .not('audio_file_id', 'is', null)

    if (error) {
      throw new Error(`Failed to fetch tracks: ${error.message}`)
    }

    if (!linkedTracks || linkedTracks.length === 0) {
      console.log('✅ No linked tracks found')
      return
    }

    // Group by audio_file_id
    const audioFileGroups = new Map()
    linkedTracks.forEach(track => {
      const audioId = track.audio_file_id
      if (!audioFileGroups.has(audioId)) {
        audioFileGroups.set(audioId, [])
      }
      audioFileGroups.get(audioId).push(track)
    })

    // Find duplicates
    const duplicates = []
    for (const [audioId, tracks] of audioFileGroups.entries()) {
      if (tracks.length > 1) {
        duplicates.push({ audioId, tracks })
        stats.duplicatesFound += tracks.length - 1
      }
    }

    console.log(`🔍 Found ${duplicates.length} audio files with duplicate tracks\n`)

    // Process each duplicate group
    for (const { audioId, tracks } of duplicates) {
      // Sort: prefer tracks in "All Tracks" or root folders, then by creation date
      tracks.sort((a, b) => {
        // Prefer tracks NOT in "All Tracks" folder
        const aIsAllTracks = a.folder_id === 'folder-all-tracks'
        const bIsAllTracks = b.folder_id === 'folder-all-tracks'
        if (aIsAllTracks && !bIsAllTracks) return 1
        if (!aIsAllTracks && bIsAllTracks) return -1
        
        // Prefer tracks with folder_id (organized)
        if (a.folder_id && !b.folder_id) return -1
        if (!a.folder_id && b.folder_id) return 1
        
        // Prefer newer tracks
        const aDate = new Date(a.created_at_timestamp || 0)
        const bDate = new Date(b.created_at_timestamp || 0)
        return bDate.getTime() - aDate.getTime()
      })

      // Keep the first one (best candidate), remove the rest
      const keepTrack = tracks[0]
      const removeTracks = tracks.slice(1)

      for (const trackToRemove of removeTracks) {
        try {
          const { error: deleteError } = await supabase
            .from('music_library_tracks')
            .delete()
            .eq('id', trackToRemove.id)

          if (deleteError) {
            stats.errors.push(`Failed to delete ${trackToRemove.title}: ${deleteError.message}`)
          } else {
            stats.duplicatesRemoved++
            console.log(`   ✅ Removed duplicate: ${trackToRemove.title} (kept: ${keepTrack.title})`)
          }
        } catch (error) {
          stats.errors.push(`Error deleting ${trackToRemove.title}: ${error.message}`)
        }
      }
    }

    // Print summary
    console.log('\n📊 Cleanup Summary:')
    console.log(`   Duplicate groups found: ${duplicates.length}`)
    console.log(`   Duplicates removed: ${stats.duplicatesRemoved}`)
    if (stats.errors.length > 0) {
      console.log(`   Errors: ${stats.errors.length}`)
      stats.errors.slice(0, 10).forEach((error) => console.log(`      - ${error}`))
    }

    // Get final count
    const { count: finalCount } = await supabase
      .from('music_library_tracks')
      .select('*', { count: 'exact', head: true })

    const { count: linkedCount } = await supabase
      .from('music_library_tracks')
      .select('*', { count: 'exact', head: true })
      .not('audio_file_id', 'is', null)

    console.log(`\n✅ Cleanup complete!`)
    console.log(`   Final track count: ${finalCount}`)
    console.log(`   Linked tracks: ${linkedCount}`)

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

main()
