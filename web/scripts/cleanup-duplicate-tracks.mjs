#!/usr/bin/env node
/**
 * Cleanup Duplicate Tracks
 * 
 * Removes duplicate tracks from music_library_tracks, keeping the ones
 * that are linked to audio_files and removing unlinked duplicates.
 * 
 * Usage: node scripts/cleanup-duplicate-tracks.mjs
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
  duplicatesFound: 0,
  duplicatesRemoved: 0,
  errors: [],
}

async function main() {
  try {
    console.log('🧹 Cleaning Up Duplicate Tracks\n')

    // Find all tracks
    const { data: allTracks, error: tracksError } = await supabase
      .from('music_library_tracks')
      .select('*')
      .order('created_at_timestamp', { ascending: false })

    if (tracksError) {
      throw new Error(`Failed to fetch tracks: ${tracksError.message}`)
    }

    if (!allTracks || allTracks.length === 0) {
      console.log('✅ No tracks found')
      return
    }

    console.log(`📥 Found ${allTracks.length} tracks\n`)

    // Group tracks by title and artist (case-insensitive)
    const trackGroups = new Map()
    
    allTracks.forEach(track => {
      const key = `${track.title?.toLowerCase() || ''}_${track.artist?.toLowerCase() || ''}`
      if (!trackGroups.has(key)) {
        trackGroups.set(key, [])
      }
      trackGroups.get(key).push(track)
    })

    // Find duplicates
    const duplicates = []
    for (const [key, tracks] of trackGroups.entries()) {
      if (tracks.length > 1) {
        duplicates.push(tracks)
        stats.duplicatesFound += tracks.length - 1
      }
    }

    console.log(`🔍 Found ${duplicates.length} groups with duplicates\n`)

    // Process each duplicate group
    for (const group of duplicates) {
      // Sort: linked tracks first, then by creation date
      group.sort((a, b) => {
        if (a.audio_file_id && !b.audio_file_id) return -1
        if (!a.audio_file_id && b.audio_file_id) return 1
        const aDate = new Date(a.created_at_timestamp || 0)
        const bDate = new Date(b.created_at_timestamp || 0)
        return bDate.getTime() - aDate.getTime()
      })

      // Keep the first one (best candidate), remove the rest
      const keepTrack = group[0]
      const removeTracks = group.slice(1)

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

    // Also remove tracks without audio_file_id that have no folder
    console.log('\n🧹 Cleaning up orphaned unlinked tracks...')
    const { data: orphanedTracks } = await supabase
      .from('music_library_tracks')
      .select('*')
      .is('audio_file_id', null)
      .is('folder_id', null)

    if (orphanedTracks && orphanedTracks.length > 0) {
      for (const track of orphanedTracks) {
        const { error } = await supabase
          .from('music_library_tracks')
          .delete()
          .eq('id', track.id)

        if (!error) {
          stats.duplicatesRemoved++
          console.log(`   ✅ Removed orphaned track: ${track.title}`)
        }
      }
    }

    // Print summary
    console.log('\n📊 Cleanup Summary:')
    console.log(`   Duplicate groups found: ${duplicates.length}`)
    console.log(`   Duplicates removed: ${stats.duplicatesRemoved}`)
    if (stats.errors.length > 0) {
      console.log(`   Errors: ${stats.errors.length}`)
      if (stats.errors.length <= 10) {
        stats.errors.forEach((error) => console.log(`      - ${error}`))
      } else {
        stats.errors.slice(0, 10).forEach((error) => console.log(`      - ${error}`))
        console.log(`      ... and ${stats.errors.length - 10} more errors`)
      }
    }

    // Get final count
    const { count: finalCount } = await supabase
      .from('music_library_tracks')
      .select('*', { count: 'exact', head: true })

    console.log(`\n✅ Cleanup complete! Final track count: ${finalCount}`)

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

main()
