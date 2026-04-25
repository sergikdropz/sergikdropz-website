#!/usr/bin/env node
/**
 * Comprehensive Sonic DNA Sync Script
 * 
 * This script syncs ALL Sonic DNA data from audio_files to music_library_tracks,
 * ensuring all fields are properly populated for the track editor.
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
  console.error('Missing Supabase credentials. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Complete Sonic DNA schema with all expected fields (v2.1 Enhanced)
const SONIC_DNA_SCHEMA = {
  drums: {
    timing: { groove: null, swingAmount: 0, syncopation: 0, type: null, confidence: 0, indicators: [], effectiveBpm: null },
    pattern: { complexity: null, kickPattern: null, patternType: null, hihatPattern: null, snarePattern: null },
    frequency: { kickFrequency: null, hihatFrequency: null, snareFrequency: null },
    complexity: null,
    genreStyles: { primary: [], secondary: [], characteristics: [], confidence: 0 },
    kickPattern: null,
    patternType: null,
    hihatPattern: null,
    snarePattern: null,
    patternRecognition: null,
    // Enhanced v2.1 fields
    kickAnalysis: { type: null, positions: [], character: [], subBass: false, sidechain: false },
    snareAnalysis: { type: null, positions: [], ghostNotes: false, rolls: false, character: [] },
    hihatAnalysis: { type: null, rhythm: null, velocity: null, openPositions: [], character: [] },
    cadence: { density: null, complexity: null, syncopation: null, groove: null, polyrhythm: false, layers: 0 },
    bassline: { type: null, character: [], slides: false, subHarmonics: false },
    signatureMatch: null
  },
  genres: {
    fusion: null,
    primary: [],
    genreTags: [],
    secondary: [],
    subgenres: [],
    confidence: 0,
    microgenres: [],
    primaryGenres: [],
    // Enhanced v2.1 fields
    subgenreClassification: { primary: null, secondary: [], confidence: 0 },
    era: null,
    origins: [],
    timingContext: null,
    productionStyle: null,
    genreCharacteristics: [],
    genreInfluences: []
  },
  // New v2.1 timing section
  timing: {
    feel: null,
    confidence: 0,
    indicators: [],
    effectiveBpm: null,
    description: null
  },
  harmony: {
    scale: null,
    tonality: null,
    chordTypes: [],
    keySignature: null,
    timeSignature: null,
    chordProgression: [],
    harmonicComplexity: null,
    technicalDescription: null
  },
  cultural: {
    regions: [],
    culturalInfluences: [],
    crossCulturalElements: [],
    regionalCharacteristics: null,
    origins: [],
    era: null
  },
  emotional: {
    primaryEmotions: [],
    emotionalJourney: null,
    psychologicalProfile: null,
    moodTransitions: []
  },
  technical: {
    bpm: null,
    key: { key: null, mode: null, confidence: 0 },
    scale: null,
    tempo: { bpm: null, swing: false, tempoClass: null },
    energy: { level: null, peakEnergy: 0, dynamicRange: 0 },
    valence: 0,
    liveness: 0,
    tonality: null,
    energyLevel: null,
    speechiness: 0,
    acousticness: 0,
    danceability: null,
    keySignature: null,
    timeSignature: null,
    // Enhanced v2.1 fields
    timingFeel: null,
    effectiveBpm: null,
    timingConfidence: 0
  },
  musical: {
    keySignature: null,
    timeSignature: null,
    scale: null,
    harmonicComplexity: null,
    rhythmicPatterns: null,
    instrumentation: [],
    productionTechniques: [],
    musicalInfluences: []
  },
  historical: {
    eraInfluences: [],
    historicalContext: null,
    evolutionFrom: [],
    innovationPoints: []
  },
  regional: {
    primaryRegions: [],
    culturalInfluences: [],
    regionalCharacteristics: null,
    crossCulturalElements: []
  },
  musicology: {
    description: null,
    era: { decade: null, description: null },
    style: { primaryStyle: null, description: null },
    production: { techniques: [], description: null }
  },
  _metadata: {
    processedAt: null,
    agentVersion: null,
    qualityScore: null,
    // Enhanced v2.1 markers
    enhancedAnalysis: {
      hasDrumPatternAnalysis: false,
      hasSubgenreClassification: false,
      hasTimingAnalysis: false
    }
  },
  description: null,
  intention: null,
  summary: null
}

/**
 * Deep merge two objects, filling in missing fields from schema
 */
function deepMerge(target, source, schema) {
  const result = { ...target }
  
  for (const key of Object.keys(schema)) {
    if (source && source[key] !== undefined && source[key] !== null) {
      if (typeof schema[key] === 'object' && !Array.isArray(schema[key]) && schema[key] !== null) {
        result[key] = deepMerge(result[key] || {}, source[key], schema[key])
      } else {
        result[key] = source[key]
      }
    } else if (result[key] === undefined) {
      result[key] = Array.isArray(schema[key]) ? [] : schema[key]
    }
  }
  
  return result
}

/**
 * Ensure Sonic DNA has all required fields
 */
function ensureCompleteSchema(sonicDna) {
  if (!sonicDna) return null
  return deepMerge({}, sonicDna, SONIC_DNA_SCHEMA)
}

async function main() {
  console.log('🔍 Starting comprehensive Sonic DNA sync...\n')
  
  // Step 1: Get all audio_files with sonic_dna
  console.log('Step 1: Fetching audio files with Sonic DNA...')
  const { data: audioFiles, error: audioError } = await supabase
    .from('audio_files')
    .select('id, file_path, file_url, title, sonic_dna, sonic_dna_status, bpm, key_signature, energy_level, danceability')
    .not('sonic_dna', 'is', null)
  
  if (audioError) {
    console.error('Error fetching audio files:', audioError.message)
    process.exit(1)
  }
  
  console.log(`   Found ${audioFiles?.length || 0} audio files with Sonic DNA\n`)
  
  // Step 2: Get all music_library_tracks
  console.log('Step 2: Fetching all music library tracks...')
  const { data: tracks, error: tracksError } = await supabase
    .from('music_library_tracks')
    .select('id, title, audio_file_id, file_url, sonic_dna, bpm, key_signature, energy_level, danceability, metadata')
  
  if (tracksError) {
    console.error('Error fetching tracks:', tracksError.message)
    process.exit(1)
  }
  
  console.log(`   Found ${tracks?.length || 0} tracks in library\n`)
  
  // Create lookup maps
  const audioFileById = new Map()
  const audioFileByPath = new Map()
  
  audioFiles?.forEach(af => {
    audioFileById.set(af.id, af)
    // Use file_path or file_url for matching
    const pathToUse = af.file_path || af.file_url
    if (pathToUse) {
      // Normalize path for matching
      const normalizedPath = pathToUse.toLowerCase().replace(/\\/g, '/')
      audioFileByPath.set(normalizedPath, af)
      // Also add by filename only
      const filename = normalizedPath.split('/').pop()
      if (filename) {
        audioFileByPath.set(filename, af)
      }
    }
  })
  
  // Step 3: Match and update tracks
  console.log('Step 3: Matching and updating tracks...\n')
  
  const stats = {
    total: tracks?.length || 0,
    matched: 0,
    updated: 0,
    skipped: 0,
    noMatch: 0,
    errors: 0
  }
  
  const unmatchedTracks = []
  
  for (const track of (tracks || [])) {
    let audioFile = null
    
    // Try to match by audio_file_id first
    if (track.audio_file_id) {
      audioFile = audioFileById.get(track.audio_file_id)
    }
    
    // Try to match by file_url/path if no direct match
    if (!audioFile && track.file_url) {
      const normalizedUrl = track.file_url.toLowerCase().replace(/\\/g, '/')
      // Extract just the filename for matching
      const filename = normalizedUrl.split('/').pop()
      
      // Search through audio files for a path match
      for (const [path, af] of audioFileByPath.entries()) {
        if (path.includes(filename) || filename.includes(path.split('/').pop())) {
          audioFile = af
          break
        }
      }
    }
    
    if (!audioFile || !audioFile.sonic_dna) {
      stats.noMatch++
      unmatchedTracks.push({ id: track.id, title: track.title })
      continue
    }
    
    stats.matched++
    
    // Parse sonic_dna if it's a string
    let sonicDna = audioFile.sonic_dna
    if (typeof sonicDna === 'string') {
      try {
        sonicDna = JSON.parse(sonicDna)
      } catch (e) {
        console.error(`   Error parsing sonic_dna for track "${track.title}":`, e.message)
        stats.errors++
        continue
      }
    }
    
    // Ensure complete schema
    const completeSonicDna = ensureCompleteSchema(sonicDna)
    
    // Prepare updates
    const updates = {}
    let needsUpdate = false
    
    // Update sonic_dna
    const existingDna = track.sonic_dna
    const existingDnaStr = existingDna ? JSON.stringify(existingDna) : null
    const newDnaStr = JSON.stringify(completeSonicDna)
    
    if (existingDnaStr !== newDnaStr) {
      updates.sonic_dna = completeSonicDna
      needsUpdate = true
    }
    
    // Update top-level fields from sonic_dna if they exist
    if (completeSonicDna.technical) {
      if (completeSonicDna.technical.bpm && (!track.bpm || track.bpm !== completeSonicDna.technical.bpm)) {
        updates.bpm = completeSonicDna.technical.bpm
        needsUpdate = true
      }
      if (completeSonicDna.technical.keySignature && (!track.key_signature || track.key_signature !== completeSonicDna.technical.keySignature)) {
        updates.key_signature = completeSonicDna.technical.keySignature
        needsUpdate = true
      }
      if (completeSonicDna.technical.energyLevel !== null && completeSonicDna.technical.energyLevel !== undefined) {
        if (!track.energy_level || track.energy_level !== completeSonicDna.technical.energyLevel) {
          updates.energy_level = completeSonicDna.technical.energyLevel
          needsUpdate = true
        }
      }
      if (completeSonicDna.technical.danceability !== null && completeSonicDna.technical.danceability !== undefined) {
        if (!track.danceability || track.danceability !== completeSonicDna.technical.danceability) {
          updates.danceability = completeSonicDna.technical.danceability
          needsUpdate = true
        }
      }
    }
    
    // Also copy from audio_file top-level fields
    if (audioFile.bpm && (!track.bpm || track.bpm !== audioFile.bpm)) {
      updates.bpm = audioFile.bpm
      needsUpdate = true
    }
    if (audioFile.key_signature && (!track.key_signature || track.key_signature !== audioFile.key_signature)) {
      updates.key_signature = audioFile.key_signature
      needsUpdate = true
    }
    if (audioFile.energy_level !== null && audioFile.energy_level !== undefined) {
      if (!track.energy_level || track.energy_level !== audioFile.energy_level) {
        updates.energy_level = audioFile.energy_level
        needsUpdate = true
      }
    }
    if (audioFile.danceability !== null && audioFile.danceability !== undefined) {
      if (!track.danceability || track.danceability !== audioFile.danceability) {
        updates.danceability = audioFile.danceability
        needsUpdate = true
      }
    }
    
    if (!needsUpdate) {
      stats.skipped++
      continue
    }
    
    // Apply update
    const { error: updateError } = await supabase
      .from('music_library_tracks')
      .update(updates)
      .eq('id', track.id)
    
    if (updateError) {
      console.error(`   Error updating track "${track.title}":`, updateError.message)
      stats.errors++
    } else {
      stats.updated++
      process.stdout.write('.')
    }
  }
  
  console.log('\n')
  
  // Summary
  console.log('=' .repeat(60))
  console.log('📊 SYNC SUMMARY')
  console.log('=' .repeat(60))
  console.log(`Total tracks:        ${stats.total}`)
  console.log(`Matched to audio:    ${stats.matched}`)
  console.log(`Updated:             ${stats.updated}`)
  console.log(`Skipped (no change): ${stats.skipped}`)
  console.log(`No match found:      ${stats.noMatch}`)
  console.log(`Errors:              ${stats.errors}`)
  console.log('=' .repeat(60))
  
  if (unmatchedTracks.length > 0 && unmatchedTracks.length <= 20) {
    console.log('\n⚠️  Unmatched tracks:')
    unmatchedTracks.forEach(t => console.log(`   - ${t.title} (${t.id})`))
  } else if (unmatchedTracks.length > 20) {
    console.log(`\n⚠️  ${unmatchedTracks.length} tracks could not be matched to audio files with Sonic DNA`)
  }
  
  console.log('\n✅ Sync complete!')
}

main().catch(console.error)
