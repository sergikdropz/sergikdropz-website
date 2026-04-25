#!/usr/bin/env node
/**
 * Update Track Genres with Enhanced Analysis
 * 
 * This script extracts genre data from the enhanced Sonic DNA analysis
 * and updates the track records with:
 * - Primary genres
 * - Subgenres (from extended 150+ classification)
 * - Microgenres
 * - Genre tags
 * - Timing feel (half-time/full-time)
 * - Drum genre styles
 * - Era and origins
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Parse args
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const verbose = args.includes('--verbose') || args.includes('-v')

/**
 * Extract comprehensive genre data from Sonic DNA
 */
function extractGenreData(sonicDna) {
  if (!sonicDna) return null
  
  const genres = sonicDna.genres || {}
  const drums = sonicDna.drums || {}
  const timing = sonicDna.timing || drums.timing || {}
  const cultural = sonicDna.cultural || {}
  
  // Extract primary genres
  const primaryGenres = [
    ...(genres.primaryGenres || []),
    ...(genres.primary || [])
  ].filter((v, i, a) => a.indexOf(v) === i)
  
  // Extract subgenres from multiple sources
  const subgenres = [
    ...(genres.subgenres || []),
    ...(genres.subgenreClassification?.primary ? [genres.subgenreClassification.primary.name] : []),
    ...(genres.subgenreClassification?.secondary?.map(s => typeof s === 'string' ? s : s.name) || [])
  ].filter((v, i, a) => v && a.indexOf(v) === i)
  
  // Extract microgenres
  const microgenres = genres.microgenres || []
  
  // Extract genre tags (MusicBrainz compatible)
  const genreTags = [
    ...(genres.genreTags || []),
    ...(genres.musicbrainzCompatibleTags || [])
  ].filter((v, i, a) => v && a.indexOf(v) === i)
  
  // Extract drum genre styles
  const drumGenreStyles = Array.isArray(drums.genreStyles) 
    ? drums.genreStyles 
    : (drums.genreStyles?.primary || [])
  
  // Extract timing info
  const timingFeel = timing.type || timing.feel || null
  const timingConfidence = timing.confidence || 0
  const effectiveBpm = timing.effectiveBpm || null
  
  // Extract era and origins
  const era = genres.era || cultural.era || null
  const origins = [
    ...(genres.origins || []),
    ...(cultural.origins || []),
    ...(cultural.regions || [])
  ].filter((v, i, a) => v && a.indexOf(v) === i)
  
  // Build subgenre classification summary
  const subgenreClassification = genres.subgenreClassification?.primary ? {
    primary: genres.subgenreClassification.primary.name,
    primaryParent: genres.subgenreClassification.primary.parent,
    confidence: genres.subgenreClassification.primary.confidence,
    matchedFeatures: genres.subgenreClassification.primary.matchedFeatures || [],
    secondary: genres.subgenreClassification.secondary?.map(s => typeof s === 'string' ? s : s.name) || []
  } : null
  
  return {
    primaryGenres,
    subgenres,
    microgenres,
    genreTags,
    drumGenreStyles,
    timingFeel,
    timingConfidence,
    effectiveBpm,
    era,
    origins,
    subgenreClassification,
    genreFusion: genres.genreFusion || genres.fusion || null,
    genreCharacteristics: genres.genreCharacteristics || [],
    confidence: genres.confidence || (subgenreClassification?.confidence || 0)
  }
}

/**
 * Build genre summary string
 */
function buildGenreSummary(genreData) {
  if (!genreData) return null
  
  const parts = []
  
  if (genreData.subgenreClassification?.primary) {
    parts.push(genreData.subgenreClassification.primary)
  } else if (genreData.primaryGenres.length > 0) {
    parts.push(genreData.primaryGenres[0])
  }
  
  if (genreData.timingFeel && genreData.timingFeel !== 'full-time') {
    parts.push(`(${genreData.timingFeel})`)
  }
  
  if (genreData.subgenres.length > 0 && !parts.includes(genreData.subgenres[0])) {
    parts.push(`/ ${genreData.subgenres[0]}`)
  }
  
  return parts.join(' ') || null
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('🎵 UPDATE TRACK GENRES WITH ENHANCED ANALYSIS')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log()
  console.log(`Options: dryRun=${dryRun}, verbose=${verbose}`)
  console.log()
  
  // Fetch all tracks with Sonic DNA
  console.log('📊 Fetching tracks with Sonic DNA...')
  
  const { data: tracks, error: fetchError } = await supabase
    .from('music_library_tracks')
    .select('id, title, artist, sonic_dna, metadata')
    .not('sonic_dna', 'is', null)
  
  if (fetchError) {
    console.error('❌ Failed to fetch tracks:', fetchError.message)
    process.exit(1)
  }
  
  console.log(`   Found ${tracks?.length || 0} tracks with Sonic DNA\n`)
  
  const stats = {
    total: tracks?.length || 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    genresExtracted: 0,
    subgenresExtracted: 0,
    timingDetected: 0
  }
  
  // Process each track
  console.log('🔄 Processing tracks...\n')
  
  for (const track of (tracks || [])) {
    const genreData = extractGenreData(track.sonic_dna)
    
    if (!genreData) {
      stats.skipped++
      continue
    }
    
    // Track stats
    if (genreData.primaryGenres.length > 0) stats.genresExtracted++
    if (genreData.subgenres.length > 0) stats.subgenresExtracted++
    if (genreData.timingFeel) stats.timingDetected++
    
    // Build genre summary
    const genreSummary = buildGenreSummary(genreData)
    
    // Prepare metadata update
    const existingMetadata = track.metadata || {}
    const updatedMetadata = {
      ...existingMetadata,
      genres: {
        primary: genreData.primaryGenres,
        subgenres: genreData.subgenres,
        microgenres: genreData.microgenres,
        tags: genreData.genreTags,
        drumStyles: genreData.drumGenreStyles,
        era: genreData.era,
        origins: genreData.origins,
        fusion: genreData.genreFusion,
        characteristics: genreData.genreCharacteristics,
        subgenreClassification: genreData.subgenreClassification,
        confidence: genreData.confidence
      },
      timing: {
        feel: genreData.timingFeel,
        confidence: genreData.timingConfidence,
        effectiveBpm: genreData.effectiveBpm
      }
    }
    
    // Prepare update (only metadata - genre/subgenre columns may not exist)
    const updates = {
      metadata: updatedMetadata
    }
    
    if (verbose) {
      console.log(`   📝 ${track.title}`)
      console.log(`      Genre: ${updates.genre || 'N/A'}`)
      console.log(`      Subgenre: ${updates.subgenre || 'N/A'}`)
      if (genreData.timingFeel) console.log(`      Timing: ${genreData.timingFeel}`)
      if (genreData.drumGenreStyles.length > 0) console.log(`      Drum Styles: ${genreData.drumGenreStyles.slice(0, 3).join(', ')}`)
    }
    
    if (dryRun) {
      stats.updated++
      continue
    }
    
    // Apply update
    const { error: updateError } = await supabase
      .from('music_library_tracks')
      .update(updates)
      .eq('id', track.id)
    
    if (updateError) {
      console.error(`   ❌ Error updating "${track.title}":`, updateError.message)
      stats.errors++
    } else {
      stats.updated++
      process.stdout.write('.')
    }
  }
  
  console.log('\n')
  
  // Also update audio_files table
  console.log('📊 Updating audio_files table...')
  
  const { data: audioFiles, error: audioError } = await supabase
    .from('audio_files')
    .select('id, title, sonic_dna, metadata')
    .not('sonic_dna', 'is', null)
  
  if (!audioError && audioFiles) {
    let audioUpdated = 0
    
    for (const file of audioFiles) {
      const genreData = extractGenreData(file.sonic_dna)
      if (!genreData) continue
      
      const existingMetadata = file.metadata || {}
      const updatedMetadata = {
        ...existingMetadata,
        genres: {
          primary: genreData.primaryGenres,
          subgenres: genreData.subgenres,
          microgenres: genreData.microgenres,
          tags: genreData.genreTags,
          drumStyles: genreData.drumGenreStyles,
          era: genreData.era,
          origins: genreData.origins,
          subgenreClassification: genreData.subgenreClassification,
          confidence: genreData.confidence
        },
        timing: {
          feel: genreData.timingFeel,
          confidence: genreData.timingConfidence,
          effectiveBpm: genreData.effectiveBpm
        }
      }
      
      if (!dryRun) {
        const { error } = await supabase
          .from('audio_files')
          .update({ metadata: updatedMetadata })
          .eq('id', file.id)
        
        if (!error) {
          audioUpdated++
          process.stdout.write('.')
        }
      } else {
        audioUpdated++
      }
    }
    
    console.log(`\n   Updated ${audioUpdated} audio files`)
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log('📊 GENRE UPDATE SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(`Total tracks:           ${stats.total}`)
  console.log(`Updated:                ${stats.updated}`)
  console.log(`Skipped:                ${stats.skipped}`)
  console.log(`Errors:                 ${stats.errors}`)
  console.log('───────────────────────────────────────────────────────────────────')
  console.log(`Genres extracted:       ${stats.genresExtracted}`)
  console.log(`Subgenres extracted:    ${stats.subgenresExtracted}`)
  console.log(`Timing detected:        ${stats.timingDetected}`)
  console.log('═══════════════════════════════════════════════════════════════════')
  
  if (dryRun) {
    console.log('\n💡 This was a dry run. To apply updates, run without --dry-run')
  } else {
    console.log('\n✅ Genre update complete!')
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
