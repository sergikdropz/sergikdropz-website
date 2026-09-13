#!/usr/bin/env node
/**
 * Fix Sonic DNA Data Script
 * 
 * This script:
 * 1. Finds all tracks with placeholder sonic_dna (just status metadata)
 * 2. Updates them with real sonic_dna data from audio_files where available
 * 3. For tracks without audio_file data, creates structured sonic_dna from available metadata
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
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Check if sonic_dna is just placeholder/status metadata
 */
function isPlaceholderDna(sonicDna) {
  if (!sonicDna) return true
  const keys = Object.keys(sonicDna)
  
  // Real sonic_dna should have sections like genres, technical, drums, etc.
  const realKeys = ['genres', 'technical', 'drums', 'harmony', 'cultural', 'emotional', 'musical', 'musicology']
  const hasRealData = realKeys.some(key => sonicDna[key] && Object.keys(sonicDna[key]).length > 0)
  
  // If it only has status/metadata fields, it's a placeholder
  const onlyHasMetadata = keys.every(k => ['status', 'hasData', 'analyzedAt', '_metadata', 'waveform'].includes(k))
  
  return !hasRealData || onlyHasMetadata
}

/**
 * Create a structured sonic_dna from track metadata
 */
function createSonicDnaFromMetadata(track, audioFile) {
  const bpm = audioFile?.bpm || track.bpm || null
  const keySignature = audioFile?.key_signature || track.key_signature || 'Unknown'
  const energyLevel = audioFile?.energy_level || track.energy_level || null
  const danceability = audioFile?.danceability || track.danceability || null
  
  return {
    drums: {
      timing: { groove: 'straight', swingAmount: 0, syncopation: 0 },
      pattern: {
        complexity: 'moderate',
        kickPattern: 'varied',
        patternType: 'other',
        hihatPattern: 'varied',
        snarePattern: 'varied'
      },
      frequency: { kickFrequency: 60, hihatFrequency: 8000, snareFrequency: 200 },
      complexity: 'moderate',
      genreStyles: ['Electronic'],
      kickPattern: 'varied',
      patternType: 'other',
      hihatPattern: 'varied',
      snarePattern: 'varied',
      patternRecognition: null
    },
    genres: {
      fusion: null,
      primary: [],
      genreTags: [],
      secondary: [],
      subgenres: [],
      confidence: 0,
      microgenres: [],
      primaryGenres: []
    },
    harmony: {
      scale: 'major',
      tonality: 'major',
      chordTypes: [],
      keySignature: keySignature,
      timeSignature: '4/4',
      chordProgression: [],
      harmonicComplexity: 'moderate',
      technicalDescription: null
    },
    cultural: {
      regions: [],
      culturalInfluences: [],
      crossCulturalElements: [],
      regionalCharacteristics: 'Unknown origin'
    },
    emotional: {
      primaryEmotions: [],
      emotionalJourney: null,
      psychologicalProfile: null,
      moodTransitions: []
    },
    technical: {
      bpm: bpm,
      key: { key: keySignature, mode: null, confidence: 0 },
      scale: 'major',
      tempo: { bpm: bpm, swing: false, tempoClass: bpm ? (bpm < 100 ? 'slow' : bpm < 130 ? 'medium' : 'fast') : null },
      energy: { level: energyLevel, peakEnergy: 0, dynamicRange: 0 },
      valence: 0.5,
      liveness: 0,
      tonality: 'major',
      energyLevel: energyLevel,
      speechiness: 0,
      acousticness: 0,
      danceability: danceability,
      keySignature: keySignature,
      timeSignature: '4/4'
    },
    musical: {
      keySignature: keySignature,
      timeSignature: '4/4',
      scale: 'major',
      harmonicComplexity: 'moderate',
      rhythmicPatterns: null,
      instrumentation: [],
      productionTechniques: [],
      musicalInfluences: []
    },
    musicology: {
      description: null,
      era: { decade: null, description: null },
      style: { primaryStyle: null, description: null },
      production: { techniques: [], description: null }
    },
    _metadata: {
      processedAt: new Date().toISOString(),
      agentVersion: 'metadata-generated',
      qualityScore: 30, // Low score since it's generated from basic metadata
      source: 'metadata-fallback'
    },
    description: null,
    intention: null,
    summary: null
  }
}

async function main() {
  console.log('🔧 Fixing Sonic DNA data...\n')
  
  // Step 1: Get all audio files with REAL sonic_dna
  console.log('Step 1: Fetching audio files with real Sonic DNA...')
  const { data: audioFiles, error: audioError } = await supabase
    .from('audio_files')
    .select('id, file_path, file_url, title, sonic_dna, bpm, key_signature, energy_level, danceability')
    .not('sonic_dna', 'is', null)
  
  if (audioError) {
    console.error('Error fetching audio files:', audioError.message)
    process.exit(1)
  }
  
  // Filter to only those with REAL sonic_dna data (not just status)
  const audioFilesWithRealDna = audioFiles?.filter(af => !isPlaceholderDna(af.sonic_dna)) || []
  console.log(`   Found ${audioFilesWithRealDna.length} audio files with REAL Sonic DNA\n`)
  
  // Create lookup maps
  const audioFileById = new Map()
  audioFilesWithRealDna.forEach(af => {
    audioFileById.set(af.id, af)
  })
  
  // Step 2: Get all tracks
  console.log('Step 2: Fetching all tracks...')
  const { data: tracks, error: tracksError } = await supabase
    .from('music_library_tracks')
    .select('id, title, audio_file_id, file_url, sonic_dna, bpm, key_signature, energy_level, danceability')
  
  if (tracksError) {
    console.error('Error fetching tracks:', tracksError.message)
    process.exit(1)
  }
  
  console.log(`   Found ${tracks?.length || 0} tracks\n`)
  
  // Step 3: Process tracks
  console.log('Step 3: Processing tracks...\n')
  
  const stats = {
    total: tracks?.length || 0,
    alreadyComplete: 0,
    updatedFromAudioFile: 0,
    generatedFromMetadata: 0,
    errors: 0
  }
  
  for (const track of (tracks || [])) {
    // Check if track already has real sonic_dna
    if (!isPlaceholderDna(track.sonic_dna)) {
      stats.alreadyComplete++
      continue
    }
    
    // Try to get real sonic_dna from linked audio_file
    let newSonicDna = null
    let source = null
    
    if (track.audio_file_id) {
      const audioFile = audioFileById.get(track.audio_file_id)
      if (audioFile && !isPlaceholderDna(audioFile.sonic_dna)) {
        newSonicDna = audioFile.sonic_dna
        source = 'audio_file'
      }
    }
    
    // If no real sonic_dna from audio_file, create from metadata
    if (!newSonicDna) {
      // Get audio_file metadata even if it doesn't have real sonic_dna
      let audioFile = null
      if (track.audio_file_id) {
        const { data: af } = await supabase
          .from('audio_files')
          .select('bpm, key_signature, energy_level, danceability')
          .eq('id', track.audio_file_id)
          .single()
        audioFile = af
      }
      
      newSonicDna = createSonicDnaFromMetadata(track, audioFile)
      source = 'metadata'
    }
    
    // Update track
    const { error: updateError } = await supabase
      .from('music_library_tracks')
      .update({ sonic_dna: newSonicDna })
      .eq('id', track.id)
    
    if (updateError) {
      console.error(`   Error updating track "${track.title}":`, updateError.message)
      stats.errors++
    } else {
      if (source === 'audio_file') {
        stats.updatedFromAudioFile++
      } else {
        stats.generatedFromMetadata++
      }
      process.stdout.write('.')
    }
  }
  
  console.log('\n')
  
  // Summary
  console.log('=' .repeat(60))
  console.log('📊 FIX SUMMARY')
  console.log('=' .repeat(60))
  console.log(`Total tracks:                ${stats.total}`)
  console.log(`Already complete:            ${stats.alreadyComplete}`)
  console.log(`Updated from audio_file:     ${stats.updatedFromAudioFile}`)
  console.log(`Generated from metadata:     ${stats.generatedFromMetadata}`)
  console.log(`Errors:                      ${stats.errors}`)
  console.log('=' .repeat(60))
  
  console.log('\n✅ Fix complete!')
  console.log('\nNote: Tracks with "generated from metadata" have basic Sonic DNA structure.')
  console.log('For full AI-powered analysis, run: POST /api/audio/analyze-all-sonic-dna?force=true')
}

main().catch(console.error)
