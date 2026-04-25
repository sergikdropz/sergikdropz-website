#!/usr/bin/env node
/**
 * Populate Genre Data for All Tracks
 * 
 * Extracts genre information from sonic_dna and stores it in metadata
 * for quick access by the admin dashboard.
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

/**
 * Extract genre from various locations in sonic_dna
 */
function extractGenre(sonicDna) {
  if (!sonicDna) return null
  
  const dna = typeof sonicDna === 'string' ? JSON.parse(sonicDna) : sonicDna
  
  // Try multiple locations
  const genre = 
    dna?.genres?.primaryGenres?.[0] ||
    dna?.genres?.primary?.[0] ||
    dna?.genres?.genreTags?.[0] ||
    dna?.technical?.genre ||
    dna?.drums?.genreStyles?.[0] ||
    dna?.musical?.genre ||
    null
  
  return genre
}

/**
 * Extract all genres as array
 */
function extractAllGenres(sonicDna) {
  if (!sonicDna) return []
  
  const dna = typeof sonicDna === 'string' ? JSON.parse(sonicDna) : sonicDna
  const genres = new Set()
  
  // Collect from all possible locations
  if (dna?.genres?.primaryGenres) dna.genres.primaryGenres.forEach(g => genres.add(g))
  if (dna?.genres?.primary) dna.genres.primary.forEach(g => genres.add(g))
  if (dna?.genres?.genreTags) dna.genres.genreTags.forEach(g => genres.add(g))
  if (dna?.genres?.subgenres) dna.genres.subgenres.forEach(g => genres.add(g))
  if (dna?.genres?.microgenres) dna.genres.microgenres.forEach(g => genres.add(g))
  if (dna?.drums?.genreStyles) dna.drums.genreStyles.forEach(g => genres.add(g))
  if (dna?.technical?.genre) genres.add(dna.technical.genre)
  if (dna?.musical?.genre) genres.add(dna.musical.genre)
  
  return Array.from(genres).filter(Boolean)
}

async function main() {
  console.log('═'.repeat(70))
  console.log('🎵 Populating Genre Data for All Tracks')
  console.log('═'.repeat(70))
  
  // Fetch all tracks
  const { data: tracks, error } = await supabase
    .from('music_library_tracks')
    .select('id, title, sonic_dna, metadata')
  
  if (error) {
    console.error('Error fetching tracks:', error.message)
    process.exit(1)
  }
  
  console.log(`Found ${tracks.length} tracks to process\n`)
  
  let updated = 0
  let skipped = 0
  let errors = 0
  
  const genreStats = {}
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    
    // Check if genre already exists in metadata
    const existingGenre = track.metadata?.primary_genre || track.metadata?.genres?.[0]
    
    // Extract genre from sonic_dna
    const primaryGenre = extractGenre(track.sonic_dna)
    const allGenres = extractAllGenres(track.sonic_dna)
    
    // Track genre stats
    if (primaryGenre) {
      genreStats[primaryGenre] = (genreStats[primaryGenre] || 0) + 1
    }
    
    // Skip if already has genre and matches
    if (existingGenre && existingGenre === primaryGenre) {
      skipped++
      continue
    }
    
    // Update if we found a genre
    if (primaryGenre || allGenres.length > 0) {
      const currentMetadata = track.metadata || {}
      const newMetadata = {
        ...currentMetadata,
        primary_genre: primaryGenre || allGenres[0] || null,
        genres: allGenres.length > 0 ? allGenres : currentMetadata.genres,
        genre_populated_at: new Date().toISOString()
      }
      
      const { error: updateError } = await supabase
        .from('music_library_tracks')
        .update({ metadata: newMetadata })
        .eq('id', track.id)
      
      if (updateError) {
        console.error(`Error updating ${track.title}:`, updateError.message)
        errors++
      } else {
        updated++
        if (updated % 50 === 0) {
          console.log(`Progress: ${updated} updated, ${skipped} skipped, ${errors} errors`)
        }
      }
    } else {
      skipped++
    }
  }
  
  console.log('\n' + '═'.repeat(70))
  console.log('📊 Genre Population Complete')
  console.log('═'.repeat(70))
  console.log(`✅ Updated: ${updated}`)
  console.log(`⏭️  Skipped: ${skipped}`)
  console.log(`❌ Errors: ${errors}`)
  
  // Show genre distribution
  console.log('\n📈 Genre Distribution:')
  const sortedGenres = Object.entries(genreStats).sort((a, b) => b[1] - a[1])
  sortedGenres.slice(0, 15).forEach(([genre, count]) => {
    const bar = '█'.repeat(Math.min(30, Math.round((count / tracks.length) * 100)))
    console.log(`  ${genre.padEnd(20)} ${count.toString().padStart(4)} ${bar}`)
  })
  
  const withGenre = sortedGenres.reduce((sum, [, count]) => sum + count, 0)
  const coverage = ((withGenre / tracks.length) * 100).toFixed(1)
  console.log(`\n🎯 Genre Coverage: ${coverage}% (${withGenre}/${tracks.length})`)
}

main().catch(console.error)
