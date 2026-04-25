#!/usr/bin/env node

/**
 * Generate Sonic DNA using template-based approach
 * Creates comprehensive Sonic DNA based on audio features and metadata
 * This can be enhanced with AI later, but provides immediate value
 * 
 * Run with: node scripts/generate-sonic-dna-template.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { join } from 'path'

// Load environment variables
dotenv.config({ path: join(process.cwd(), '.env.local') })

// ============================================================================
// SUPABASE SETUP
// ============================================================================

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// ============================================================================
// TEMPLATE-BASED SONIC DNA GENERATION
// ============================================================================

function generateSonicDNAFromFeatures(track) {
  const bpm = track.bpm || 120
  const energy = track.energy_level || 5
  const danceability = track.danceability || 5
  const rhythm = track.metadata?.rhythmAnalysis
  const emotional = track.metadata?.emotionalProfile
  const musical = track.metadata?.musicalIntelligence

  // Determine primary emotions based on BPM and energy
  const primaryEmotions = determineEmotions(bpm, energy)
  
  // Determine genres based on BPM and characteristics
  const genres = determineGenres(bpm, energy, track.title)
  
  // Create comprehensive Sonic DNA
  return {
    emotional: {
      primaryEmotions,
      emotionalJourney: emotional?.primaryEmotion 
        ? `The track takes listeners on a ${emotional.primaryEmotion} journey, with intensity levels reaching ${emotional.intensity}/10. ${emotional.psychologicalProfile?.arousal ? `Psychological arousal: ${emotional.psychologicalProfile.arousal}/10.` : ''}`
        : `A ${primaryEmotions[0]} experience that evolves throughout the track`,
      psychologicalProfile: emotional?.psychologicalProfile 
        ? `Arousal: ${emotional.psychologicalProfile.arousal}/10, Valence: ${emotional.psychologicalProfile.valence}/10, Complexity: ${emotional.psychologicalProfile.complexity}/10`
        : `Moderate psychological impact with ${energy >= 7 ? 'high' : energy >= 4 ? 'moderate' : 'subtle'} arousal`,
      moodTransitions: []
    },
    musical: {
      keySignature: track.key_signature || 'Unknown',
      timeSignature: '4/4',
      harmonicComplexity: musical?.harmonicContent 
        ? `Bass presence: ${musical.harmonicContent.bassPresence}/10, Mid: ${musical.harmonicContent.midPresence}/10, High: ${musical.harmonicContent.highPresence}/10`
        : 'Moderate harmonic complexity with balanced frequency distribution',
      rhythmicPatterns: rhythm?.feel 
        ? `${rhythm.feel} rhythmic feel with ${rhythm.regularity}/10 regularity and ${rhythm.groove}/10 groove. ${rhythm.syncopation} syncopation.`
        : musical?.description || 'Driving rhythmic patterns with steady pulse',
      instrumentation: extractInstrumentation(track),
      productionTechniques: determineProductionTechniques(energy, bpm),
      musicalInfluences: determineInfluences(genres.primaryGenres)
    },
    historical: {
      eraInfluences: determineEraInfluences(bpm, genres.primaryGenres),
      historicalContext: `This track reflects ${genres.primaryGenres[0] || 'electronic'} music traditions, evolving from ${determineEvolution(genres.primaryGenres)}`,
      evolutionFrom: determineEvolution(genres.primaryGenres),
      innovationPoints: determineInnovations(bpm, energy, rhythm)
    },
    regional: {
      primaryRegions: ['Global', 'Electronic Music Scene'],
      culturalInfluences: genres.primaryGenres,
      regionalCharacteristics: 'Contemporary electronic music with global appeal',
      crossCulturalElements: genres.primaryGenres.length > 1 ? genres.primaryGenres : []
    },
    genres: {
      primaryGenres: genres.primaryGenres,
      subgenres: genres.subgenres,
      genreFusion: genres.primaryGenres.length > 1 
        ? `A fusion of ${genres.primaryGenres.join(' and ')} creating a unique hybrid sound`
        : `Pure ${genres.primaryGenres[0]} expression`,
      genreEvolution: `Evolving from traditional ${genres.primaryGenres[0] || 'electronic'} roots with modern production techniques`
    },
    technical: {
      bpm,
      energyLevel: energy,
      danceability,
      frequencyBands: track.frequency_bands || {}
    },
    summary: generateSummary(track, primaryEmotions, genres, bpm, energy)
  }
}

function determineEmotions(bpm, energy) {
  const emotions = []
  
  if (bpm < 80 && energy < 4) {
    emotions.push('melancholic', 'contemplative', 'introspective')
  } else if (bpm < 80 && energy >= 4) {
    emotions.push('contemplative', 'peaceful', 'reflective')
  } else if (bpm < 110 && energy < 6) {
    emotions.push('calm', 'relaxed', 'serene')
  } else if (bpm < 110 && energy >= 6) {
    emotions.push('uplifting', 'positive', 'energetic')
  } else if (bpm < 140 && energy < 7) {
    emotions.push('energetic', 'driving', 'motivated')
  } else if (bpm < 140 && energy >= 7) {
    emotions.push('euphoric', 'exhilarating', 'ecstatic')
  } else {
    emotions.push('intense', 'powerful', 'overwhelming')
  }
  
  return emotions.slice(0, 3)
}

function determineGenres(bpm, energy, title) {
  const titleLower = title.toLowerCase()
  const genres = []
  const subgenres = []
  
  // Check title for genre hints
  if (titleLower.includes('house') || titleLower.includes('deep')) {
    genres.push('House')
    subgenres.push('Deep House')
  }
  if (titleLower.includes('techno')) {
    genres.push('Techno')
  }
  if (titleLower.includes('dub') || titleLower.includes('reggae')) {
    genres.push('Dub', 'Reggae')
  }
  if (titleLower.includes('trap')) {
    genres.push('Hip-Hop')
    subgenres.push('Trap')
  }
  if (titleLower.includes('bass')) {
    subgenres.push('Bass Music')
  }
  
  // Determine by BPM
  if (genres.length === 0) {
    if (bpm >= 120 && bpm <= 130) {
      genres.push('House')
      subgenres.push('Progressive House')
    } else if (bpm >= 128 && bpm <= 140) {
      genres.push('Techno', 'House')
    } else if (bpm >= 140 && bpm <= 160) {
      genres.push('Drum & Bass', 'Dubstep')
    } else if (bpm >= 90 && bpm < 120) {
      genres.push('Hip-Hop', 'R&B')
    } else {
      genres.push('Electronic', 'Dance')
    }
  }
  
  return { primaryGenres: genres.slice(0, 3), subgenres }
}

function extractInstrumentation(track) {
  const instruments = ['Synthesizers', 'Drum Machine', 'Bass']
  
  if (track.frequency_bands?.hihats > 0.5) {
    instruments.push('Hi-Hats', 'Percussion')
  }
  if (track.frequency_bands?.kicks > 0.5) {
    instruments.push('Kick Drum', 'Low-End')
  }
  
  return instruments
}

function determineProductionTechniques(energy, bpm) {
  const techniques = []
  
  if (energy >= 7) {
    techniques.push('Heavy Compression', 'Sidechain Compression')
  }
  if (bpm >= 120) {
    techniques.push('Four-on-the-Floor', 'Syncopated Rhythms')
  }
  techniques.push('Layering', 'Frequency Separation', 'Dynamic Processing')
  
  return techniques
}

function determineInfluences(genres) {
  const influences = []
  
  if (genres.includes('House')) {
    influences.push('Classic House Music', 'Chicago House', 'Detroit Techno')
  }
  if (genres.includes('Techno')) {
    influences.push('Berlin Techno', 'Detroit Techno', 'Industrial Music')
  }
  if (genres.includes('Dub')) {
    influences.push('Jamaican Dub', 'Reggae', 'Sound System Culture')
  }
  
  return influences.length > 0 ? influences : ['Electronic Music Pioneers', 'Contemporary Producers']
}

function determineEraInfluences(bpm, genres) {
  const eras = []
  
  if (genres.includes('House') || genres.includes('Techno')) {
    eras.push('1980s House', '1990s Techno', '2000s Progressive')
  }
  if (bpm >= 140) {
    eras.push('2010s EDM', 'Modern Bass Music')
  }
  
  return eras.length > 0 ? eras : ['Contemporary Electronic Music']
}

function determineEvolution(genres) {
  if (genres.includes('House')) {
    return 'classic disco and funk roots'
  }
  if (genres.includes('Techno')) {
    return 'industrial and electronic experimentation'
  }
  if (genres.includes('Dub')) {
    return 'Jamaican sound system culture'
  }
  return 'electronic music traditions'
}

function determineInnovations(bpm, energy, rhythm) {
  const innovations = []
  
  if (rhythm?.syncopation === 'high') {
    innovations.push('Complex syncopation patterns')
  }
  if (energy >= 8) {
    innovations.push('High-energy production techniques')
  }
  if (bpm >= 140) {
    innovations.push('Fast-paced rhythmic structures')
  }
  
  return innovations.length > 0 ? innovations : ['Modern production aesthetics']
}

function generateSummary(track, emotions, genres, bpm, energy) {
  return `${track.title} by ${track.artist} is a ${genres.primaryGenres[0] || 'electronic'} track that evokes ${emotions[0]} and ${emotions[1]} emotions. With a tempo of ${bpm} BPM and energy level of ${energy}/10, this track delivers ${energy >= 7 ? 'high-intensity' : energy >= 4 ? 'moderate' : 'subtle'} musical experience. The ${genres.primaryGenres.length > 1 ? 'fusion of ' + genres.primaryGenres.join(' and ') : genres.primaryGenres[0]} creates a unique sonic identity that reflects contemporary electronic music production.`
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processTrack(track, supabase, stats, index, total) {
  try {
    // Skip if already completed
    if (track.sonic_dna_status === 'completed' && track.sonic_dna) {
      stats.skipped++
      process.stdout.write(`\r   ⏭️  [${index + 1}/${total}] ${track.title} - Already has Sonic DNA`)
      return
    }

    process.stdout.write(`\r   🔍 [${index + 1}/${total}] ${track.title} - Generating Sonic DNA...`)

    // Mark as processing
    await supabase
      .from('audio_files')
      .update({ sonic_dna_status: 'processing' })
      .eq('id', track.id)

    // Generate Sonic DNA from features
    const sonicDNA = generateSonicDNAFromFeatures(track)

    // Update database
    await supabase
      .from('audio_files')
      .update({
        sonic_dna: sonicDNA,
        sonic_dna_status: 'completed',
        sonic_dna_analyzed_at: new Date().toISOString(),
        ai_analysis: sonicDNA,
        sonic_dna_error: null
      })
      .eq('id', track.id)

    stats.completed++
    process.stdout.write(`\r   ✅ [${index + 1}/${total}] ${track.title} - Sonic DNA generated\n`)

  } catch (error) {
    stats.errors++
    process.stdout.write(`\r   ❌ [${index + 1}/${total}] ${track.title} - Error: ${error.message}\n`)
    
    await supabase
      .from('audio_files')
      .update({
        sonic_dna_status: 'failed',
        sonic_dna_error: error.message
      })
      .eq('id', track.id)
  }
}

async function main() {
  console.log('🧬 Template-Based Sonic DNA Generation\n')
  console.log('='.repeat(60))

  const supabase = createSupabaseClient()
  console.log('✅ Connected to Supabase\n')

  // Fetch all tracks
  console.log('📥 Fetching tracks from database...')
  const { data: tracks, error } = await supabase
    .from('audio_files')
    .select('*')
    .eq('analysis_status', 'completed')
    .order('title', { ascending: true })

  if (error) {
    console.error(`❌ Error: ${error.message}`)
    process.exit(1)
  }

  if (!tracks || tracks.length === 0) {
    console.log('⚠️  No tracks found.')
    process.exit(0)
  }

  console.log(`✅ Found ${tracks.length} tracks\n`)

  const stats = {
    total: tracks.length,
    completed: 0,
    skipped: 0,
    errors: 0
  }

  console.log('📦 Processing tracks...\n')

  for (let i = 0; i < tracks.length; i++) {
    await processTrack(tracks[i], supabase, stats, i, tracks.length)
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 Sonic DNA Generation Complete!\n')
  console.log(`   Total tracks: ${stats.total}`)
  console.log(`   ✅ Generated: ${stats.completed}`)
  console.log(`   ⏭️  Skipped: ${stats.skipped}`)
  console.log(`   ❌ Errors: ${stats.errors}`)
  console.log('\n🧬 All Sonic DNA data stored in Supabase!')
  console.log('💡 Note: This uses template-based generation. For AI-enhanced analysis,')
  console.log('   run: node scripts/generate-sonic-dna-all.mjs (requires API credits)')
  console.log('='.repeat(60) + '\n')
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})

