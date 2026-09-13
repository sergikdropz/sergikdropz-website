#!/usr/bin/env node

/**
 * Remove Database Duplicates
 * 
 * Removes duplicate tracks from Supabase database, keeping the best entry:
 * - Prefers entries with both waveform AND Sonic DNA
 * - If multiple have both, keeps the oldest (first created)
 * - If none have both, keeps the one with the most complete data
 * 
 * Usage: node scripts/remove-database-duplicates.mjs [--dry-run] [--confirm]
 */

import { createClient } from '@supabase/supabase-js'
import { join } from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const DRY_RUN = process.argv.includes('--dry-run')
const CONFIRM = process.argv.includes('--confirm')

// Normalize file path for comparison
function normalizePath(path) {
  if (!path) return ''
  return path
    .replace(/^\/audio\//, '')
    .replace(/^\//, '')
    .replace(/\\/g, '/')
    .toLowerCase()
    .trim()
}

// Score a track to determine which duplicate to keep
function scoreTrack(track) {
  let score = 0
  
  // Has waveform data
  if (track.waveform_data && Array.isArray(track.waveform_data) && track.waveform_data.length > 0) {
    score += 10
  }
  
  // Has Sonic DNA
  if (track.sonic_dna && typeof track.sonic_dna === 'object') {
    score += 10
  }
  
  // Has BPM
  if (track.bpm && track.bpm > 0) {
    score += 2
  }
  
  // Has other metadata
  if (track.energy_level) score += 1
  if (track.key_signature) score += 1
  if (track.duration_seconds) score += 1
  
  // Prefer older entries (created earlier) - subtract days since creation
  if (track.created_at) {
    const daysSinceCreation = (Date.now() - new Date(track.created_at).getTime()) / (1000 * 60 * 60 * 24)
    score += daysSinceCreation * 0.1 // Slight preference for older entries
  }
  
  return score
}

async function removeDuplicates() {
  console.log('🧹 Removing Database Duplicates\n')
  console.log('='.repeat(70))
  console.log()
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n')
  } else if (!CONFIRM) {
    console.log('⚠️  WARNING: This will DELETE duplicate entries from the database!')
    console.log('   Run with --confirm to actually delete duplicates')
    console.log('   Run with --dry-run to see what would be deleted\n')
    process.exit(1)
  }

  // Get all tracks from database
  const { data: dbTracks, error: dbError } = await supabase
    .from('audio_files')
    .select('id, title, artist, file_path, file_name, created_at, waveform_data, sonic_dna, bpm, energy_level, key_signature, duration_seconds')
    .order('created_at', { ascending: false })

  if (dbError) {
    console.error('❌ Failed to fetch tracks from database:', dbError.message)
    process.exit(1)
  }

  console.log(`✅ Found ${dbTracks.length} tracks in database`)
  console.log()

  // Group by normalized file path
  const pathMap = new Map()
  const duplicates = []

  dbTracks.forEach(track => {
    const normalizedPath = normalizePath(track.file_path || track.file_name || '')
    if (!normalizedPath) return

    if (!pathMap.has(normalizedPath)) {
      pathMap.set(normalizedPath, [])
    }
    pathMap.get(normalizedPath).push(track)
  })

  // Find duplicates
  pathMap.forEach((tracks, path) => {
    if (tracks.length > 1) {
      duplicates.push({ path, tracks })
    }
  })

  console.log(`📊 Found ${duplicates.length} duplicate groups`)
  console.log()

  // Process each duplicate group
  const stats = {
    groupsProcessed: 0,
    entriesToKeep: 0,
    entriesToDelete: 0,
    errors: 0,
  }

  for (const { path, tracks } of duplicates) {
    stats.groupsProcessed++
    
    // Score each track
    const scoredTracks = tracks.map(track => ({
      ...track,
      score: scoreTrack(track),
    }))
    
    // Sort by score (highest first), then by created_at (oldest first)
    scoredTracks.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return new Date(a.created_at) - new Date(b.created_at)
    })
    
    // Keep the best one, delete the rest
    const toKeep = scoredTracks[0]
    const toDelete = scoredTracks.slice(1)
    
    stats.entriesToKeep++
    stats.entriesToDelete += toDelete.length
    
    console.log(`\n📁 "${path}"`)
    console.log(`   ✅ Keeping: ID ${toKeep.id} | Score: ${toKeep.score.toFixed(1)} | ${toKeep.title}`)
    console.log(`   ${toKeep.waveform_data && Array.isArray(toKeep.waveform_data) && toKeep.waveform_data.length > 0 ? '✅' : '❌'} Waveform | ${toKeep.sonic_dna && typeof toKeep.sonic_dna === 'object' ? '✅' : '❌'} Sonic DNA`)
    
    if (toDelete.length > 0) {
      console.log(`   🗑️  Deleting ${toDelete.length} duplicates:`)
      toDelete.forEach((track, i) => {
        console.log(`      ${i + 1}. ID: ${track.id} | Score: ${track.score.toFixed(1)} | Created: ${new Date(track.created_at).toLocaleDateString()}`)
      })
      
      if (!DRY_RUN) {
        // Delete duplicates
        const idsToDelete = toDelete.map(t => t.id)
        const { error } = await supabase
          .from('audio_files')
          .delete()
          .in('id', idsToDelete)
        
        if (error) {
          console.error(`   ❌ Error deleting duplicates: ${error.message}`)
          stats.errors++
        } else {
          console.log(`   ✅ Deleted ${idsToDelete.length} duplicate entries`)
        }
      }
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log('📊 Cleanup Summary:')
  console.log('='.repeat(70))
  console.log()
  console.log(`   Groups processed: ${stats.groupsProcessed}`)
  console.log(`   Entries to keep: ${stats.entriesToKeep}`)
  console.log(`   Entries to delete: ${stats.entriesToDelete}`)
  console.log(`   Errors: ${stats.errors}`)
  console.log()
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN - No changes were made')
    console.log('   Run without --dry-run and with --confirm to actually delete duplicates')
  } else {
    console.log(`✅ Cleanup complete! Removed ${stats.entriesToDelete} duplicate entries`)
    console.log(`   Database should now have ~${dbTracks.length - stats.entriesToDelete} unique tracks`)
  }
  console.log()
}

removeDuplicates()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
