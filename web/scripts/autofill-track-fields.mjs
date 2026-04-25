#!/usr/bin/env node
/**
 * Auto-fill Track Editor Fields from Sonic DNA
 * 
 * This script:
 * 1. Validates and normalizes all Sonic DNA data
 * 2. Copies data to track-level fields for the editor
 * 3. Ensures energy_level is 1-5 and danceability is 0-1
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Normalize energy level to 1-5 scale
 */
function normalizeEnergy(value) {
  if (value === null || value === undefined) return null
  // If already in 1-5 range, return as is
  if (value >= 1 && value <= 5) return Math.round(value * 10) / 10
  // If in 0-10 range, normalize to 1-5
  if (value >= 0 && value <= 10) return Math.round(((value / 10) * 4 + 1) * 10) / 10
  // If in 0-1 range, normalize to 1-5
  if (value >= 0 && value <= 1) return Math.round((value * 4 + 1) * 10) / 10
  return Math.max(1, Math.min(5, value))
}

/**
 * Normalize danceability to 0-1 scale
 */
function normalizeDanceability(value) {
  if (value === null || value === undefined) return null
  // If already in 0-1 range, return as is
  if (value >= 0 && value <= 1) return Math.round(value * 100) / 100
  // If in 0-10 range, normalize to 0-1
  if (value >= 0 && value <= 10) return Math.round((value / 10) * 100) / 100
  // If in 0-100 range, normalize to 0-1
  if (value >= 0 && value <= 100) return Math.round((value / 100) * 100) / 100
  return Math.max(0, Math.min(1, value))
}

/**
 * Extract primary genre from sonic_dna
 */
function extractPrimaryGenre(sonicDna) {
  if (!sonicDna?.genres) return null
  const genres = sonicDna.genres
  const primary = genres.primaryGenres || genres.primary || []
  return primary.length > 0 ? primary[0] : null
}

/**
 * Extract all genres as array
 */
function extractAllGenres(sonicDna) {
  if (!sonicDna?.genres) return []
  const genres = sonicDna.genres
  const all = new Set()
  
  ;(genres.primaryGenres || genres.primary || []).forEach(g => all.add(g))
  ;(genres.secondary || []).forEach(g => all.add(g))
  ;(genres.subgenres || []).forEach(g => all.add(g))
  
  return Array.from(all)
}

async function main() {
  console.log('🔧 Auto-filling track editor fields from Sonic DNA...\n')
  
  // Get all tracks with their audio files
  const { data: tracks, error } = await supabase
    .from('music_library_tracks')
    .select('id, title, audio_file_id, bpm, key_signature, energy_level, danceability, sonic_dna, metadata')
  
  if (error) {
    console.error('Error fetching tracks:', error.message)
    process.exit(1)
  }
  
  console.log(`Found ${tracks?.length || 0} tracks\n`)
  
  const stats = {
    total: tracks?.length || 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    fields: {
      bpm: 0,
      key_signature: 0,
      energy_level: 0,
      danceability: 0,
      genres: 0
    }
  }
  
  for (const track of (tracks || [])) {
    const updates = {}
    let needsUpdate = false
    const dna = track.sonic_dna || {}
    const tech = dna.technical || {}
    const harmony = dna.harmony || {}
    
    // BPM - use track.bpm, fallback to sonic_dna
    const bpm = track.bpm || tech.bpm || tech.tempo?.bpm
    if (bpm && bpm !== track.bpm) {
      updates.bpm = Math.round(bpm)
      needsUpdate = true
      stats.fields.bpm++
    }
    
    // Key Signature - try multiple sources
    let keySignature = track.key_signature
    if (!keySignature || keySignature === 'Unknown') {
      keySignature = tech.keySignature || harmony.keySignature || tech.key?.key
      if (keySignature && keySignature !== 'Unknown' && keySignature !== track.key_signature) {
        updates.key_signature = keySignature
        needsUpdate = true
        stats.fields.key_signature++
      }
    }
    
    // Energy Level - normalize to 1-5
    const rawEnergy = tech.energyLevel ?? tech.energy?.level ?? track.energy_level
    const normalizedEnergy = normalizeEnergy(rawEnergy)
    if (normalizedEnergy !== null && normalizedEnergy !== track.energy_level) {
      updates.energy_level = normalizedEnergy
      needsUpdate = true
      stats.fields.energy_level++
    }
    
    // Danceability - normalize to 0-1
    const rawDanceability = tech.danceability ?? track.danceability
    const normalizedDanceability = normalizeDanceability(rawDanceability)
    if (normalizedDanceability !== null && normalizedDanceability !== track.danceability) {
      updates.danceability = normalizedDanceability
      needsUpdate = true
      stats.fields.danceability++
    }
    
    // Genres - extract from sonic_dna and store in metadata
    const allGenres = extractAllGenres(dna)
    const primaryGenre = extractPrimaryGenre(dna)
    
    // Update metadata with sonic_dna data and genres
    const metadata = track.metadata || {}
    const currentGenres = metadata.genres || []
    const genresChanged = allGenres.length > 0 && JSON.stringify(allGenres.sort()) !== JSON.stringify(currentGenres.sort())
    
    if (needsUpdate || genresChanged) {
      updates.metadata = {
        ...metadata,
        genres: allGenres.length > 0 ? allGenres : currentGenres,
        primary_genre: primaryGenre || metadata.primary_genre,
        sonic_dna_synced_at: new Date().toISOString(),
        has_sonic_dna: true
      }
      if (genresChanged) {
        stats.fields.genres++
        needsUpdate = true
      }
    }
    
    if (!needsUpdate) {
      stats.skipped++
      continue
    }
    
    // Apply updates
    const { error: updateError } = await supabase
      .from('music_library_tracks')
      .update(updates)
      .eq('id', track.id)
    
    if (updateError) {
      console.error(`Error updating "${track.title}":`, updateError.message)
      stats.errors++
    } else {
      stats.updated++
      process.stdout.write('.')
    }
  }
  
  console.log('\n')
  console.log('═'.repeat(60))
  console.log('📊 AUTO-FILL SUMMARY')
  console.log('═'.repeat(60))
  console.log(`Total tracks:        ${stats.total}`)
  console.log(`Updated:             ${stats.updated}`)
  console.log(`Skipped (no change): ${stats.skipped}`)
  console.log(`Errors:              ${stats.errors}`)
  console.log('')
  console.log('Fields updated:')
  console.log(`  BPM:           ${stats.fields.bpm}`)
  console.log(`  Key Signature: ${stats.fields.key_signature}`)
  console.log(`  Energy Level:  ${stats.fields.energy_level}`)
  console.log(`  Danceability:  ${stats.fields.danceability}`)
  console.log(`  Genres:        ${stats.fields.genres}`)
  console.log('═'.repeat(60))
  console.log('\n✅ Auto-fill complete!')
}

main().catch(console.error)
