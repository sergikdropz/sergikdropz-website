#!/usr/bin/env node
/**
 * SERGIK AI Complete Track Enrichment
 * 
 * Uses the full SERGIK knowledge base, sonic DNA analysis, and AI together
 * to comprehensively fill ALL track metadata fields:
 * - BPM, Key, Energy, Danceability
 * - Genre, Subgenre, Drum Style
 * - Mood, Emotions, Descriptions
 * - Mixing Recommendations, Compatible Keys
 * - Production Era, Instruments, Techniques
 * - Cultural Origins, Influences
 * - SERGIK Compatibility Score
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

if (!anthropicKey) {
  console.error('Missing ANTHROPIC_API_KEY - AI features will be limited')
}

const supabase = createClient(supabaseUrl, supabaseKey)
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null

// =============================================================================
// SERGIK Knowledge Base - Artist Profile & Preferences
// =============================================================================

const SERGIK_PROFILE = {
  name: 'SERGIK',
  primaryGenres: ['House', 'Tech House', 'Deep House'],
  secondaryGenres: ['Disco', 'Funk', 'Techno'],
  bpmSweet: { min: 122, max: 128, ideal: 125 },
  keyPreferences: ['A minor', 'G minor', 'D minor', 'F minor', 'C major', 'G major'],
  energyRange: { min: 5, max: 8, ideal: 6.5 },
  productionStyle: ['Clean', 'Groovy', 'Soulful', 'Funky'],
  signatureElements: ['Rolling basslines', 'Funky percussion', 'Vocal chops', 'Warm pads'],
  influences: ['Chicago House', 'UK Garage', 'Disco', 'Funk', 'Soul'],
  mixingStyle: 'Smooth transitions with harmonic mixing',
  targetVenue: ['Clubs', 'Festivals', 'Rooftop parties', 'Beach venues'],
  audience: 'Dance music lovers who appreciate groove and soul'
}

// =============================================================================
// Comprehensive Genre Profiles
// =============================================================================

const GENRE_PROFILES = {
  house: {
    name: 'House',
    bpmRange: { min: 118, max: 132 },
    subgenres: ['Deep House', 'Classic House', 'Vocal House', 'Progressive House', 'Funky House', 'Jackin House'],
    drumPatterns: ['4-on-the-floor', 'offbeat-hat', 'clap-2-4'],
    keyTendency: 'major',
    commonKeys: ['C major', 'G major', 'A minor', 'F major'],
    energy: { min: 5, max: 8 },
    mood: ['uplifting', 'groovy', 'soulful', 'energetic'],
    instruments: ['synth pads', 'piano', 'organ', 'strings', 'brass stabs'],
    origins: 'Chicago',
    era: 'modern',
    danceability: 0.85
  },
  tech_house: {
    name: 'Tech House',
    bpmRange: { min: 122, max: 130 },
    subgenres: ['Minimal Tech', 'Groovy Tech', 'Bass House', 'Tribal Tech'],
    drumPatterns: ['rolling-16ths', '4-on-the-floor', 'syncopated'],
    keyTendency: 'minor',
    commonKeys: ['A minor', 'D minor', 'G minor', 'E minor'],
    energy: { min: 6, max: 9 },
    mood: ['driving', 'hypnotic', 'dark', 'groovy'],
    instruments: ['percussion', 'synth stabs', 'vocal chops', 'acid bass'],
    origins: 'UK/Ibiza',
    era: 'modern',
    danceability: 0.88
  },
  deep_house: {
    name: 'Deep House',
    bpmRange: { min: 118, max: 125 },
    subgenres: ['Organic House', 'Melodic House', 'Afro House', 'Soulful House'],
    drumPatterns: ['laid-back-kick', 'shuffled-hats', 'jazzy'],
    keyTendency: 'minor',
    commonKeys: ['A minor', 'D minor', 'F minor', 'C minor'],
    energy: { min: 4, max: 7 },
    mood: ['atmospheric', 'emotional', 'introspective', 'warm'],
    instruments: ['rhodes', 'warm pads', 'deep bass', 'strings', 'sax'],
    origins: 'Chicago/New York',
    era: 'timeless',
    danceability: 0.75
  },
  disco: {
    name: 'Disco',
    bpmRange: { min: 110, max: 130 },
    subgenres: ['Nu Disco', 'Disco House', 'Italo Disco', 'Space Disco'],
    drumPatterns: ['4-on-the-floor', 'hi-hat-disco', 'string-stabs'],
    keyTendency: 'major',
    commonKeys: ['C major', 'G major', 'D major', 'A major'],
    energy: { min: 6, max: 9 },
    mood: ['euphoric', 'funky', 'celebratory', 'glamorous'],
    instruments: ['strings', 'brass', 'guitar', 'bass guitar', 'piano'],
    origins: 'New York',
    era: 'vintage/modern',
    danceability: 0.9
  },
  techno: {
    name: 'Techno',
    bpmRange: { min: 125, max: 145 },
    subgenres: ['Minimal Techno', 'Industrial', 'Melodic Techno', 'Hard Techno'],
    drumPatterns: ['industrial-kick', 'minimal-hat', 'rolling-percussion'],
    keyTendency: 'minor',
    commonKeys: ['A minor', 'D minor', 'E minor', 'B minor'],
    energy: { min: 7, max: 10 },
    mood: ['dark', 'intense', 'hypnotic', 'industrial'],
    instruments: ['analog synths', 'industrial sounds', 'modular', 'effects'],
    origins: 'Detroit',
    era: 'modern',
    danceability: 0.82
  },
  trap: {
    name: 'Trap',
    bpmRange: { min: 130, max: 170 },
    subgenres: ['Festival Trap', 'Chill Trap', 'Hybrid Trap', 'Wave'],
    drumPatterns: ['trap-808s', 'hi-hat-rolls', 'snare-rolls'],
    keyTendency: 'minor',
    commonKeys: ['D minor', 'G minor', 'A minor', 'C minor'],
    energy: { min: 6, max: 10 },
    mood: ['aggressive', 'heavy', 'dark', 'energetic'],
    instruments: ['808 bass', 'hi-hat rolls', 'synth leads', 'brass'],
    origins: 'Atlanta',
    era: 'modern',
    danceability: 0.78
  },
  dnb: {
    name: 'Drum & Bass',
    bpmRange: { min: 160, max: 180 },
    subgenres: ['Liquid', 'Jump Up', 'Neurofunk', 'Jungle'],
    drumPatterns: ['breakbeat', 'amen-break', 'two-step'],
    keyTendency: 'minor',
    commonKeys: ['D minor', 'G minor', 'A minor', 'F minor'],
    energy: { min: 7, max: 10 },
    mood: ['energetic', 'complex', 'technical', 'atmospheric'],
    instruments: ['reese bass', 'amens', 'pads', 'vocals'],
    origins: 'UK',
    era: 'modern',
    danceability: 0.85
  },
  hiphop: {
    name: 'Hip-Hop',
    bpmRange: { min: 70, max: 115 },
    subgenres: ['Boom Bap', 'Trap Rap', 'Lo-Fi', 'Conscious'],
    drumPatterns: ['boom-bap', 'trap-pattern', 'sampled-breaks'],
    keyTendency: 'minor',
    commonKeys: ['D minor', 'A minor', 'G minor', 'C minor'],
    energy: { min: 4, max: 8 },
    mood: ['chill', 'confident', 'introspective', 'energetic'],
    instruments: ['sampled loops', 'vinyl crackle', '808', 'keys'],
    origins: 'New York',
    era: 'timeless',
    danceability: 0.7
  }
}

// =============================================================================
// Camelot Key System
// =============================================================================

const CAMELOT_MAP = {
  'Ab minor': '1A', 'G# minor': '1A', 'B major': '1B',
  'Eb minor': '2A', 'D# minor': '2A', 'Gb major': '2B', 'F# major': '2B',
  'Bb minor': '3A', 'A# minor': '3A', 'Db major': '3B', 'C# major': '3B',
  'F minor': '4A', 'Ab major': '4B', 'G# major': '4B',
  'C minor': '5A', 'Eb major': '5B', 'D# major': '5B',
  'G minor': '6A', 'Bb major': '6B', 'A# major': '6B',
  'D minor': '7A', 'F major': '7B',
  'A minor': '8A', 'C major': '8B',
  'E minor': '9A', 'G major': '9B',
  'B minor': '10A', 'D major': '10B',
  'F# minor': '11A', 'Gb minor': '11A', 'A major': '11B',
  'C# minor': '12A', 'Db minor': '12A', 'E major': '12B'
}

const CAMELOT_TO_KEY = Object.fromEntries(
  Object.entries(CAMELOT_MAP).map(([key, camelot]) => [camelot, key])
)

// Get compatible keys for harmonic mixing
function getCompatibleKeys(camelotKey) {
  if (!camelotKey) return []
  const num = parseInt(camelotKey.slice(0, -1))
  const letter = camelotKey.slice(-1)
  const compatible = []
  
  // Same key
  compatible.push(camelotKey)
  // +1 semitone
  compatible.push(`${num === 12 ? 1 : num + 1}${letter}`)
  // -1 semitone
  compatible.push(`${num === 1 ? 12 : num - 1}${letter}`)
  // Relative major/minor
  compatible.push(`${num}${letter === 'A' ? 'B' : 'A'}`)
  
  return compatible.map(c => ({
    camelot: c,
    key: CAMELOT_TO_KEY[c] || c
  }))
}

// =============================================================================
// Genre Detection from BPM and Key
// =============================================================================

function detectGenreFromBpmKey(bpm, key) {
  if (!bpm) return { genre: 'House', subgenre: 'House', confidence: 0.5 }
  
  const isMinor = key?.toLowerCase().includes('minor')
  
  // BPM-based genre detection
  if (bpm >= 160 && bpm <= 180) {
    return { genre: 'Drum & Bass', subgenre: 'Liquid DnB', confidence: 0.85 }
  }
  if (bpm >= 130 && bpm <= 170 && bpm % 2 === 0) {
    return { genre: 'Trap', subgenre: 'Hybrid Trap', confidence: 0.7 }
  }
  if (bpm >= 135 && bpm <= 150) {
    return { genre: 'Techno', subgenre: 'Peak Time Techno', confidence: 0.75 }
  }
  if (bpm >= 125 && bpm < 135) {
    if (isMinor) {
      return { genre: 'Tech House', subgenre: 'Groovy Tech House', confidence: 0.8 }
    }
    return { genre: 'House', subgenre: 'Main Room House', confidence: 0.8 }
  }
  if (bpm >= 118 && bpm < 125) {
    if (isMinor) {
      return { genre: 'Deep House', subgenre: 'Melodic Deep House', confidence: 0.8 }
    }
    return { genre: 'House', subgenre: 'Classic House', confidence: 0.8 }
  }
  if (bpm >= 110 && bpm < 118) {
    return { genre: 'Disco', subgenre: 'Nu Disco', confidence: 0.75 }
  }
  if (bpm >= 70 && bpm < 100) {
    return { genre: 'Hip-Hop', subgenre: 'Boom Bap', confidence: 0.7 }
  }
  
  return { genre: 'House', subgenre: 'House', confidence: 0.5 }
}

// =============================================================================
// AI-Powered Analysis
// =============================================================================

async function analyzeTracksWithAI(tracks) {
  if (!anthropic) {
    console.log('  ⚠️ AI not available, using rule-based analysis')
    return null
  }

  const trackList = tracks.map((t, i) => {
    const genres = t.sonic_dna?.genres?.primary?.join(', ') || 'Unknown'
    const mood = t.sonic_dna?.mood || 'Unknown'
    return `${i + 1}. "${t.title}" by ${t.artist || 'SERGIK'} | BPM: ${t.bpm || 'Unknown'} | Key: ${t.key_signature || 'Unknown'} | Genre: ${genres} | Energy: ${t.energy_level || 'Unknown'} | Mood: ${mood}`
  }).join('\n')

  const prompt = `You are SERGIK's AI production assistant with deep knowledge of electronic music.

Analyze these tracks and provide comprehensive metadata for each:

TRACKS:
${trackList}

For each track, analyze based on the title, artist, BPM, key, and context. Consider SERGIK's style: House, Tech House, Deep House, Disco, with groovy, soulful, funky characteristics.

Return ONLY a JSON array with objects containing:
- index: track number (1-based)
- shortDescription: 1-2 sentence engaging description (max 150 chars)
- fullDescription: 2-3 sentence detailed description mentioning genre, mood, production elements
- mood: primary mood (uplifting, dark, groovy, chill, energetic, euphoric, atmospheric, intense)
- emotions: array of 3-4 emotions the track evokes
- productionEra: era style (modern, vintage, retro-modern, classic, futuristic)
- instruments: array of 4-5 likely instruments/sounds
- djTip: short mixing tip for DJs (max 100 chars)
- energyLevel: 1-10 based on likely intensity
- danceability: 0.0-1.0 how danceable
- targetVenue: ideal venue type (club, festival, lounge, beach, underground)
- timeOfNight: when to play (opener, warm-up, peak-time, closing)

Example:
[{"index":1,"shortDescription":"Groovy house cut with infectious bassline","fullDescription":"A driving tech house track featuring rolling percussion and hypnotic synth stabs. Perfect for peak-time sets.","mood":"groovy","emotions":["euphoria","energy","joy","anticipation"],"productionEra":"modern","instruments":["synth bass","percussion","hi-hats","vocal chops","pads"],"djTip":"Mix from the breakdown for smooth transitions","energyLevel":7,"danceability":0.85,"targetVenue":"club","timeOfNight":"peak-time"}]`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })

    const content = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return null
  } catch (error) {
    console.error('  AI analysis error:', error.message)
    return null
  }
}

// =============================================================================
// Comprehensive Track Enrichment
// =============================================================================

function enrichTrackComplete(track, aiAnalysis = null) {
  const existingSonicDna = track.sonic_dna || {}
  const bpm = track.bpm || existingSonicDna?.technical?.bpm || 125
  const key = track.key_signature || existingSonicDna?.harmony?.keySignature || 'A minor'
  const camelot = CAMELOT_MAP[key] || '8A'
  
  // Detect genre
  const genreDetection = detectGenreFromBpmKey(bpm, key)
  const genreProfile = GENRE_PROFILES[genreDetection.genre.toLowerCase().replace(/[- ]/g, '_')] || GENRE_PROFILES.house
  
  // Calculate energy from BPM if missing
  let energy = track.energy_level
  if (!energy) {
    if (bpm < 100) energy = 4
    else if (bpm < 118) energy = 5
    else if (bpm < 125) energy = 6
    else if (bpm < 130) energy = 7
    else if (bpm < 140) energy = 8
    else energy = 9
  }
  
  // Calculate danceability
  let danceability = track.danceability || genreProfile.danceability || 0.8
  if (typeof danceability !== 'number' || danceability > 1) {
    danceability = genreProfile.danceability || 0.8
  }
  
  // Get drum pattern based on genre
  const drumPattern = genreProfile.drumPatterns?.[0] || '4-on-the-floor'
  
  // Get mood from AI or derive from genre
  const mood = aiAnalysis?.mood || genreProfile.mood?.[0] || 'groovy'
  const emotions = aiAnalysis?.emotions || genreProfile.mood || ['energy', 'groove', 'joy']
  
  // Get instruments from AI or genre profile
  const instruments = aiAnalysis?.instruments || genreProfile.instruments || ['synth', 'bass', 'drums', 'pads']
  
  // Generate descriptions
  const shortDesc = aiAnalysis?.shortDescription || 
    `${genreDetection.subgenre} track with ${mood} energy at ${bpm} BPM`
  
  const fullDesc = aiAnalysis?.fullDescription ||
    `A ${genreDetection.genre} production by ${track.artist || 'SERGIK'} featuring ${instruments.slice(0, 3).join(', ')}. ` +
    `Running at ${bpm} BPM in ${key}, this track delivers ${mood} vibes perfect for ${aiAnalysis?.targetVenue || genreProfile.origins || 'the dancefloor'}.`
  
  // Calculate SERGIK compatibility score
  const bpmMatch = Math.max(0, 1 - Math.abs(bpm - SERGIK_PROFILE.bpmSweet.ideal) / 30)
  const keyMatch = SERGIK_PROFILE.keyPreferences.includes(key) ? 1 : 0.6
  const genreMatch = SERGIK_PROFILE.primaryGenres.includes(genreDetection.genre) ? 1 : 
                     SERGIK_PROFILE.secondaryGenres.includes(genreDetection.genre) ? 0.8 : 0.5
  const sergikScore = Math.round((bpmMatch * 0.3 + keyMatch * 0.3 + genreMatch * 0.4) * 100)
  
  // Build comprehensive sonic DNA
  const enrichedSonicDna = {
    ...existingSonicDna,
    _metadata: {
      enrichedAt: new Date().toISOString(),
      enrichmentVersion: '2.0-ai',
      sergikCompatibility: sergikScore
    },
    technical: {
      ...existingSonicDna?.technical,
      bpm: bpm,
      key: {
        key: key.split(' ')[0],
        mode: key.includes('minor') ? 'minor' : 'major',
        camelot: camelot,
        confidence: 0.85
      },
      keySignature: key,
      timeSignature: existingSonicDna?.technical?.timeSignature || '4/4',
      energyLevel: energy,
      danceability: danceability
    },
    harmony: {
      ...existingSonicDna?.harmony,
      keySignature: key,
      camelot: camelot,
      scale: key.includes('minor') ? 'minor' : 'major',
      tonality: key.includes('minor') ? 'minor' : 'major'
    },
    genres: {
      ...existingSonicDna?.genres,
      primary: [genreDetection.genre],
      secondary: genreProfile.subgenres?.slice(0, 2) || [],
      subgenre: genreDetection.subgenre,
      confidence: genreDetection.confidence,
      genreTags: [genreDetection.genre, genreDetection.subgenre, ...genreProfile.mood?.slice(0, 2) || []]
    },
    drums: {
      ...existingSonicDna?.drums,
      patternType: drumPattern,
      style: genreProfile.drumPatterns?.[0] || 'standard',
      complexity: energy > 7 ? 'complex' : 'medium',
      genreStyles: [genreDetection.genre]
    },
    mood: {
      primary: mood,
      emotions: emotions,
      intensity: energy > 7 ? 'high' : energy > 5 ? 'medium' : 'low',
      atmosphere: genreProfile.mood || ['groovy']
    },
    description: {
      short: shortDesc,
      full: fullDesc,
      djTip: aiAnalysis?.djTip || `Works well in ${genreDetection.genre} sets around ${bpm} BPM`
    },
    mixing: {
      compatibleKeys: getCompatibleKeys(camelot),
      idealBpmRange: { min: bpm - 3, max: bpm + 3 },
      energyLevel: energy,
      timeOfNight: aiAnalysis?.timeOfNight || (energy > 7 ? 'peak-time' : energy > 5 ? 'warm-up' : 'opener'),
      targetVenue: aiAnalysis?.targetVenue || 'club'
    },
    production: {
      era: aiAnalysis?.productionEra || genreProfile.era || 'modern',
      instruments: instruments,
      techniques: existingSonicDna?.production?.techniques || ['digital production', 'sampling'],
      style: SERGIK_PROFILE.productionStyle
    },
    cultural: {
      origins: genreProfile.origins || 'Unknown',
      influences: genreProfile.name ? [genreProfile.name, ...SERGIK_PROFILE.influences.slice(0, 2)] : SERGIK_PROFILE.influences,
      regionalCharacteristics: `${genreProfile.origins || 'Global'} ${genreDetection.genre} sound`
    },
    sergik: {
      compatibilityScore: sergikScore,
      compatibilityLevel: sergikScore >= 80 ? 'High' : sergikScore >= 60 ? 'Medium' : 'Low',
      recommendedFor: sergikScore >= 70 ? 'DJ sets' : 'Production reference',
      notes: `${genreDetection.genre} track at ${bpm} BPM - ${sergikScore >= 70 ? 'fits SERGIK style' : 'different vibe'}`
    }
  }
  
  return {
    // Top-level fields to update
    bpm: bpm,
    key_signature: key,
    energy_level: energy,
    danceability: danceability,
    sonic_dna: enrichedSonicDna,
    metadata: {
      ...(track.metadata || {}),
      genre: genreDetection.genre,
      subgenre: genreDetection.subgenre,
      mood: mood,
      camelot: camelot,
      sergikCompatibility: sergikScore,
      lastEnriched: new Date().toISOString()
    }
  }
}

// =============================================================================
// Main Execution
// =============================================================================

async function main() {
  console.log('═'.repeat(70))
  console.log('🎵 SERGIK AI Complete Track Enrichment')
  console.log('═'.repeat(70))
  console.log('')
  console.log('This script uses:')
  console.log('  • SERGIK Knowledge Base (genre profiles, production characteristics)')
  console.log('  • Sonic DNA Analysis (existing track metadata)')
  console.log('  • AI Analysis (Claude for intelligent descriptions)')
  console.log('')

  // Fetch all tracks
  console.log('📊 Fetching all tracks from database...')
  const { data: tracks, error } = await supabase
    .from('music_library_tracks')
    .select('id, title, artist, bpm, key_signature, energy_level, danceability, sonic_dna, metadata')
    .order('title')

  if (error) {
    console.error('Error fetching tracks:', error.message)
    process.exit(1)
  }

  console.log(`Found ${tracks?.length || 0} tracks to enrich\n`)

  if (!tracks || tracks.length === 0) {
    console.log('No tracks found!')
    return
  }

  const stats = {
    total: tracks.length,
    enriched: 0,
    aiAnalyzed: 0,
    errors: 0,
    fieldsUpdated: {
      bpm: 0,
      key: 0,
      energy: 0,
      danceability: 0,
      sonicDna: 0,
      metadata: 0
    }
  }

  // Process in batches for AI analysis
  const BATCH_SIZE = 10
  const batches = []
  for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
    batches.push(tracks.slice(i, i + BATCH_SIZE))
  }

  console.log(`Processing ${batches.length} batches of up to ${BATCH_SIZE} tracks...\n`)

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    const progress = Math.round(((batchIndex + 1) / batches.length) * 100)
    process.stdout.write(`\rBatch ${batchIndex + 1}/${batches.length} (${progress}%)...`)

    // Get AI analysis for the batch
    let aiResults = null
    if (anthropic) {
      aiResults = await analyzeTracksWithAI(batch)
      if (aiResults) {
        stats.aiAnalyzed += aiResults.length
      }
    }

    // Enrich each track in the batch
    for (let i = 0; i < batch.length; i++) {
      const track = batch[i]
      const aiAnalysis = aiResults?.find(r => r.index === i + 1) || null

      try {
        const enriched = enrichTrackComplete(track, aiAnalysis)

        // Count field updates
        if (enriched.bpm !== track.bpm) stats.fieldsUpdated.bpm++
        if (enriched.key_signature !== track.key_signature) stats.fieldsUpdated.key++
        if (enriched.energy_level !== track.energy_level) stats.fieldsUpdated.energy++
        if (enriched.danceability !== track.danceability) stats.fieldsUpdated.danceability++
        stats.fieldsUpdated.sonicDna++
        stats.fieldsUpdated.metadata++

        // Update database
        const { error: updateError } = await supabase
          .from('music_library_tracks')
          .update({
            bpm: enriched.bpm,
            key_signature: enriched.key_signature,
            energy_level: enriched.energy_level,
            danceability: enriched.danceability,
            sonic_dna: enriched.sonic_dna,
            metadata: enriched.metadata
          })
          .eq('id', track.id)

        if (updateError) {
          console.error(`\n  ❌ Error updating "${track.title}":`, updateError.message)
          stats.errors++
        } else {
          stats.enriched++
        }
      } catch (err) {
        console.error(`\n  ❌ Error processing "${track.title}":`, err.message)
        stats.errors++
      }
    }

    // Rate limit for AI
    if (anthropic && batchIndex < batches.length - 1) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  console.log('\n\n')
  console.log('═'.repeat(70))
  console.log('📊 ENRICHMENT COMPLETE')
  console.log('═'.repeat(70))
  console.log(`Total tracks:        ${stats.total}`)
  console.log(`Successfully enriched: ${stats.enriched}`)
  console.log(`AI analyzed:         ${stats.aiAnalyzed}`)
  console.log(`Errors:              ${stats.errors}`)
  console.log('')
  console.log('Fields Updated:')
  console.log(`  • BPM:          ${stats.fieldsUpdated.bpm}`)
  console.log(`  • Key:          ${stats.fieldsUpdated.key}`)
  console.log(`  • Energy:       ${stats.fieldsUpdated.energy}`)
  console.log(`  • Danceability: ${stats.fieldsUpdated.danceability}`)
  console.log(`  • Sonic DNA:    ${stats.fieldsUpdated.sonicDna}`)
  console.log(`  • Metadata:     ${stats.fieldsUpdated.metadata}`)
  console.log('═'.repeat(70))
  console.log('')
  console.log('✅ All tracks enriched with complete SERGIK knowledge base!')
  console.log('')
  console.log('Refresh the Music Library to see updated data.')
}

main().catch(console.error)
