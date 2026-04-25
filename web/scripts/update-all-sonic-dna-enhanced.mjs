#!/usr/bin/env node
/**
 * Update All Tracks with Enhanced Sonic DNA Analysis
 * 
 * This script regenerates Sonic DNA for all tracks using the new enhanced analysis system:
 * - Advanced drum pattern analysis (kick/snare/hi-hat patterns)
 * - Half-time/full-time detection
 * - Extended subgenre classification (150+ subgenres)
 * - Percussion cadence analysis
 * - Bassline style detection
 * - MusicBrainz integration
 * 
 * Usage:
 *   node scripts/update-all-sonic-dna-enhanced.mjs           # Update tracks without analysis
 *   node scripts/update-all-sonic-dna-enhanced.mjs --force   # Force update ALL tracks
 *   node scripts/update-all-sonic-dna-enhanced.mjs --limit=10 --dry-run
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
const apiBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Parse command line arguments
const args = process.argv.slice(2)
const force = args.includes('--force') || args.includes('-f')
const dryRun = args.includes('--dry-run')
const limitArg = args.find(a => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null
const batchSizeArg = args.find(a => a.startsWith('--batch='))
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 3
const skipSyncArg = args.includes('--skip-sync')

// Enhanced Sonic DNA Schema (v2.1)
const ENHANCED_SONIC_DNA_SCHEMA = {
  drums: {
    pattern: { patternType: null, kickPattern: null, snarePattern: null, hihatPattern: null, complexity: null },
    genreStyles: { primary: [], secondary: [], characteristics: [], confidence: 0 },
    kickAnalysis: null,
    snareAnalysis: null,
    hihatAnalysis: null,
    cadence: { density: null, complexity: null, syncopation: null, groove: null, polyrhythm: false, layers: 0 },
    timing: { type: null, confidence: 0, indicators: [], effectiveBpm: null },
    bassline: { type: null, character: [], slides: false, subHarmonics: false },
    signatureMatch: null,
    patternRecognition: null
  },
  genres: {
    primaryGenres: [],
    subgenres: [],
    microgenres: [],
    genreTags: [],
    subgenreClassification: { primary: null, secondary: [], confidence: 0 },
    genreFusion: null,
    era: null,
    origins: [],
    confidence: 0
  },
  timing: { feel: null, confidence: 0, indicators: [], effectiveBpm: null, description: null },
  _metadata: { processedAt: null, agentVersion: '2.1', qualityScore: 0, enhancedAnalysis: {} }
}

/**
 * Check if track needs enhanced analysis
 */
function needsEnhancedAnalysis(sonicDna) {
  if (!sonicDna) return true
  
  // Check for v2.1 markers
  const metadata = sonicDna._metadata
  if (!metadata) return true
  
  // Check agent version
  if (metadata.agentVersion !== '2.1') return true
  
  // Check for enhanced analysis markers
  if (!metadata.enhancedAnalysis?.hasDrumPatternAnalysis) return true
  if (!metadata.enhancedAnalysis?.hasSubgenreClassification) return true
  if (!metadata.enhancedAnalysis?.hasTimingAnalysis) return true
  
  // Check for timing section
  if (!sonicDna.timing?.feel) return true
  
  // Check for advanced drum analysis
  if (!sonicDna.drums?.cadence || !sonicDna.drums?.timing) return true
  
  // Check for subgenre classification
  if (!sonicDna.genres?.subgenreClassification?.primary) return true
  
  return false
}

/**
 * Trigger enhanced analysis for a track
 */
async function analyzeTrack(track, stats) {
  const path = track.file_path || track.file_url
  if (!path) {
    console.log(`   ⚠️ No file path for "${track.title}"`)
    stats.noPath++
    return null
  }
  
  try {
    // Use the API endpoint with force=true
    const url = `${apiBaseUrl}/api/audio/sonic-dna?path=${encodeURIComponent(path)}&force=true`
    
    const response = await fetch(url, { method: 'POST' })
    const result = await response.json()
    
    if (result.status === 'processing') {
      return { status: 'processing', trackId: track.id }
    } else if (result.status === 'completed') {
      return { status: 'completed', trackId: track.id }
    } else if (result.error) {
      console.log(`   ❌ Error: ${result.error}`)
      stats.errors++
      return null
    }
    
    return { status: result.status, trackId: track.id }
  } catch (error) {
    console.error(`   ❌ Request failed: ${error.message}`)
    stats.errors++
    return null
  }
}

/**
 * Wait for track analysis to complete
 */
async function waitForCompletion(trackId, maxWaitMs = 120000) {
  const startTime = Date.now()
  const pollInterval = 5000
  
  while (Date.now() - startTime < maxWaitMs) {
    const { data: track } = await supabase
      .from('audio_files')
      .select('sonic_dna_status, sonic_dna')
      .eq('id', trackId)
      .single()
    
    if (track?.sonic_dna_status === 'completed') {
      return { success: true, sonicDna: track.sonic_dna }
    } else if (track?.sonic_dna_status === 'failed') {
      return { success: false, error: 'Analysis failed' }
    }
    
    await new Promise(r => setTimeout(r, pollInterval))
  }
  
  return { success: false, error: 'Timeout' }
}

/**
 * Sync sonic DNA from audio_files to music_library_tracks
 */
async function syncToMusicLibrary(audioFileId, sonicDna) {
  try {
    const { data: tracks } = await supabase
      .from('music_library_tracks')
      .select('id')
      .eq('audio_file_id', audioFileId)
    
    if (!tracks || tracks.length === 0) return 0
    
    // Extract key fields for music_library_tracks
    const updates = {
      sonic_dna: sonicDna,
      bpm: sonicDna?.technical?.bpm || null,
      key_signature: sonicDna?.harmony?.keySignature || sonicDna?.technical?.key?.key || null,
      energy_level: sonicDna?.technical?.energyLevel || null,
      danceability: sonicDna?.technical?.danceability || null
    }
    
    for (const track of tracks) {
      await supabase
        .from('music_library_tracks')
        .update(updates)
        .eq('id', track.id)
    }
    
    return tracks.length
  } catch (error) {
    console.error(`   ⚠️ Sync error: ${error.message}`)
    return 0
  }
}

async function main() {
  console.log('═'.repeat(70))
  console.log('🧬 ENHANCED SONIC DNA UPDATE - Version 2.1')
  console.log('═'.repeat(70))
  console.log()
  console.log('New features:')
  console.log('  • Advanced drum pattern analysis (kick/snare/hi-hat)')
  console.log('  • Half-time / full-time detection')
  console.log('  • Extended subgenre classification (150+ subgenres)')
  console.log('  • Percussion cadence & groove analysis')
  console.log('  • Bassline style detection')
  console.log('  • MusicBrainz integration')
  console.log()
  console.log(`Options: force=${force}, dryRun=${dryRun}, limit=${limit || 'none'}, batchSize=${batchSize}`)
  console.log()
  
  // Step 1: Fetch all audio files
  console.log('📊 Step 1: Fetching all audio files...')
  let query = supabase
    .from('audio_files')
    .select('id, title, artist, file_path, file_url, sonic_dna, sonic_dna_status')
    .order('created_at', { ascending: false })
  
  if (limit) {
    query = query.limit(limit)
  }
  
  const { data: audioFiles, error: fetchError } = await query
  
  if (fetchError) {
    console.error('❌ Failed to fetch audio files:', fetchError.message)
    process.exit(1)
  }
  
  console.log(`   Found ${audioFiles?.length || 0} audio files\n`)
  
  // Step 2: Identify tracks needing update
  console.log('🔍 Step 2: Identifying tracks needing enhanced analysis...')
  
  const needsUpdate = []
  const alreadyEnhanced = []
  
  for (const track of (audioFiles || [])) {
    if (force || needsEnhancedAnalysis(track.sonic_dna)) {
      needsUpdate.push(track)
    } else {
      alreadyEnhanced.push(track)
    }
  }
  
  console.log(`   Need update: ${needsUpdate.length}`)
  console.log(`   Already enhanced: ${alreadyEnhanced.length}`)
  console.log()
  
  if (needsUpdate.length === 0) {
    console.log('✅ All tracks already have enhanced analysis!')
    if (!force) {
      console.log('   Use --force to regenerate all tracks anyway.\n')
    }
    return
  }
  
  if (dryRun) {
    console.log('🔍 DRY RUN - Would update these tracks:')
    needsUpdate.slice(0, 20).forEach(t => console.log(`   - ${t.title} (${t.artist})`))
    if (needsUpdate.length > 20) {
      console.log(`   ... and ${needsUpdate.length - 20} more`)
    }
    return
  }
  
  // Step 3: Process in batches
  console.log(`🚀 Step 3: Processing ${needsUpdate.length} tracks in batches of ${batchSize}...\n`)
  
  const stats = {
    total: needsUpdate.length,
    processed: 0,
    completed: 0,
    failed: 0,
    noPath: 0,
    errors: 0,
    synced: 0
  }
  
  const processingTracks = []
  
  for (let i = 0; i < needsUpdate.length; i += batchSize) {
    const batch = needsUpdate.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    const totalBatches = Math.ceil(needsUpdate.length / batchSize)
    
    console.log(`\n📦 Batch ${batchNum}/${totalBatches}`)
    
    // Start analysis for batch
    const batchPromises = batch.map(async (track) => {
      console.log(`   🔄 ${track.title}`)
      const result = await analyzeTrack(track, stats)
      if (result) {
        processingTracks.push(result.trackId)
      }
      return result
    })
    
    const batchResults = await Promise.all(batchPromises)
    stats.processed += batch.length
    
    // Wait for batch to complete
    console.log(`   ⏳ Waiting for analysis to complete...`)
    
    for (const result of batchResults) {
      if (!result) continue
      
      const completion = await waitForCompletion(result.trackId)
      
      if (completion.success) {
        stats.completed++
        console.log(`   ✅ Completed`)
        
        // Sync to music library if not skipped
        if (!skipSyncArg && completion.sonicDna) {
          const syncedCount = await syncToMusicLibrary(result.trackId, completion.sonicDna)
          stats.synced += syncedCount
        }
      } else {
        stats.failed++
        console.log(`   ❌ Failed: ${completion.error}`)
      }
    }
    
    // Progress update
    const progress = Math.round((stats.processed / stats.total) * 100)
    console.log(`\n   Progress: ${stats.processed}/${stats.total} (${progress}%)`)
    console.log(`   Completed: ${stats.completed}, Failed: ${stats.failed}`)
    
    // Small delay between batches
    if (i + batchSize < needsUpdate.length) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(70))
  console.log('📊 FINAL SUMMARY')
  console.log('═'.repeat(70))
  console.log(`Total tracks:        ${stats.total}`)
  console.log(`Processed:           ${stats.processed}`)
  console.log(`Completed:           ${stats.completed}`)
  console.log(`Failed:              ${stats.failed}`)
  console.log(`No file path:        ${stats.noPath}`)
  console.log(`Request errors:      ${stats.errors}`)
  console.log(`Synced to library:   ${stats.synced}`)
  console.log('═'.repeat(70))
  
  if (stats.completed === stats.total) {
    console.log('\n✅ All tracks updated successfully!')
  } else if (stats.completed > 0) {
    console.log(`\n⚠️  ${stats.completed}/${stats.total} tracks updated`)
    console.log('   Re-run the script to retry failed tracks.')
  } else {
    console.log('\n❌ Update failed. Check the errors above.')
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
