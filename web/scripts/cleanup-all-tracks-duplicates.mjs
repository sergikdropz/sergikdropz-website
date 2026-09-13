#!/usr/bin/env node
/**
 * Cleanup Duplicate Tracks in "All Tracks" Folder
 * 
 * This script:
 * 1. Identifies duplicate track entries (same audio_file_id)
 * 2. Keeps the most complete/enriched version of each track
 * 3. Removes redundant entries
 * 4. Creates a backup before making changes
 * 
 * SAFE: Only affects the "All Tracks" folder, leaves playlists intact
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'

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

const ALL_TRACKS_FOLDER_ID = 'folder-all-tracks'

async function main() {
  console.log('═'.repeat(60))
  console.log('🧹 Cleanup Duplicate Tracks in "All Tracks" Folder')
  console.log('═'.repeat(60))
  console.log('')

  // Step 1: Fetch all tracks in "All Tracks" folder
  console.log('📊 Fetching tracks from "All Tracks" folder...')
  const { data: allTracks, error: fetchError } = await supabase
    .from('music_library_tracks')
    .select('*')
    .eq('folder_id', ALL_TRACKS_FOLDER_ID)
    .order('created_at', { ascending: true })

  if (fetchError) {
    console.error('Error fetching tracks:', fetchError.message)
    process.exit(1)
  }

  console.log(`Found ${allTracks.length} total track entries`)
  console.log('')

  // Step 2: Group by audio_file_id
  const groupedByAudioId = new Map()
  const tracksWithoutAudioId = []

  allTracks.forEach(track => {
    if (track.audio_file_id) {
      if (!groupedByAudioId.has(track.audio_file_id)) {
        groupedByAudioId.set(track.audio_file_id, [])
      }
      groupedByAudioId.get(track.audio_file_id).push(track)
    } else {
      tracksWithoutAudioId.push(track)
    }
  })

  console.log(`Unique audio files: ${groupedByAudioId.size}`)
  console.log(`Tracks without audio_file_id: ${tracksWithoutAudioId.length}`)
  console.log('')

  // Step 3: Find duplicates
  const duplicateGroups = []
  const toDelete = []
  const toKeep = []

  for (const [audioId, tracks] of groupedByAudioId) {
    if (tracks.length > 1) {
      duplicateGroups.push({ audioId, tracks })
      
      // Score each track to find the best one to keep
      // Higher score = more complete/enriched
      const scored = tracks.map(t => {
        let score = 0
        if (t.title && t.title !== 'Unknown') score += 10
        if (t.artist && t.artist !== 'SERGIK') score += 5
        if (t.bpm && t.bpm > 0) score += 10
        if (t.key_signature && t.key_signature !== 'Unknown') score += 15
        if (t.energy_level) score += 5
        if (t.danceability) score += 5
        if (t.sonic_dna && Object.keys(t.sonic_dna).length > 5) score += 20
        if (t.metadata && Object.keys(t.metadata).length > 0) score += 10
        if (t.artwork_url) score += 5
        // Prefer tracks created earlier (original entries)
        score += new Date(t.created_at).getTime() > 0 ? 1 : 0
        return { track: t, score }
      })
      
      // Sort by score descending, keep the best one
      scored.sort((a, b) => b.score - a.score)
      
      toKeep.push(scored[0].track)
      toDelete.push(...scored.slice(1).map(s => s.track))
    } else {
      toKeep.push(tracks[0])
    }
  }

  // Include tracks without audio_file_id in toKeep (can't determine duplicates)
  toKeep.push(...tracksWithoutAudioId)

  console.log('─'.repeat(60))
  console.log('ANALYSIS RESULTS')
  console.log('─'.repeat(60))
  console.log(`Duplicate groups found: ${duplicateGroups.length}`)
  console.log(`Tracks to KEEP: ${toKeep.length}`)
  console.log(`Tracks to DELETE: ${toDelete.length}`)
  console.log('')

  if (toDelete.length === 0) {
    console.log('✅ No duplicates found! Database is clean.')
    return
  }

  // Show sample duplicates
  console.log('Sample duplicate groups:')
  duplicateGroups.slice(0, 5).forEach(({ audioId, tracks }) => {
    console.log(`  Audio ID: ${audioId.substring(0, 20)}...`)
    tracks.forEach(t => {
      console.log(`    - "${t.title}" (ID: ${t.id.substring(0, 15)}...)`)
    })
  })
  console.log('')

  // Step 4: Create backup
  console.log('💾 Creating backup...')
  const backupDir = join(__dirname, '..', 'data', 'backups')
  try {
    mkdirSync(backupDir, { recursive: true })
  } catch (e) {}

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(backupDir, `all-tracks-backup-${timestamp}.json`)
  
  const backup = {
    timestamp: new Date().toISOString(),
    totalTracksBeforeCleanup: allTracks.length,
    tracksToDelete: toDelete.map(t => ({
      id: t.id,
      title: t.title,
      audio_file_id: t.audio_file_id
    })),
    fullTrackData: toDelete
  }
  
  writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  console.log(`Backup saved to: ${backupPath}`)
  console.log('')

  // Step 5: Delete duplicates
  console.log('🗑️  Removing duplicate entries...')
  
  const deleteIds = toDelete.map(t => t.id)
  const BATCH_SIZE = 50
  let deleted = 0
  let errors = 0

  for (let i = 0; i < deleteIds.length; i += BATCH_SIZE) {
    const batch = deleteIds.slice(i, i + BATCH_SIZE)
    
    const { error: deleteError } = await supabase
      .from('music_library_tracks')
      .delete()
      .in('id', batch)
    
    if (deleteError) {
      console.error(`Error deleting batch: ${deleteError.message}`)
      errors += batch.length
    } else {
      deleted += batch.length
      process.stdout.write(`\r  Deleted ${deleted}/${toDelete.length} duplicates...`)
    }
  }

  console.log('')
  console.log('')

  // Step 6: Verify
  const { count: remainingCount } = await supabase
    .from('music_library_tracks')
    .select('*', { count: 'exact', head: true })
    .eq('folder_id', ALL_TRACKS_FOLDER_ID)

  console.log('═'.repeat(60))
  console.log('📊 CLEANUP SUMMARY')
  console.log('═'.repeat(60))
  console.log(`Before: ${allTracks.length} track entries`)
  console.log(`Deleted: ${deleted} duplicate entries`)
  console.log(`Errors: ${errors}`)
  console.log(`After: ${remainingCount} track entries`)
  console.log(`Unique audio files: ${groupedByAudioId.size}`)
  console.log('')
  
  if (remainingCount === groupedByAudioId.size + tracksWithoutAudioId.length) {
    console.log('✅ Cleanup successful! No more duplicates.')
  } else {
    console.log('⚠️  Some discrepancy detected. Check backup for recovery if needed.')
  }
  
  console.log('')
  console.log('Backup location:', backupPath)
}

main().catch(console.error)
