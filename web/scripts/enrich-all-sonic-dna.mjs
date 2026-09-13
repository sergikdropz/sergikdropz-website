#!/usr/bin/env node
/**
 * Comprehensive Sonic DNA Enrichment Script
 * 
 * Uses the GenreAnalyzer multi-factor system to:
 * 1. Infer missing genres, subgenres, and drum styles
 * 2. Add production characteristics and instrument signatures
 * 3. Generate mood, energy profiles, and descriptions
 * 4. Calculate DNA match scores and mixing recommendations
 * 5. Update all tracks with enriched sonic_dna
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// =============================================================================
// Genre Profiles Database (from genreAnalyzer.ts)
// =============================================================================

const GENRE_PROFILES = {
  house: {
    name: 'House',
    subgenres: ['Deep House', 'Classic House', 'Vocal House', 'Progressive House'],
    bpmRange: { min: 118, max: 132, sweet: 124 },
    keyPreference: { preferMinor: false, commonKeys: ['10B', '9B', '11B', '6B', '8B'] },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'four-to-the-floor'],
      hatStyle: ['offbeat', 'offbeat-8ths', 'open-hat'],
      snareStyle: ['backbeat', 'clap-2-4'],
      swingRange: { min: 0, max: 30 }
    },
    harmonyProfile: {
      complexity: ['medium'],
      bassType: ['sub', 'filtered', 'synth']
    },
    instrumentSignatures: ['pads', 'piano', 'organ', 'synth-stabs'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 5, max: 8 },
    characteristics: ['uplifting', 'groovy', 'soulful', 'four-on-the-floor'],
    mood: 'uplifting and groovy',
    danceability: 0.85
  },
  tech_house: {
    name: 'Tech House',
    subgenres: ['Minimal Tech House', 'Groovy Tech House', 'Bass House'],
    bpmRange: { min: 122, max: 130, sweet: 126 },
    keyPreference: { preferMinor: true, commonKeys: ['7A', '8A', '5A', '6A', '10B'] },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'driving'],
      hatStyle: ['rolling-16ths', '16th-shuffle', 'triplet-hats'],
      snareStyle: ['backbeat', 'syncopated-clap'],
      swingRange: { min: 0, max: 20 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      bassType: ['rolling', 'filtered', 'acid']
    },
    instrumentSignatures: ['percussion', 'synth-stabs', 'vocal-chops'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 6, max: 8 },
    characteristics: ['driving', 'hypnotic', 'minimal', 'groovy'],
    mood: 'driving and hypnotic',
    danceability: 0.88
  },
  deep_house: {
    name: 'Deep House',
    subgenres: ['Organic House', 'Melodic House', 'Afro House'],
    bpmRange: { min: 118, max: 125, sweet: 122 },
    keyPreference: { preferMinor: true, commonKeys: ['7A', '8A', '9A', '10A', '6A'] },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'soft-kick'],
      hatStyle: ['sparse-swing', 'soft-hats', 'shaker'],
      snareStyle: ['rim-shot', 'soft-clap'],
      swingRange: { min: 20, max: 50 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex'],
      bassType: ['deep', 'warm', 'melodic']
    },
    instrumentSignatures: ['pads', 'rhodes', 'piano', 'strings', 'sax'],
    productionEra: ['modern', 'vintage'],
    energyRange: { min: 4, max: 6 },
    characteristics: ['warm', 'soulful', 'atmospheric', 'jazzy'],
    mood: 'warm and soulful',
    danceability: 0.75
  },
  techno: {
    name: 'Techno',
    subgenres: ['Minimal Techno', 'Peak Time Techno', 'Industrial Techno', 'Melodic Techno'],
    bpmRange: { min: 128, max: 145, sweet: 135 },
    keyPreference: { preferMinor: true, commonKeys: ['4A', '5A', '6A', '7A', '3A'] },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'driving', 'distorted-kick'],
      hatStyle: ['driving-16ths', 'industrial', 'minimal-hats'],
      snareStyle: ['none-or-clap', 'industrial', 'syncopated'],
      swingRange: { min: 0, max: 10 }
    },
    harmonyProfile: {
      complexity: ['simple'],
      bassType: ['distorted', 'acid', 'sub']
    },
    instrumentSignatures: ['industrial-sounds', 'noise', 'acid-303', 'modular'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 7, max: 10 },
    characteristics: ['dark', 'driving', 'hypnotic', 'industrial'],
    mood: 'dark and industrial',
    danceability: 0.82
  },
  hiphop: {
    name: 'Hip-Hop',
    subgenres: ['Boom Bap', 'Trap', 'Lo-Fi Hip-Hop', 'Conscious Hip-Hop'],
    bpmRange: { min: 80, max: 100, sweet: 90 },
    keyPreference: { preferMinor: true, commonKeys: ['7A', '8A', '5A', '6A', '4A'] },
    drumPatterns: {
      kickStyle: ['boom-bap', 'swing-kick', 'sampled'],
      hatStyle: ['swing-hats', 'loose', 'dusty'],
      snareStyle: ['2-and-4', 'snappy', 'sampled'],
      swingRange: { min: 40, max: 70 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex'],
      bassType: ['sampled', 'synth', 'clean']
    },
    instrumentSignatures: ['samples', 'vinyl-crackle', 'scratches', 'mpc-chops'],
    productionEra: ['vintage', 'lofi'],
    energyRange: { min: 4, max: 7 },
    characteristics: ['groovy', 'swinging', 'sample-based', 'lyrical'],
    mood: 'groovy and laid-back',
    danceability: 0.72
  },
  boom_bap: {
    name: 'Boom Bap',
    subgenres: ['Golden Era', 'East Coast', 'Jazz Rap'],
    bpmRange: { min: 85, max: 98, sweet: 92 },
    keyPreference: { preferMinor: true, commonKeys: ['7A', '8A', '9A', '6A'] },
    drumPatterns: {
      kickStyle: ['boom-bap', 'punchy', 'mpc'],
      hatStyle: ['swing-hats', 'shaker', 'ride'],
      snareStyle: ['2-and-4', 'snappy', 'cracking'],
      swingRange: { min: 50, max: 70 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex'],
      bassType: ['sampled', 'upright', 'clean']
    },
    instrumentSignatures: ['jazz-samples', 'rhodes', 'horns', 'strings', 'vinyl-crackle'],
    productionEra: ['vintage'],
    energyRange: { min: 5, max: 7 },
    characteristics: ['jazzy', 'soulful', 'headnodding', 'lyrical'],
    mood: 'jazzy and soulful',
    danceability: 0.68
  },
  trap: {
    name: 'Trap',
    subgenres: ['Melodic Trap', 'Hard Trap', 'Drill', 'Phonk'],
    bpmRange: { min: 130, max: 170, sweet: 145 },
    keyPreference: { preferMinor: true, commonKeys: ['4A', '5A', '6A', '7A', '8A'] },
    drumPatterns: {
      kickStyle: ['808-sub', '808-bass', 'distorted-808'],
      hatStyle: ['triplet-rolls', 'hi-hat-rolls', 'fast-hats'],
      snareStyle: ['syncopated', 'sharp-snare', 'clap'],
      swingRange: { min: 0, max: 20 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      bassType: ['808-sub', 'distorted-808', 'sliding-808']
    },
    instrumentSignatures: ['808-bass', 'brass-hits', 'bells', 'dark-synths'],
    productionEra: ['modern'],
    energyRange: { min: 6, max: 9 },
    characteristics: ['hard', 'dark', 'bass-heavy', 'hi-hat-rolls'],
    mood: 'hard and aggressive',
    danceability: 0.78
  },
  lofi: {
    name: 'Lo-Fi',
    subgenres: ['Lo-Fi Hip-Hop', 'Chillhop', 'Study Beats', 'Bedroom Pop'],
    bpmRange: { min: 70, max: 90, sweet: 80 },
    keyPreference: { preferMinor: true, commonKeys: ['7A', '8A', '9A', '2A', '3A'] },
    drumPatterns: {
      kickStyle: ['boom-bap', 'soft-kick', 'vinyl'],
      hatStyle: ['dusty-swing', 'lofi', 'tape-hiss'],
      snareStyle: ['2-and-4', 'soft-snare', 'vinyl-snap'],
      swingRange: { min: 40, max: 65 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex', 'jazz'],
      bassType: ['warm', 'mellow', 'upright']
    },
    instrumentSignatures: ['vinyl-crackle', 'tape-saturation', 'rhodes', 'guitar', 'rain-sounds'],
    productionEra: ['lofi', 'vintage'],
    energyRange: { min: 2, max: 5 },
    characteristics: ['mellow', 'nostalgic', 'warm', 'imperfect'],
    mood: 'mellow and nostalgic',
    danceability: 0.55
  },
  funk: {
    name: 'Funk',
    subgenres: ['Classic Funk', 'Electro Funk', 'Nu-Funk', 'P-Funk'],
    bpmRange: { min: 95, max: 115, sweet: 105 },
    keyPreference: { preferMinor: true, commonKeys: ['9A', '6A', '7A', '8A', '5A'] },
    drumPatterns: {
      kickStyle: ['syncopated-funk', 'one-drop', 'james-brown'],
      hatStyle: ['16th-ghost', 'funky-hats', 'open-hat-accents'],
      snareStyle: ['syncopated', 'ghost-notes', 'slap'],
      swingRange: { min: 30, max: 60 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex'],
      bassType: ['syncopated', 'slap', 'melodic']
    },
    instrumentSignatures: ['clavinet', 'wah-guitar', 'horns', 'slap-bass', 'organ'],
    productionEra: ['vintage'],
    energyRange: { min: 6, max: 8 },
    characteristics: ['groovy', 'syncopated', 'tight', 'danceable'],
    mood: 'groovy and energetic',
    danceability: 0.9
  },
  disco: {
    name: 'Disco',
    subgenres: ['Nu-Disco', 'Italo Disco', 'Space Disco', 'Boogie'],
    bpmRange: { min: 115, max: 130, sweet: 120 },
    keyPreference: { preferMinor: false, commonKeys: ['10B', '9B', '11B', '8B', '6B'] },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'disco-kick'],
      hatStyle: ['open-hat-disco', 'hi-hat-8ths', 'shimmering'],
      snareStyle: ['backbeat', 'tight-snare'],
      swingRange: { min: 10, max: 30 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex'],
      bassType: ['octave-bass', 'driving', 'melodic']
    },
    instrumentSignatures: ['strings', 'orchestra-hits', 'wah-guitar', 'rhodes', 'congas'],
    productionEra: ['vintage'],
    energyRange: { min: 7, max: 9 },
    characteristics: ['uplifting', 'euphoric', 'orchestral', 'danceable'],
    mood: 'euphoric and uplifting',
    danceability: 0.92
  },
  soul: {
    name: 'Soul',
    subgenres: ['Neo-Soul', 'Classic Soul', 'Northern Soul', 'Quiet Storm'],
    bpmRange: { min: 70, max: 100, sweet: 85 },
    keyPreference: { preferMinor: true, commonKeys: ['7A', '8A', '9A', '6A', '10A'] },
    drumPatterns: {
      kickStyle: ['laid-back', 'soft-kick', 'brushes'],
      hatStyle: ['sparse-feel', 'brushes', 'soft-hats'],
      snareStyle: ['2-and-4', 'rim-shot', 'gospel-snare'],
      swingRange: { min: 30, max: 55 }
    },
    harmonyProfile: {
      complexity: ['complex', 'jazz'],
      bassType: ['melodic', 'walking', 'smooth']
    },
    instrumentSignatures: ['rhodes', 'wurlitzer', 'strings', 'horns', 'choir'],
    productionEra: ['vintage'],
    energyRange: { min: 3, max: 6 },
    characteristics: ['emotional', 'soulful', 'warm', 'expressive'],
    mood: 'emotional and expressive',
    danceability: 0.65
  },
  dnb: {
    name: 'Drum & Bass',
    subgenres: ['Liquid DnB', 'Jump Up', 'Neurofunk', 'Jungle'],
    bpmRange: { min: 160, max: 180, sweet: 174 },
    keyPreference: { preferMinor: true, commonKeys: ['5A', '6A', '7A', '8A', '4A'] },
    drumPatterns: {
      kickStyle: ['breakbeat', 'two-step', 'amen-break'],
      hatStyle: ['chopped-breaks', 'fast-hats', 'ride'],
      snareStyle: ['syncopated', 'rolling', 'break-snare'],
      swingRange: { min: 0, max: 20 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      bassType: ['reese', 'neuro', 'sub', 'wobble']
    },
    instrumentSignatures: ['reese-bass', 'breakbeats', 'amen-break', 'vocal-chops'],
    productionEra: ['modern'],
    energyRange: { min: 7, max: 10 },
    characteristics: ['fast', 'energetic', 'bass-heavy', 'breakbeat'],
    mood: 'energetic and intense',
    danceability: 0.8
  },
  reggaeton: {
    name: 'Reggaeton',
    subgenres: ['Old School Reggaeton', 'Modern Reggaeton', 'Dembow', 'Latin Trap'],
    bpmRange: { min: 88, max: 100, sweet: 95 },
    keyPreference: { preferMinor: true, commonKeys: ['7A', '8A', '6A', '5A'] },
    drumPatterns: {
      kickStyle: ['dembow', 'reggaeton-kick'],
      hatStyle: ['dembow-hats', 'tight-hats'],
      snareStyle: ['dembow', 'rim-shot'],
      swingRange: { min: 0, max: 15 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      bassType: ['synth', '808', 'melodic']
    },
    instrumentSignatures: ['dembow-rhythm', 'brass', 'reggaeton-synths'],
    productionEra: ['modern'],
    energyRange: { min: 6, max: 8 },
    characteristics: ['danceable', 'latin', 'rhythmic', 'party'],
    mood: 'party and danceable',
    danceability: 0.88
  },
  ambient: {
    name: 'Ambient',
    subgenres: ['Dark Ambient', 'Space Ambient', 'Drone', 'New Age'],
    bpmRange: { min: 60, max: 120, sweet: 80 },
    keyPreference: { preferMinor: true, commonKeys: ['5A', '6A', '7A', '8A', '4A'] },
    drumPatterns: {
      kickStyle: ['sparse-or-none', 'soft'],
      hatStyle: ['none', 'sparse-textures'],
      snareStyle: ['none', 'textural'],
      swingRange: { min: 0, max: 100 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      bassType: ['sub', 'drone', 'none']
    },
    instrumentSignatures: ['pads', 'drones', 'field-recordings', 'granular'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 1, max: 4 },
    characteristics: ['atmospheric', 'spacious', 'meditative', 'evolving'],
    mood: 'atmospheric and meditative',
    danceability: 0.2
  },
  trance: {
    name: 'Trance',
    subgenres: ['Progressive Trance', 'Uplifting Trance', 'Psytrance', 'Vocal Trance'],
    bpmRange: { min: 138, max: 150, sweet: 140 },
    keyPreference: { preferMinor: true, commonKeys: ['8A', '7A', '9A', '6A', '10A'] },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'punchy-kick'],
      hatStyle: ['offbeat-16ths', 'rolling-hats'],
      snareStyle: ['clap-offbeat', 'layered-clap'],
      swingRange: { min: 0, max: 10 }
    },
    harmonyProfile: {
      complexity: ['medium'],
      bassType: ['rolling', '303-style', 'psy-bass']
    },
    instrumentSignatures: ['supersaw', 'pluck-leads', 'pads', 'arpeggios', 'vocals'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 7, max: 10 },
    characteristics: ['euphoric', 'emotional', 'build-drop', 'melodic'],
    mood: 'euphoric and emotional',
    danceability: 0.85
  },
  edm: {
    name: 'EDM',
    subgenres: ['Big Room', 'Future Bass', 'Electro House', 'Dubstep'],
    bpmRange: { min: 125, max: 150, sweet: 128 },
    keyPreference: { preferMinor: false, commonKeys: ['10B', '11B', '8B', '9B', '6B'] },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'sidechain-kick'],
      hatStyle: ['build-hats', 'crash-heavy'],
      snareStyle: ['build-snare', 'big-room-clap'],
      swingRange: { min: 0, max: 10 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      bassType: ['sidechain', 'supersaw-bass', 'wobble']
    },
    instrumentSignatures: ['supersaw', 'drop', 'riser', 'impact', 'white-noise'],
    productionEra: ['modern'],
    energyRange: { min: 8, max: 10 },
    characteristics: ['high-energy', 'drop-focused', 'festival', 'mainstream'],
    mood: 'energetic and festival',
    danceability: 0.9
  }
}

// SERGIK DNA Profile defaults
const SERGIK_DEFAULTS = {
  genre: 'House',
  subgenre: 'Tech House',
  drumStyle: '4-on-the-floor',
  timeSignature: '4/4',
  key: '10B',
  scale: 'Major',
  bpm: 125,
  energy: 6,
  danceability: 0.75
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract drum pattern info from sonic_dna
 */
function extractDrumPatternInfo(sonicDna) {
  if (!sonicDna) return {}
  try {
    const dna = typeof sonicDna === 'string' ? JSON.parse(sonicDna) : sonicDna
    return {
      kickPattern: dna?.drums?.kickPattern || dna?.drums?.patternType || dna?.comprehensive?.drums?.kickPattern,
      hatPattern: dna?.drums?.hihatPattern || dna?.drums?.hatStyle || dna?.comprehensive?.drums?.hihatPattern,
      snarePattern: dna?.drums?.snarePattern || dna?.drums?.snareStyle,
      swing: dna?.drums?.swing || dna?.drums?.groove?.swing || dna?.drums?.timing?.swingAmount,
      complexity: dna?.drums?.complexity
    }
  } catch {
    return {}
  }
}

/**
 * Score a genre based on track characteristics
 */
function scoreGenre(profile, bpm, key, energy, drumInfo) {
  let score = 0
  const matchingFactors = []
  
  // BPM score (30 points)
  if (bpm) {
    const { min, max, sweet } = profile.bpmRange
    if (Math.abs(bpm - sweet) <= 3) {
      score += 30
      matchingFactors.push('BPM sweet spot')
    } else if (bpm >= min && bpm <= max) {
      score += 20
      matchingFactors.push('BPM in range')
    } else if (bpm >= min - 10 && bpm <= max + 10) {
      score += 8
    }
  } else {
    score += 5 // Default score if no BPM
  }
  
  // Key score (20 points)
  if (key) {
    const isMinor = key.includes('A')
    if (profile.keyPreference.preferMinor === isMinor) {
      score += 10
      if (profile.keyPreference.commonKeys.includes(key)) {
        score += 10
        matchingFactors.push('Key match')
      }
    }
  } else {
    score += 5
  }
  
  // Energy score (15 points)
  if (energy !== undefined && energy !== null) {
    const { min, max } = profile.energyRange
    if (energy >= min && energy <= max) {
      score += 15
      matchingFactors.push('Energy match')
    } else if (energy >= min - 2 && energy <= max + 2) {
      score += 7
    }
  } else {
    score += 5
  }
  
  // Drum pattern score (35 points)
  if (drumInfo.kickPattern || drumInfo.hatPattern) {
    const kick = (drumInfo.kickPattern || '').toLowerCase()
    const hat = (drumInfo.hatPattern || '').toLowerCase()
    
    // Check kick match
    if (profile.drumPatterns.kickStyle.some(k => kick.includes(k.toLowerCase()) || k.toLowerCase().includes(kick))) {
      score += 15
      matchingFactors.push('Kick pattern')
    }
    
    // Check hat match  
    if (profile.drumPatterns.hatStyle.some(h => hat.includes(h.toLowerCase()) || h.toLowerCase().includes(hat))) {
      score += 12
      matchingFactors.push('Hat pattern')
    }
    
    // Swing match
    if (drumInfo.swing !== undefined) {
      const { min, max } = profile.drumPatterns.swingRange
      if (drumInfo.swing >= min && drumInfo.swing <= max) {
        score += 8
        matchingFactors.push('Swing match')
      }
    }
  } else {
    score += 10 // Default if no drum info
  }
  
  return { score, matchingFactors }
}

/**
 * Infer genre using multi-factor analysis
 */
function inferGenre(bpm, key, energy, drumInfo) {
  let bestGenre = null
  let bestScore = 0
  let bestFactors = []
  
  for (const [genreKey, profile] of Object.entries(GENRE_PROFILES)) {
    const { score, matchingFactors } = scoreGenre(profile, bpm, key, energy, drumInfo)
    if (score > bestScore) {
      bestScore = score
      bestGenre = genreKey
      bestFactors = matchingFactors
    }
  }
  
  return {
    genre: bestGenre ? GENRE_PROFILES[bestGenre].name : SERGIK_DEFAULTS.genre,
    genreKey: bestGenre || 'house',
    score: bestScore,
    matchingFactors: bestFactors
  }
}

/**
 * Infer drum style from genre
 */
function inferDrumStyle(genreKey, bpm, drumInfo) {
  if (drumInfo?.kickPattern) return drumInfo.kickPattern
  
  const profile = GENRE_PROFILES[genreKey]
  if (profile) {
    return profile.drumPatterns.kickStyle[0]
  }
  
  // BPM-based fallback
  if (bpm && bpm < 100) return 'Boom Bap'
  if (bpm && bpm >= 118 && bpm < 135) return '4-on-the-floor'
  if (bpm && bpm >= 135) return 'Driving'
  
  return SERGIK_DEFAULTS.drumStyle
}

/**
 * Generate mood description
 */
function generateMood(genreKey, energy, key) {
  const profile = GENRE_PROFILES[genreKey]
  if (!profile) return 'Energetic and engaging'
  
  let mood = profile.mood || 'Engaging'
  
  // Adjust based on energy
  if (energy !== undefined) {
    if (energy >= 8) mood = mood.replace('and', 'and highly')
    if (energy <= 3) mood = 'Calm and ' + mood.split(' and ')[1]
  }
  
  // Adjust based on key
  if (key && key.includes('A')) {
    mood = mood.replace('uplifting', 'moody').replace('bright', 'introspective')
  }
  
  return mood
}

/**
 * Generate track description
 */
function generateDescription(track, genreResult, profile) {
  const bpm = track.bpm || 'Unknown BPM'
  const key = track.key_signature || 'Unknown key'
  const genre = genreResult.genre
  
  let description = `${genre} track`
  
  if (track.bpm) {
    description += ` at ${track.bpm} BPM`
  }
  
  if (profile) {
    description += ` featuring ${profile.characteristics.slice(0, 2).join(' and ')} elements`
  }
  
  if (track.key_signature) {
    const isMinor = track.key_signature.includes('A')
    description += `. ${isMinor ? 'Minor key creates a' : 'Major key provides an'} ${isMinor ? 'darker, moodier' : 'brighter, uplifting'} feel`
  }
  
  return description
}

/**
 * Generate mixing recommendations
 */
function generateMixingRecommendations(genreKey, bpm, key) {
  const recommendations = {
    mixableGenres: [],
    bpmRange: { min: 0, max: 0 },
    compatibleKeys: []
  }
  
  // BPM range for mixing
  if (bpm) {
    recommendations.bpmRange = {
      min: Math.round(bpm * 0.94), // -6%
      max: Math.round(bpm * 1.06)  // +6%
    }
  }
  
  // Compatible keys (Camelot wheel neighbors)
  if (key) {
    const keyNum = parseInt(key)
    const keyLetter = key.slice(-1)
    
    if (!isNaN(keyNum)) {
      // Same number, both letters
      recommendations.compatibleKeys.push(`${keyNum}A`, `${keyNum}B`)
      // +1 and -1 same letter
      const prevNum = keyNum === 1 ? 12 : keyNum - 1
      const nextNum = keyNum === 12 ? 1 : keyNum + 1
      recommendations.compatibleKeys.push(`${prevNum}${keyLetter}`, `${nextNum}${keyLetter}`)
    }
  }
  
  // Mixable genres based on BPM
  const profile = GENRE_PROFILES[genreKey]
  if (profile && bpm) {
    for (const [gKey, gProfile] of Object.entries(GENRE_PROFILES)) {
      if (gKey === genreKey) continue
      // Check if BPM ranges overlap
      if (bpm >= gProfile.bpmRange.min - 10 && bpm <= gProfile.bpmRange.max + 10) {
        recommendations.mixableGenres.push(gProfile.name)
      }
    }
    recommendations.mixableGenres = recommendations.mixableGenres.slice(0, 4)
  }
  
  return recommendations
}

/**
 * Calculate DNA match score (similarity to SERGIK profile)
 */
function calculateDnaMatch(bpm, key, energy) {
  let score = 0
  
  // BPM score (40 points)
  if (bpm) {
    if (bpm >= 120 && bpm <= 129) score += 40
    else if (bpm < 90) score += 35 // SERGIK hip-hop zone
    else if (bpm >= 110 && bpm < 120) score += 20
    else score += 10
  }
  
  // Key score (40 points)
  const primaryKeys = ['10B', '11B']
  const secondaryKeys = ['7A', '8A']
  if (key) {
    if (primaryKeys.includes(key)) score += 40
    else if (secondaryKeys.includes(key)) score += 30
    else score += 15
  }
  
  // Energy score (20 points)
  if (energy !== undefined) {
    if (energy >= 5 && energy <= 7) score += 20
    else if (energy >= 4 && energy <= 8) score += 10
    else score += 5
  }
  
  return score
}

/**
 * Enrich sonic_dna with inferred data
 */
function enrichSonicDna(existingDna, track, genreResult, profile) {
  const dna = existingDna ? { ...existingDna } : {}
  const drumInfo = extractDrumPatternInfo(existingDna)
  
  // Ensure structure exists
  dna.genres = dna.genres || {}
  dna.drums = dna.drums || {}
  dna.technical = dna.technical || {}
  dna.harmony = dna.harmony || {}
  dna.emotional = dna.emotional || {}
  dna.production = dna.production || {}
  dna.mixing = dna.mixing || {}
  dna._metadata = dna._metadata || {}
  dna._enrichment = dna._enrichment || {}
  
  // Genre enrichment
  if (!dna.genres.primaryGenres || dna.genres.primaryGenres.length === 0) {
    dna.genres.primaryGenres = [genreResult.genre]
    dna.genres.inferred = true
  }
  if (!dna.genres.subgenres || dna.genres.subgenres.length === 0) {
    dna.genres.subgenres = profile ? profile.subgenres.slice(0, 2) : []
  }
  dna.genres.inferenceScore = genreResult.score
  dna.genres.matchingFactors = genreResult.matchingFactors
  
  // Drum style enrichment
  const drumStyle = inferDrumStyle(genreResult.genreKey, track.bpm, drumInfo)
  if (!dna.drums.patternType) {
    dna.drums.patternType = drumStyle
  }
  if (!dna.drums.genreStyles || dna.drums.genreStyles.length === 0) {
    dna.drums.genreStyles = profile ? profile.drumPatterns.kickStyle.slice(0, 2) : [drumStyle]
  }
  
  // Technical enrichment
  if (!dna.technical.bpm && track.bpm) {
    dna.technical.bpm = track.bpm
  }
  if (!dna.technical.keySignature && track.key_signature) {
    dna.technical.keySignature = track.key_signature
  }
  if (!dna.technical.energyLevel && profile) {
    dna.technical.energyLevel = Math.round((profile.energyRange.min + profile.energyRange.max) / 2)
  }
  if (!dna.technical.danceability && profile) {
    dna.technical.danceability = profile.danceability
  }
  
  // Mood/Emotional enrichment
  const mood = generateMood(genreResult.genreKey, dna.technical.energyLevel, track.key_signature)
  if (!dna.emotional.mood) {
    dna.emotional.mood = mood
  }
  if (!dna.emotional.primaryEmotions || dna.emotional.primaryEmotions.length === 0) {
    dna.emotional.primaryEmotions = profile ? profile.characteristics.slice(0, 3) : ['engaging']
  }
  
  // Production characteristics
  if (!dna.production.era && profile) {
    dna.production.era = profile.productionEra[0]
  }
  if (!dna.production.instrumentSignatures && profile) {
    dna.production.instrumentSignatures = profile.instrumentSignatures.slice(0, 4)
  }
  
  // Description
  if (!dna.description) {
    dna.description = generateDescription(track, genreResult, profile)
  }
  
  // Mixing recommendations
  const mixingRecs = generateMixingRecommendations(genreResult.genreKey, track.bpm, track.key_signature)
  dna.mixing = {
    ...dna.mixing,
    mixableGenres: mixingRecs.mixableGenres,
    bpmRange: mixingRecs.bpmRange,
    compatibleKeys: mixingRecs.compatibleKeys
  }
  
  // DNA match score
  dna._enrichment.dnaMatchScore = calculateDnaMatch(track.bpm, track.key_signature, dna.technical.energyLevel)
  dna._enrichment.enrichedAt = new Date().toISOString()
  dna._enrichment.version = '2.0'
  
  return dna
}

/**
 * Normalize energy to 1-10 scale
 */
function normalizeEnergy(value) {
  if (value === null || value === undefined) return null
  if (value >= 1 && value <= 10) return Math.round(value)
  if (value >= 0 && value <= 1) return Math.round(value * 9 + 1)
  return Math.max(1, Math.min(10, Math.round(value)))
}

/**
 * Normalize danceability to 0-1 scale
 */
function normalizeDanceability(value) {
  if (value === null || value === undefined) return null
  if (value >= 0 && value <= 1) return Math.round(value * 100) / 100
  if (value >= 0 && value <= 10) return Math.round((value / 10) * 100) / 100
  if (value >= 0 && value <= 100) return Math.round(value) / 100
  return Math.max(0, Math.min(1, value))
}

// =============================================================================
// Main Function
// =============================================================================

async function main() {
  console.log('🧬 Starting Comprehensive Sonic DNA Enrichment...\n')
  console.log('Using multi-factor genre analysis with:')
  console.log('  • BPM matching (30%)')
  console.log('  • Key/Scale analysis (20%)')
  console.log('  • Energy profiling (15%)')
  console.log('  • Drum pattern recognition (35%)')
  console.log('')
  
  // Fetch all tracks
  console.log('📚 Fetching all music library tracks...')
  const { data: tracks, error: fetchError } = await supabase
    .from('music_library_tracks')
    .select('id, title, artist, bpm, key_signature, energy_level, danceability, sonic_dna, metadata')
  
  if (fetchError) {
    console.error('Error fetching tracks:', fetchError.message)
    process.exit(1)
  }
  
  console.log(`   Found ${tracks?.length || 0} tracks\n`)
  
  const stats = {
    total: tracks?.length || 0,
    enriched: 0,
    genreInferred: 0,
    drumStyleAdded: 0,
    moodAdded: 0,
    descriptionAdded: 0,
    mixingRecsAdded: 0,
    errors: 0,
    genreDistribution: {}
  }
  
  console.log('🔬 Analyzing and enriching tracks...\n')
  
  for (const track of (tracks || [])) {
    try {
      // Parse existing sonic_dna
      let sonicDna = track.sonic_dna
      if (typeof sonicDna === 'string') {
        try {
          sonicDna = JSON.parse(sonicDna)
        } catch {
          sonicDna = {}
        }
      }
      sonicDna = sonicDna || {}
      
      // Extract characteristics
      const drumInfo = extractDrumPatternInfo(sonicDna)
      const energy = normalizeEnergy(
        track.energy_level || 
        sonicDna?.technical?.energyLevel || 
        sonicDna?.technical?.energy?.level
      )
      
      // Infer genre using multi-factor analysis
      const genreResult = inferGenre(track.bpm, track.key_signature, energy, drumInfo)
      const profile = GENRE_PROFILES[genreResult.genreKey]
      
      // Track statistics
      stats.genreDistribution[genreResult.genre] = (stats.genreDistribution[genreResult.genre] || 0) + 1
      
      // Enrich sonic_dna
      const enrichedDna = enrichSonicDna(sonicDna, track, genreResult, profile)
      
      // Prepare updates
      const updates = {
        sonic_dna: enrichedDna,
        updated_at: new Date().toISOString()
      }
      
      // Update energy if inferred
      if (!track.energy_level && profile) {
        const inferredEnergy = Math.round((profile.energyRange.min + profile.energyRange.max) / 2)
        updates.energy_level = inferredEnergy
      }
      
      // Update danceability if inferred
      if (!track.danceability && profile) {
        updates.danceability = profile.danceability
      }
      
      // Update metadata with genre info
      const metadata = track.metadata || {}
      updates.metadata = {
        ...metadata,
        primary_genre: genreResult.genre,
        genres: enrichedDna.genres.primaryGenres,
        subgenres: enrichedDna.genres.subgenres,
        dna_match_score: enrichedDna._enrichment.dnaMatchScore,
        last_enriched: new Date().toISOString()
      }
      
      // Track what was added
      if (!sonicDna?.genres?.primaryGenres?.length) stats.genreInferred++
      if (!sonicDna?.drums?.patternType) stats.drumStyleAdded++
      if (!sonicDna?.emotional?.mood) stats.moodAdded++
      if (!sonicDna?.description) stats.descriptionAdded++
      if (!sonicDna?.mixing?.mixableGenres?.length) stats.mixingRecsAdded++
      
      // Apply update
      const { error: updateError } = await supabase
        .from('music_library_tracks')
        .update(updates)
        .eq('id', track.id)
      
      if (updateError) {
        console.error(`   ❌ Error updating "${track.title}":`, updateError.message)
        stats.errors++
      } else {
        stats.enriched++
        process.stdout.write('.')
      }
      
    } catch (err) {
      console.error(`   ❌ Error processing "${track.title}":`, err.message)
      stats.errors++
    }
  }
  
  console.log('\n')
  
  // Print summary
  console.log('═'.repeat(70))
  console.log('📊 ENRICHMENT SUMMARY')
  console.log('═'.repeat(70))
  console.log(`Total tracks:          ${stats.total}`)
  console.log(`Successfully enriched: ${stats.enriched}`)
  console.log(`Errors:                ${stats.errors}`)
  console.log('')
  console.log('New data added:')
  console.log(`  Genres inferred:     ${stats.genreInferred}`)
  console.log(`  Drum styles added:   ${stats.drumStyleAdded}`)
  console.log(`  Moods added:         ${stats.moodAdded}`)
  console.log(`  Descriptions added:  ${stats.descriptionAdded}`)
  console.log(`  Mixing recs added:   ${stats.mixingRecsAdded}`)
  console.log('')
  console.log('Genre distribution:')
  
  // Sort genres by count
  const sortedGenres = Object.entries(stats.genreDistribution)
    .sort((a, b) => b[1] - a[1])
  
  for (const [genre, count] of sortedGenres) {
    const percentage = ((count / stats.total) * 100).toFixed(1)
    const bar = '█'.repeat(Math.round(percentage / 2))
    console.log(`  ${genre.padEnd(15)} ${String(count).padStart(4)} (${percentage.padStart(5)}%) ${bar}`)
  }
  
  console.log('═'.repeat(70))
  console.log('\n✅ Sonic DNA enrichment complete!')
  console.log('\nNext steps:')
  console.log('  • Run "node scripts/sync-all-sonic-dna.mjs" to sync with audio_files')
  console.log('  • Refresh the admin dashboard to see updated metadata')
  console.log('  • Use the Music Library filters to explore by genre')
}

main().catch(console.error)
