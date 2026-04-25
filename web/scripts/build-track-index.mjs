#!/usr/bin/env node
/**
 * Build Track Index
 * 
 * Pre-computes summary data into the `metadata` field for fast stats queries.
 * This avoids fetching large sonic_dna/waveform columns just to calculate stats.
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  console.log('═'.repeat(70))
  console.log('🏗️  Building Track Index for Fast Stats')
  console.log('═'.repeat(70))

  // Fetch all tracks with full data
  const { data: tracks, error } = await supabase
    .from('music_library_tracks')
    .select('id, title, sonic_dna, waveform, metadata, bpm, key_signature, energy_level, danceability, artwork_url, audio_file_id')

  if (error) {
    console.error('Error fetching tracks:', error.message)
    process.exit(1)
  }

  console.log(`Found ${tracks.length} tracks to index\n`)

  let updated = 0
  let skipped = 0

  for (const track of tracks) {
    // Extract index data from sonic_dna
    let hasSonicDna = false
    let primaryGenre = null
    let allGenres = []
    let camelot = null

    if (track.sonic_dna) {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      
      // Check if it has real sonic DNA data
      hasSonicDna = !!(dna?.genres || dna?.technical || dna?.drums || dna?.harmony)
      
      // Extract genre
      primaryGenre = dna?.genres?.primaryGenres?.[0] || 
                     dna?.genres?.primary?.[0] || 
                     dna?.drums?.genreStyles?.[0] || null
      
      allGenres = [
        ...(dna?.genres?.primaryGenres || []),
        ...(dna?.genres?.primary || []),
        ...(dna?.genres?.subgenres || []),
        ...(dna?.drums?.genreStyles || [])
      ].filter((v, i, a) => v && a.indexOf(v) === i)
      
      // Extract camelot
      camelot = dna?.harmony?.camelot || dna?.technical?.camelot || null
    }

    // Build index object
    const index = {
      // Stats flags (booleans for fast filtering)
      has_bpm: !!track.bpm,
      has_key: !!(track.key_signature && track.key_signature !== 'Unknown'),
      has_sonic_dna: hasSonicDna,
      has_waveform: !!track.waveform,
      has_artwork: !!track.artwork_url,
      has_energy: track.energy_level != null,
      has_danceability: track.danceability != null,
      is_linked: !!track.audio_file_id,
      
      // Quick access data
      primary_genre: primaryGenre,
      genres: allGenres.length > 0 ? allGenres : null,
      camelot: camelot,
      
      // Index metadata
      indexed_at: new Date().toISOString(),
      index_version: 1
    }

    // Merge with existing metadata
    const currentMetadata = track.metadata || {}
    const newMetadata = {
      ...currentMetadata,
      ...index
    }

    // Check if update needed
    const needsUpdate = 
      currentMetadata.has_bpm !== index.has_bpm ||
      currentMetadata.has_key !== index.has_key ||
      currentMetadata.has_sonic_dna !== index.has_sonic_dna ||
      currentMetadata.has_waveform !== index.has_waveform ||
      currentMetadata.primary_genre !== index.primary_genre ||
      !currentMetadata.indexed_at

    if (!needsUpdate) {
      skipped++
      continue
    }

    // Update track
    const { error: updateError } = await supabase
      .from('music_library_tracks')
      .update({ metadata: newMetadata })
      .eq('id', track.id)

    if (updateError) {
      console.error(`Error updating ${track.title}:`, updateError.message)
    } else {
      updated++
    }

    if ((updated + skipped) % 100 === 0) {
      console.log(`Progress: ${updated + skipped}/${tracks.length}`)
    }
  }

  console.log('\n' + '═'.repeat(70))
  console.log('✅ Track Index Build Complete')
  console.log('═'.repeat(70))
  console.log(`Updated: ${updated}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Total: ${tracks.length}`)
}

main().catch(console.error)
