#!/usr/bin/env node

/**
 * Sync Sonic DNA data from audio_files to music_library_tracks
 * 
 * This script:
 * 1. Scans all music_library_tracks that have audio_file_id
 * 2. Fetches sonic_dna and related metadata from audio_files
 * 3. Updates music_library_tracks with the complete data
 * 
 * Usage:
 *   node scripts/sync-sonic-dna-to-tracks.mjs [--fix]
 * 
 * Options:
 *   --fix, -f      Apply updates (default: dry run)
 */

import { config } from 'dotenv'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')

// Load .env.local first, then fallback to .env
const envLocalPath = join(PROJECT_ROOT, '.env.local')
const envPath = join(PROJECT_ROOT, '.env')

if (existsSync(envLocalPath)) {
  config({ path: envLocalPath })
} else if (existsSync(envPath)) {
  config({ path: envPath })
} else {
  config() // Try default .env
}

// Check for --fix flag
const FIX_MODE = process.argv.includes('--fix') || process.argv.includes('-f')

// Try to import Supabase client
let createClient
try {
  const supabaseModule = await import('@supabase/supabase-js')
  createClient = supabaseModule.createClient
} catch (error) {
  console.log('⚠️  @supabase/supabase-js not available')
}

function createSupabaseClient() {
  if (!createClient) return null
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables')
    console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    return null
  }

  return createClient(supabaseUrl, supabaseKey)
}

async function main() {
  console.log('🧬 Syncing Sonic DNA from audio_files to music_library_tracks\n')
  console.log(`Mode: ${FIX_MODE ? '🔧 FIX (will update database)' : '🔍 DRY RUN (no changes)'}\n`)

  if (!createClient) {
    console.error('❌ Cannot run. @supabase/supabase-js is not available.')
    console.error('   Install it with: npm install @supabase/supabase-js')
    process.exit(1)
  }

  const supabase = createSupabaseClient()
  if (!supabase) {
    console.error('❌ Cannot connect to database. Missing Supabase environment variables.')
    process.exit(1)
  }

  try {
    // Get all tracks with audio_file_id
    console.log('📊 Fetching tracks from music_library_tracks...')
    const { data: tracks, error: tracksError } = await supabase
      .from('music_library_tracks')
      .select('id, title, audio_file_id, sonic_dna, bpm, key_signature, energy_level, danceability, waveform, duration, artwork_url, created_at, date, year, metadata')
      .not('audio_file_id', 'is', null)

    if (tracksError) {
      console.error(`❌ Error fetching tracks: ${tracksError.message}`)
      process.exit(1)
    }

    if (!tracks || tracks.length === 0) {
      console.log('   ℹ️  No tracks with audio_file_id found')
      process.exit(0)
    }

    console.log(`   Found ${tracks.length} tracks with audio_file_id\n`)

    // Get all unique audio_file_ids
    const audioFileIds = [...new Set(tracks.map(t => t.audio_file_id).filter(Boolean))]
    console.log(`📊 Fetching ${audioFileIds.length} audio files...`)

    // Fetch audio files data - get ALL relevant fields
    const { data: audioFiles, error: audioFilesError } = await supabase
      .from('audio_files')
      .select('id, sonic_dna, bpm, key_signature, energy_level, danceability, waveform_data, sonic_dna_status, duration_seconds, artwork_url, created_at, metadata')
      .in('id', audioFileIds)

    if (audioFilesError) {
      console.error(`❌ Error fetching audio files: ${audioFilesError.message}`)
      process.exit(1)
    }

    if (!audioFiles || audioFiles.length === 0) {
      console.log('   ℹ️  No audio files found')
      process.exit(0)
    }

    // Create a map for quick lookup
    const audioFilesMap = new Map()
    audioFiles.forEach(af => {
      audioFilesMap.set(af.id, af)
    })

    console.log(`   Found ${audioFiles.length} audio files\n`)

    // Process each track
    const stats = {
      total: tracks.length,
      updated: 0,
      skipped: 0,
      errors: 0,
      sonicDnaUpdated: 0,
      bpmUpdated: 0,
      keySignatureUpdated: 0,
      energyLevelUpdated: 0,
      danceabilityUpdated: 0,
      waveformUpdated: 0,
      durationUpdated: 0,
      artworkUpdated: 0,
      metadataUpdated: 0,
    }

    console.log('🔄 Processing tracks...\n')

    for (const track of tracks) {
      const audioFile = audioFilesMap.get(track.audio_file_id)
      
      if (!audioFile) {
        console.log(`   ⚠️  Track "${track.title}" (ID: ${track.id}) - Audio file not found`)
        stats.errors++
        continue
      }

      // Check what needs updating
      const updates = {}
      let needsUpdate = false

      // Check sonic_dna - always prefer audio_file if it has analysis data
      if (audioFile.sonic_dna) {
        const audioDna = typeof audioFile.sonic_dna === 'string' ? JSON.parse(audioFile.sonic_dna) : audioFile.sonic_dna
        const hasActualData = !!(audioDna.genres || audioDna.musical || audioDna.technical || audioDna.drums || audioDna.comprehensive)
        
        if (hasActualData) {
          // Audio file has actual analysis data - always use it
          const trackDna = track.sonic_dna ? (typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna) : null
          const trackHasActualData = trackDna ? !!(trackDna.genres || trackDna.musical || trackDna.technical || trackDna.drums || trackDna.comprehensive) : false
          
          // Update if track doesn't have analysis data, or if they're different
          if (!trackHasActualData || JSON.stringify(track.sonic_dna) !== JSON.stringify(audioFile.sonic_dna)) {
            updates.sonic_dna = audioFile.sonic_dna
            needsUpdate = true
            stats.sonicDnaUpdated++
          }
        } else if (!track.sonic_dna) {
          // Audio file only has status, but track has nothing - use it anyway
          updates.sonic_dna = audioFile.sonic_dna
          needsUpdate = true
          stats.sonicDnaUpdated++
        }
      }

      // Check bpm
      if (audioFile.bpm && (!track.bpm || track.bpm !== audioFile.bpm)) {
        updates.bpm = audioFile.bpm
        needsUpdate = true
        stats.bpmUpdated++
      }

      // Check key_signature
      if (audioFile.key_signature && (!track.key_signature || track.key_signature !== audioFile.key_signature)) {
        updates.key_signature = audioFile.key_signature
        needsUpdate = true
        stats.keySignatureUpdated++
      }

      // Check energy_level
      if (audioFile.energy_level !== null && audioFile.energy_level !== undefined && 
          (!track.energy_level || track.energy_level !== audioFile.energy_level)) {
        updates.energy_level = audioFile.energy_level
        needsUpdate = true
        stats.energyLevelUpdated++
      }

      // Check danceability
      if (audioFile.danceability !== null && audioFile.danceability !== undefined && 
          (!track.danceability || track.danceability !== audioFile.danceability)) {
        updates.danceability = audioFile.danceability
        needsUpdate = true
        stats.danceabilityUpdated++
      }

      // Check waveform
      if (audioFile.waveform_data && (!track.waveform || JSON.stringify(track.waveform) !== JSON.stringify(audioFile.waveform_data))) {
        updates.waveform = audioFile.waveform_data
        needsUpdate = true
        stats.waveformUpdated++
      }

      // Check duration (if missing in track)
      if (audioFile.duration_seconds && (!track.duration || track.duration !== audioFile.duration_seconds)) {
        updates.duration = audioFile.duration_seconds
        needsUpdate = true
        stats.durationUpdated++
      }

      // Check artwork (if missing in track)
      if (audioFile.artwork_url && (!track.artwork_url || track.artwork_url !== audioFile.artwork_url)) {
        updates.artwork_url = audioFile.artwork_url
        needsUpdate = true
        stats.artworkUpdated++
      }

      // Check created_at/date (if missing in track)
      if (audioFile.created_at && !track.created_at) {
        updates.created_at = audioFile.created_at
        needsUpdate = true
      }

      // Always sync metadata to include sonic DNA and all analysis data
      const { mergeSonicDNAIntoMetadata } = await import('../utils/mergeSonicDNAIntoMetadata.mjs')
      
      const analysisData = {
        bpm: updates.bpm !== undefined ? updates.bpm : track.bpm,
        key_signature: updates.key_signature !== undefined ? updates.key_signature : track.key_signature,
        energy_level: updates.energy_level !== undefined ? updates.energy_level : track.energy_level,
        danceability: updates.danceability !== undefined ? updates.danceability : track.danceability,
        waveform_data: updates.waveform !== undefined ? updates.waveform : track.waveform,
        duration_seconds: updates.duration !== undefined ? updates.duration : track.duration,
        artwork_url: updates.artwork_url !== undefined ? updates.artwork_url : track.artwork_url
      }
      
      // Get the final sonic DNA (from updates or existing)
      const finalSonicDNA = updates.sonic_dna !== undefined ? updates.sonic_dna : track.sonic_dna
      
      // Merge sonic DNA and analysis data into metadata
      const trackMetadata = track.metadata || {}
      const audioMetadata = audioFile.metadata && typeof audioFile.metadata === 'object' ? audioFile.metadata : {}
      
      // Start with audio_file metadata, then merge track metadata, then add sonic DNA
      const mergedMetadata = mergeSonicDNAIntoMetadata(
        { ...audioMetadata, ...trackMetadata },
        finalSonicDNA,
        analysisData
      )
      
      // Always update metadata to ensure sonic DNA is included
      const metadataStr = JSON.stringify(mergedMetadata)
      const trackMetadataStr = JSON.stringify(trackMetadata)
      
      if (metadataStr !== trackMetadataStr) {
        updates.metadata = mergedMetadata
        needsUpdate = true
        stats.metadataUpdated++
      }

      if (!needsUpdate) {
        stats.skipped++
        continue
      }

      if (FIX_MODE) {
        // Apply updates
        const { error: updateError } = await supabase
          .from('music_library_tracks')
          .update(updates)
          .eq('id', track.id)

        if (updateError) {
          console.error(`   ❌ Error updating track "${track.title}": ${updateError.message}`)
          stats.errors++
        } else {
          stats.updated++
          const updateFields = Object.keys(updates).join(', ')
          console.log(`   ✅ Updated "${track.title}": ${updateFields}`)
        }
      } else {
        // Dry run - just report
        stats.updated++
        const updateFields = Object.keys(updates).join(', ')
        console.log(`   📝 Would update "${track.title}": ${updateFields}`)
      }
    }

    // Summary
    console.log(`\n${'='.repeat(70)}`)
    console.log('📊 SYNC SUMMARY')
    console.log('='.repeat(70))
    console.log(`   Total tracks processed: ${stats.total}`)
    console.log(`   Tracks to update: ${stats.updated}`)
    console.log(`   Tracks skipped (already up to date): ${stats.skipped}`)
    console.log(`   Errors: ${stats.errors}`)
    console.log(`\n   Fields to update:`)
    console.log(`   - Sonic DNA (contains Genre, Sub-Genre, Drum Style, Time Signature, Key, Scale): ${stats.sonicDnaUpdated}`)
    console.log(`   - BPM: ${stats.bpmUpdated}`)
    console.log(`   - Key Signature: ${stats.keySignatureUpdated}`)
    console.log(`   - Energy Level: ${stats.energyLevelUpdated}`)
    console.log(`   - Danceability: ${stats.danceabilityUpdated}`)
    console.log(`   - Waveform: ${stats.waveformUpdated}`)
    console.log(`   - Duration: ${stats.durationUpdated}`)
    console.log(`   - Artwork: ${stats.artworkUpdated}`)
    console.log(`   - Metadata: ${stats.metadataUpdated}`)

    if (FIX_MODE) {
      console.log(`\n✅ Sync complete! Updated ${stats.updated} tracks.`)
    } else {
      console.log(`\n💡 To apply updates, run:`)
      console.log(`   node scripts/sync-sonic-dna-to-tracks.mjs --fix`)
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
