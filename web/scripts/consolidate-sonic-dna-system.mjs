#!/usr/bin/env node
/**
 * SONIC DNA SYSTEM CONSOLIDATION
 * 
 * This script performs a complete consolidation of all Sonic DNA data:
 * 1. Merges data from audio_files (source of truth) to music_library_tracks
 * 2. Indexes all metadata for fast queries
 * 3. Updates sonic_dna_cache for quick lookups
 * 4. Syncs all sources system-wide
 * 5. Validates data integrity
 * 
 * Usage: node scripts/consolidate-sonic-dna-system.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Deep merge utility
function deepMerge(target, source) {
  if (!source) return target
  if (!target) return source
  
  const output = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(target[key] || {}, source[key])
    } else if (source[key] !== undefined && source[key] !== null) {
      // Prefer non-empty values
      if (Array.isArray(source[key]) && source[key].length > 0) {
        output[key] = source[key]
      } else if (!Array.isArray(source[key])) {
        output[key] = source[key]
      } else if (!output[key] || (Array.isArray(output[key]) && output[key].length === 0)) {
        output[key] = source[key]
      }
    }
  }
  return output
}

// Build track metadata index
function buildTrackIndex(track, sonicDna) {
  const dna = sonicDna || {}
  const comprehensive = dna.comprehensive || {}
  
  // Extract values from multiple possible locations
  const bpm = track.bpm || dna.technical?.bpm || comprehensive.technical?.bpm
  const keySignature = track.key_signature || dna.technical?.key?.key || dna.harmony?.keySignature || comprehensive.harmony?.keySignature
  const genres = dna.genres?.primaryGenres || comprehensive.genres?.primaryGenres || dna.genres?.primary || []
  const energy = track.energy_level || dna.technical?.energyLevel || comprehensive.technical?.energyLevel
  const danceability = track.danceability || dna.technical?.danceability || comprehensive.technical?.danceability
  
  return {
    // Boolean flags for fast filtering
    has_bpm: !!bpm,
    has_key: !!(keySignature && keySignature !== 'Unknown'),
    has_sonic_dna: !!(dna && Object.keys(dna).length > 3),
    has_waveform: !!track.waveform,
    has_artwork: !!(track.artwork_url || track.artwork),
    has_energy: energy != null,
    has_danceability: danceability != null,
    has_description: !!(dna.description || comprehensive.description),
    has_intention: !!(dna.intention || comprehensive.intention),
    has_emotional: !!(dna.emotional?.primaryEmotions?.length > 0),
    is_linked: !!track.audio_file_id,
    
    // Key data for display
    primary_genre: genres[0] || null,
    genres: genres.slice(0, 5),
    camelot: keySignature && keySignature !== 'Unknown' ? keySignature : null,
    
    // Source info
    indexed_at: new Date().toISOString(),
  }
}

// Consolidate Sonic DNA from all sources
function consolidateSonicDna(audioFileDna) {
  if (!audioFileDna) return null
  
  const comprehensive = audioFileDna.comprehensive || {}
  
  // Build a unified structure with data from all sources
  return {
    // Top-level fields (preferred by frontend)
    description: audioFileDna.description || comprehensive.description || '',
    intention: audioFileDna.intention || comprehensive.intention || '',
    summary: audioFileDna.summary || comprehensive.summary || '',
    
    // Emotional (merged)
    emotional: {
      primaryEmotions: audioFileDna.emotional?.primaryEmotions?.length > 0 
        ? audioFileDna.emotional.primaryEmotions 
        : comprehensive.emotional?.primaryEmotions || [],
      emotionalJourney: audioFileDna.emotional?.emotionalJourney || comprehensive.emotional?.emotionalJourney || '',
      psychologicalProfile: audioFileDna.emotional?.psychologicalProfile || comprehensive.emotional?.psychologicalProfile || '',
      moodTransitions: audioFileDna.emotional?.moodTransitions || [],
    },
    
    // Musical (merged)
    musical: {
      keySignature: audioFileDna.harmony?.keySignature || audioFileDna.technical?.key?.key || comprehensive.harmony?.keySignature || 'Unknown',
      timeSignature: audioFileDna.harmony?.timeSignature || audioFileDna.technical?.timeSignature || comprehensive.technical?.timeSignature || '4/4',
      scale: audioFileDna.harmony?.scale || audioFileDna.technical?.key?.scale || comprehensive.harmony?.scale || '',
      harmonicComplexity: audioFileDna.harmony?.harmonicComplexity || comprehensive.harmony?.harmonicComplexity || '',
      rhythmicPatterns: audioFileDna.drums?.patternType || comprehensive.drums?.patternType || '',
      instrumentation: audioFileDna.musical?.instrumentation || [],
      productionTechniques: audioFileDna.musicology?.production?.techniques || [],
      musicalInfluences: audioFileDna.musicology?.style?.stylisticInfluences || [],
    },
    
    // Genres (merged)
    genres: {
      primaryGenres: audioFileDna.genres?.primaryGenres || audioFileDna.genres?.primary || comprehensive.genres?.primaryGenres || [],
      subgenres: audioFileDna.genres?.subgenres || comprehensive.genres?.subgenres || [],
      genreFusion: audioFileDna.genres?.fusion || comprehensive.genres?.fusion || '',
      genreEvolution: audioFileDna.genres?.genreEvolution || '',
    },
    
    // Historical (merged from musicology)
    historical: {
      eraInfluences: audioFileDna.musicology?.era?.eraInfluences || comprehensive.historical?.eraInfluences || [],
      historicalContext: audioFileDna.musicology?.era?.historicalPeriod || comprehensive.historical?.historicalContext || '',
      evolutionFrom: audioFileDna.historical?.evolutionFrom || [],
      innovationPoints: audioFileDna.historical?.innovationPoints || [],
    },
    
    // Regional (merged from cultural)
    regional: {
      primaryRegions: audioFileDna.cultural?.regions || comprehensive.cultural?.regions || [],
      culturalInfluences: audioFileDna.cultural?.culturalInfluences || comprehensive.cultural?.culturalInfluences || [],
      regionalCharacteristics: audioFileDna.cultural?.regionalCharacteristics || comprehensive.cultural?.regionalCharacteristics || '',
      crossCulturalElements: audioFileDna.cultural?.crossCulturalElements || [],
    },
    
    // Technical (merged)
    technical: {
      bpm: audioFileDna.technical?.bpm || comprehensive.technical?.bpm,
      energyLevel: audioFileDna.technical?.energyLevel || comprehensive.technical?.energyLevel,
      danceability: audioFileDna.technical?.danceability || comprehensive.technical?.danceability,
      key: audioFileDna.technical?.key || audioFileDna.harmony || comprehensive.technical?.key,
      timeSignature: audioFileDna.technical?.timeSignature || comprehensive.technical?.timeSignature || '4/4',
    },
    
    // Drums (direct copy)
    drums: audioFileDna.drums || comprehensive.drums || {},
    
    // Musicology (direct copy)
    musicology: audioFileDna.musicology || comprehensive.musicology || {},
    
    // Cultural (direct copy)
    cultural: audioFileDna.cultural || comprehensive.cultural || {},
    
    // Keep comprehensive for backward compatibility
    comprehensive: comprehensive,
    
    // Metadata
    _consolidated: true,
    _consolidatedAt: new Date().toISOString(),
  }
}

async function main() {
  console.log('\n🔄 SONIC DNA SYSTEM CONSOLIDATION')
  console.log('═'.repeat(70))
  
  const stats = {
    audioFilesProcessed: 0,
    tracksUpdated: 0,
    tracksLinked: 0,
    cacheEntriesUpdated: 0,
    indexesBuilt: 0,
    errors: 0,
  }
  
  // ============================================
  // STEP 1: Get all audio files with Sonic DNA
  // ============================================
  console.log('\n📊 Step 1: Fetching audio files with Sonic DNA...')
  
  const { data: audioFiles, error: audioError } = await supabase
    .from('audio_files')
    .select('id, title, artist, file_path, file_url, sonic_dna, sonic_dna_status, bpm, key_signature, energy_level, danceability, artwork_url, waveform_data')
    .eq('sonic_dna_status', 'completed')
  
  if (audioError) {
    console.error('Error fetching audio files:', audioError)
    return
  }
  
  console.log(`   Found ${audioFiles.length} audio files with completed Sonic DNA`)
  stats.audioFilesProcessed = audioFiles.length
  
  // ============================================
  // STEP 2: Get all music library tracks
  // ============================================
  console.log('\n📊 Step 2: Fetching music library tracks...')
  
  const { data: tracks, error: tracksError } = await supabase
    .from('music_library_tracks')
    .select('id, title, artist, audio_file_id, sonic_dna, metadata, bpm, key_signature, energy_level, danceability, artwork_url, waveform')
  
  if (tracksError) {
    console.error('Error fetching tracks:', tracksError)
    return
  }
  
  console.log(`   Found ${tracks.length} music library tracks`)
  
  // Create lookup map for audio files
  const audioFileMap = new Map()
  for (const af of audioFiles) {
    audioFileMap.set(af.id, af)
    // Also index by title for fuzzy matching
    const normalizedTitle = af.title?.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normalizedTitle) {
      audioFileMap.set(`title:${normalizedTitle}`, af)
    }
  }
  
  // ============================================
  // STEP 3: Consolidate and sync to music_library_tracks
  // ============================================
  console.log('\n🔄 Step 3: Consolidating and syncing to music_library_tracks...')
  
  const batchSize = 50
  const updates = []
  
  for (const track of tracks) {
    // Find matching audio file
    let audioFile = null
    
    if (track.audio_file_id) {
      audioFile = audioFileMap.get(track.audio_file_id)
    }
    
    // Try title match if no direct link
    if (!audioFile && track.title) {
      const normalizedTitle = track.title?.toLowerCase().replace(/[^a-z0-9]/g, '')
      audioFile = audioFileMap.get(`title:${normalizedTitle}`)
    }
    
    if (audioFile && audioFile.sonic_dna) {
      // Consolidate Sonic DNA
      const consolidatedDna = consolidateSonicDna(audioFile.sonic_dna)
      
      // Build metadata index
      const trackWithFields = {
        ...track,
        bpm: track.bpm || audioFile.bpm,
        key_signature: track.key_signature || audioFile.key_signature,
        energy_level: track.energy_level ?? audioFile.energy_level,
        danceability: track.danceability ?? audioFile.danceability,
        artwork_url: track.artwork_url || audioFile.artwork_url,
        waveform: track.waveform || (audioFile.waveform_data ? true : false),
        audio_file_id: track.audio_file_id || audioFile.id,
      }
      
      const metadataIndex = buildTrackIndex(trackWithFields, consolidatedDna)
      
      // Merge with existing metadata
      const updatedMetadata = deepMerge(track.metadata || {}, metadataIndex)
      
      updates.push({
        id: track.id,
        sonic_dna: consolidatedDna,
        metadata: updatedMetadata,
        bpm: trackWithFields.bpm,
        key_signature: trackWithFields.key_signature,
        energy_level: trackWithFields.energy_level,
        danceability: trackWithFields.danceability,
        artwork_url: trackWithFields.artwork_url,
        audio_file_id: trackWithFields.audio_file_id,
      })
      
      stats.tracksLinked++
    }
  }
  
  console.log(`   Prepared ${updates.length} track updates`)
  
  // Process updates in batches
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    process.stdout.write(`   Updating batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(updates.length/batchSize)}...`)
    
    for (const update of batch) {
      const { error } = await supabase
        .from('music_library_tracks')
        .update({
          sonic_dna: update.sonic_dna,
          metadata: update.metadata,
          bpm: update.bpm,
          key_signature: update.key_signature,
          energy_level: update.energy_level,
          danceability: update.danceability,
          artwork_url: update.artwork_url,
          audio_file_id: update.audio_file_id,
        })
        .eq('id', update.id)
      
      if (error) {
        stats.errors++
      } else {
        stats.tracksUpdated++
        stats.indexesBuilt++
      }
    }
    
    console.log(' ✅')
  }
  
  // ============================================
  // STEP 4: Update sonic_dna_cache
  // ============================================
  console.log('\n📦 Step 4: Updating sonic_dna_cache...')
  
  // Check if sonic_dna_cache table exists
  const { data: cacheTable, error: cacheError } = await supabase
    .from('sonic_dna_cache')
    .select('id')
    .limit(1)
  
  if (!cacheError) {
    for (const af of audioFiles.slice(0, 100)) { // Limit to 100 for cache
      if (!af.sonic_dna) continue
      
      const consolidatedDna = consolidateSonicDna(af.sonic_dna)
      
      const { error: upsertError } = await supabase
        .from('sonic_dna_cache')
        .upsert({
          audio_file_id: af.id,
          sonic_dna: consolidatedDna,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'audio_file_id'
        })
      
      if (!upsertError) {
        stats.cacheEntriesUpdated++
      }
    }
    console.log(`   Updated ${stats.cacheEntriesUpdated} cache entries`)
  } else {
    console.log('   sonic_dna_cache table not found, skipping...')
  }
  
  // ============================================
  // STEP 5: Validate and report
  // ============================================
  console.log('\n✅ Step 5: Validation and Summary')
  console.log('═'.repeat(70))
  
  // Get final counts
  const { data: finalTracks } = await supabase
    .from('music_library_tracks')
    .select('id, sonic_dna, metadata, audio_file_id')
  
  let withConsolidatedDna = 0
  let withIndex = 0
  let withDescription = 0
  
  for (const t of finalTracks || []) {
    if (t.sonic_dna?._consolidated) withConsolidatedDna++
    if (t.metadata?.indexed_at) withIndex++
    if (t.sonic_dna?.description) withDescription++
  }
  
  console.log('\n📊 CONSOLIDATION RESULTS:')
  console.log('─'.repeat(50))
  console.log(`   Audio files processed:     ${stats.audioFilesProcessed}`)
  console.log(`   Tracks updated:            ${stats.tracksUpdated}`)
  console.log(`   Tracks linked:             ${stats.tracksLinked}`)
  console.log(`   Indexes built:             ${stats.indexesBuilt}`)
  console.log(`   Cache entries updated:     ${stats.cacheEntriesUpdated}`)
  console.log(`   Errors:                    ${stats.errors}`)
  console.log('')
  console.log(`   Tracks with consolidated DNA: ${withConsolidatedDna}`)
  console.log(`   Tracks with metadata index:   ${withIndex}`)
  console.log(`   Tracks with descriptions:     ${withDescription}`)
  console.log('')
  console.log('✅ Consolidation complete!')
  console.log('═'.repeat(70))
}

main().catch(console.error)
