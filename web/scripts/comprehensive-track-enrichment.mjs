#!/usr/bin/env node
/**
 * Comprehensive Track Enrichment Script
 * 
 * Uses the full GenreAnalyzer and music knowledge base to:
 * 1. Generate detailed, natural language track descriptions
 * 2. Enhance sonic DNA with comprehensive musical analysis
 * 3. Add production insights, mixing recommendations, and emotional profiles
 * 4. Calculate quality scores and completeness metrics
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
// Comprehensive Genre Profiles with Extended Metadata
// =============================================================================

const GENRE_PROFILES = {
  house: {
    name: 'House',
    fullName: 'House Music',
    subgenres: ['Deep House', 'Classic House', 'Vocal House', 'Progressive House', 'Funky House'],
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
      bassType: ['sub', 'filtered', 'synth'],
      chordTypes: ['7th', 'maj7', 'min7']
    },
    instrumentSignatures: ['pads', 'piano', 'organ', 'synth-stabs', 'rhodes'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 5, max: 8 },
    characteristics: ['uplifting', 'groovy', 'soulful', 'four-on-the-floor', 'danceable'],
    mood: 'uplifting and groovy',
    emotionalProfile: ['joy', 'euphoria', 'energy', 'connection'],
    danceability: 0.85,
    origins: 'Chicago',
    influences: ['Disco', 'Soul', 'Funk', 'Electronic'],
    djContext: 'Perfect for peak-time sets and building energy on the dancefloor',
    productionNotes: 'Focus on the groove - let the kick and bass drive while layering melodic elements'
  },
  tech_house: {
    name: 'Tech House',
    fullName: 'Tech House',
    subgenres: ['Minimal Tech House', 'Groovy Tech House', 'Bass House', 'Tribal Tech'],
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
      bassType: ['rolling', 'filtered', 'acid'],
      chordTypes: ['min', 'sus4']
    },
    instrumentSignatures: ['percussion', 'synth-stabs', 'vocal-chops', 'fx-sweeps'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 6, max: 8 },
    characteristics: ['driving', 'hypnotic', 'minimal', 'groovy', 'percussive'],
    mood: 'driving and hypnotic',
    emotionalProfile: ['focus', 'intensity', 'groove', 'hypnosis'],
    danceability: 0.88,
    origins: 'UK/Ibiza',
    influences: ['House', 'Techno', 'Minimal'],
    djContext: 'Ideal for maintaining energy during extended sets',
    productionNotes: 'Layer percussion carefully - the groove comes from the interplay of elements'
  },
  deep_house: {
    name: 'Deep House',
    fullName: 'Deep House',
    subgenres: ['Organic House', 'Melodic House', 'Afro House', 'Soulful House'],
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
      bassType: ['deep', 'warm', 'melodic'],
      chordTypes: ['maj7', 'min9', 'sus2']
    },
    instrumentSignatures: ['pads', 'rhodes', 'piano', 'strings', 'sax', 'guitar'],
    productionEra: ['modern', 'vintage'],
    energyRange: { min: 4, max: 6 },
    characteristics: ['warm', 'soulful', 'atmospheric', 'jazzy', 'emotive'],
    mood: 'warm and soulful',
    emotionalProfile: ['introspection', 'warmth', 'nostalgia', 'romance'],
    danceability: 0.75,
    origins: 'New York/Chicago',
    influences: ['Jazz', 'Soul', 'House'],
    djContext: 'Perfect for opening sets and creating intimate atmospheres',
    productionNotes: 'Let the track breathe - space is as important as the notes'
  },
  techno: {
    name: 'Techno',
    fullName: 'Techno',
    subgenres: ['Minimal Techno', 'Peak Time Techno', 'Industrial Techno', 'Melodic Techno', 'Detroit Techno'],
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
      bassType: ['distorted', 'acid', 'sub'],
      chordTypes: ['min', 'dim']
    },
    instrumentSignatures: ['industrial-sounds', 'noise', 'acid-303', 'modular', 'drones'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 7, max: 10 },
    characteristics: ['dark', 'driving', 'hypnotic', 'industrial', 'relentless'],
    mood: 'dark and industrial',
    emotionalProfile: ['intensity', 'power', 'transcendence', 'catharsis'],
    danceability: 0.82,
    origins: 'Detroit',
    influences: ['Electronic', 'Industrial', 'EBM'],
    djContext: 'Peak-time weapon for late-night warehouse sets',
    productionNotes: 'The kick is king - sculpt it carefully and let it drive everything'
  },
  hiphop: {
    name: 'Hip-Hop',
    fullName: 'Hip-Hop',
    subgenres: ['Boom Bap', 'Trap', 'Lo-Fi Hip-Hop', 'Conscious Hip-Hop', 'Jazz Rap'],
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
      bassType: ['sampled', 'synth', 'clean'],
      chordTypes: ['min7', 'dom7', 'dim']
    },
    instrumentSignatures: ['samples', 'vinyl-crackle', 'scratches', 'mpc-chops', 'horns'],
    productionEra: ['vintage', 'lofi'],
    energyRange: { min: 4, max: 7 },
    characteristics: ['groovy', 'swinging', 'sample-based', 'lyrical', 'head-nodding'],
    mood: 'groovy and laid-back',
    emotionalProfile: ['confidence', 'storytelling', 'authenticity', 'swagger'],
    danceability: 0.72,
    origins: 'New York',
    influences: ['Soul', 'Jazz', 'Funk', 'R&B'],
    djContext: 'Essential for hip-hop sets and crossover moments',
    productionNotes: 'The swing is everything - make it nod heads'
  },
  boom_bap: {
    name: 'Boom Bap',
    fullName: 'Boom Bap Hip-Hop',
    subgenres: ['Golden Era', 'East Coast', 'Jazz Rap', 'Underground'],
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
      bassType: ['sampled', 'upright', 'clean'],
      chordTypes: ['maj7', 'min7', 'dom9']
    },
    instrumentSignatures: ['jazz-samples', 'rhodes', 'horns', 'strings', 'vinyl-crackle', 'piano'],
    productionEra: ['vintage'],
    energyRange: { min: 5, max: 7 },
    characteristics: ['jazzy', 'soulful', 'headnodding', 'lyrical', 'classic'],
    mood: 'jazzy and soulful',
    emotionalProfile: ['nostalgia', 'authenticity', 'wisdom', 'soul'],
    danceability: 0.68,
    origins: 'New York',
    influences: ['Jazz', 'Soul', 'Funk'],
    djContext: 'Perfect for golden era hip-hop appreciation',
    productionNotes: 'Sample digging is the foundation - find that perfect loop'
  },
  trap: {
    name: 'Trap',
    fullName: 'Trap Music',
    subgenres: ['Melodic Trap', 'Hard Trap', 'Drill', 'Phonk', 'UK Drill'],
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
      bassType: ['808-sub', 'distorted-808', 'sliding-808'],
      chordTypes: ['min', 'dim', 'sus']
    },
    instrumentSignatures: ['808-bass', 'brass-hits', 'bells', 'dark-synths', 'pads'],
    productionEra: ['modern'],
    energyRange: { min: 6, max: 9 },
    characteristics: ['hard', 'dark', 'bass-heavy', 'hi-hat-rolls', 'aggressive'],
    mood: 'hard and aggressive',
    emotionalProfile: ['intensity', 'aggression', 'power', 'street'],
    danceability: 0.78,
    origins: 'Atlanta',
    influences: ['Hip-Hop', 'Southern Rap', 'Electronic'],
    djContext: 'Peak energy moments and bass-heavy sets',
    productionNotes: 'The 808 is the star - tune it carefully and let it breathe'
  },
  lofi: {
    name: 'Lo-Fi',
    fullName: 'Lo-Fi Hip-Hop',
    subgenres: ['Lo-Fi Hip-Hop', 'Chillhop', 'Study Beats', 'Bedroom Pop', 'Lo-Fi Jazz'],
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
      bassType: ['warm', 'mellow', 'upright'],
      chordTypes: ['maj7', 'min9', 'dom7']
    },
    instrumentSignatures: ['vinyl-crackle', 'tape-saturation', 'rhodes', 'guitar', 'rain-sounds', 'piano'],
    productionEra: ['lofi', 'vintage'],
    energyRange: { min: 2, max: 5 },
    characteristics: ['mellow', 'nostalgic', 'warm', 'imperfect', 'relaxing'],
    mood: 'mellow and nostalgic',
    emotionalProfile: ['calm', 'nostalgia', 'comfort', 'introspection'],
    danceability: 0.55,
    origins: 'Internet/Japan',
    influences: ['Jazz', 'Hip-Hop', 'Ambient'],
    djContext: 'Background music and chill sessions',
    productionNotes: 'Embrace imperfection - the texture is the vibe'
  },
  funk: {
    name: 'Funk',
    fullName: 'Funk Music',
    subgenres: ['Classic Funk', 'Electro Funk', 'Nu-Funk', 'P-Funk', 'Disco Funk'],
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
      bassType: ['syncopated', 'slap', 'melodic'],
      chordTypes: ['dom7', 'min7', '9th']
    },
    instrumentSignatures: ['clavinet', 'wah-guitar', 'horns', 'slap-bass', 'organ', 'congas'],
    productionEra: ['vintage'],
    energyRange: { min: 6, max: 8 },
    characteristics: ['groovy', 'syncopated', 'tight', 'danceable', 'infectious'],
    mood: 'groovy and energetic',
    emotionalProfile: ['joy', 'celebration', 'physicality', 'freedom'],
    danceability: 0.9,
    origins: 'USA',
    influences: ['Soul', 'R&B', 'Jazz'],
    djContext: 'Get the party started - pure dancefloor energy',
    productionNotes: 'The groove is in the pocket - everything serves the rhythm'
  },
  disco: {
    name: 'Disco',
    fullName: 'Disco',
    subgenres: ['Nu-Disco', 'Italo Disco', 'Space Disco', 'Boogie', 'Cosmic Disco'],
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
      bassType: ['octave-bass', 'driving', 'melodic'],
      chordTypes: ['maj7', 'min7', 'dim']
    },
    instrumentSignatures: ['strings', 'orchestra-hits', 'wah-guitar', 'rhodes', 'congas', 'horns'],
    productionEra: ['vintage'],
    energyRange: { min: 7, max: 9 },
    characteristics: ['uplifting', 'euphoric', 'orchestral', 'danceable', 'glamorous'],
    mood: 'euphoric and uplifting',
    emotionalProfile: ['euphoria', 'celebration', 'glamour', 'freedom'],
    danceability: 0.92,
    origins: 'New York',
    influences: ['Soul', 'Funk', 'Latin'],
    djContext: 'Peak-time magic - pure dancefloor euphoria',
    productionNotes: 'Lush arrangements and driving basslines create the magic'
  },
  soul: {
    name: 'Soul',
    fullName: 'Soul Music',
    subgenres: ['Neo-Soul', 'Classic Soul', 'Northern Soul', 'Quiet Storm', 'Southern Soul'],
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
      bassType: ['melodic', 'walking', 'smooth'],
      chordTypes: ['maj7', 'min9', 'dom7', '13th']
    },
    instrumentSignatures: ['rhodes', 'wurlitzer', 'strings', 'horns', 'choir', 'guitar'],
    productionEra: ['vintage'],
    energyRange: { min: 3, max: 6 },
    characteristics: ['emotional', 'soulful', 'warm', 'expressive', 'heartfelt'],
    mood: 'emotional and expressive',
    emotionalProfile: ['love', 'longing', 'joy', 'pain', 'hope'],
    danceability: 0.65,
    origins: 'USA',
    influences: ['Gospel', 'R&B', 'Jazz'],
    djContext: 'Emotional moments and sophisticated sets',
    productionNotes: 'The vocal and emotion drive everything'
  },
  dnb: {
    name: 'Drum & Bass',
    fullName: 'Drum and Bass',
    subgenres: ['Liquid DnB', 'Jump Up', 'Neurofunk', 'Jungle', 'Atmospheric DnB'],
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
      bassType: ['reese', 'neuro', 'sub', 'wobble'],
      chordTypes: ['min', 'sus', 'dim']
    },
    instrumentSignatures: ['reese-bass', 'breakbeats', 'amen-break', 'vocal-chops', 'pads'],
    productionEra: ['modern'],
    energyRange: { min: 7, max: 10 },
    characteristics: ['fast', 'energetic', 'bass-heavy', 'breakbeat', 'intense'],
    mood: 'energetic and intense',
    emotionalProfile: ['adrenaline', 'power', 'release', 'freedom'],
    danceability: 0.8,
    origins: 'UK',
    influences: ['Jungle', 'Breakbeat', 'Dub'],
    djContext: 'High-energy sets and bass-heavy moments',
    productionNotes: 'The interplay between drums and bass is everything'
  },
  ambient: {
    name: 'Ambient',
    fullName: 'Ambient Music',
    subgenres: ['Dark Ambient', 'Space Ambient', 'Drone', 'New Age', 'Atmospheric'],
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
      bassType: ['sub', 'drone', 'none'],
      chordTypes: ['sus', 'maj7', 'min']
    },
    instrumentSignatures: ['pads', 'drones', 'field-recordings', 'granular', 'textures'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 1, max: 4 },
    characteristics: ['atmospheric', 'spacious', 'meditative', 'evolving', 'ethereal'],
    mood: 'atmospheric and meditative',
    emotionalProfile: ['peace', 'contemplation', 'wonder', 'transcendence'],
    danceability: 0.2,
    origins: 'UK/Germany',
    influences: ['Electronic', 'Classical', 'World'],
    djContext: 'Intro/outro moments and atmospheric journeys',
    productionNotes: 'Less is more - let sounds breathe and evolve naturally'
  },
  trance: {
    name: 'Trance',
    fullName: 'Trance Music',
    subgenres: ['Progressive Trance', 'Uplifting Trance', 'Psytrance', 'Vocal Trance', 'Tech Trance'],
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
      bassType: ['rolling', '303-style', 'psy-bass'],
      chordTypes: ['min', 'sus', 'maj']
    },
    instrumentSignatures: ['supersaw', 'pluck-leads', 'pads', 'arpeggios', 'vocals'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 7, max: 10 },
    characteristics: ['euphoric', 'emotional', 'build-drop', 'melodic', 'uplifting'],
    mood: 'euphoric and emotional',
    emotionalProfile: ['euphoria', 'transcendence', 'emotion', 'unity'],
    danceability: 0.85,
    origins: 'Germany/Netherlands',
    influences: ['House', 'Techno', 'Electronic'],
    djContext: 'Peak-time anthems and emotional peaks',
    productionNotes: 'Build tension and release - the breakdown is sacred'
  },
  edm: {
    name: 'EDM',
    fullName: 'Electronic Dance Music',
    subgenres: ['Big Room', 'Future Bass', 'Electro House', 'Dubstep', 'Progressive'],
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
      bassType: ['sidechain', 'supersaw-bass', 'wobble'],
      chordTypes: ['maj', 'min', 'sus']
    },
    instrumentSignatures: ['supersaw', 'drop', 'riser', 'impact', 'white-noise'],
    productionEra: ['modern'],
    energyRange: { min: 8, max: 10 },
    characteristics: ['high-energy', 'drop-focused', 'festival', 'mainstream', 'anthemic'],
    mood: 'energetic and festival',
    emotionalProfile: ['excitement', 'unity', 'release', 'power'],
    danceability: 0.9,
    origins: 'USA/Europe',
    influences: ['House', 'Trance', 'Dubstep'],
    djContext: 'Festival main-stage moments',
    productionNotes: 'The drop is everything - build anticipation and deliver'
  },
  reggaeton: {
    name: 'Reggaeton',
    fullName: 'Reggaeton',
    subgenres: ['Old School Reggaeton', 'Modern Reggaeton', 'Dembow', 'Latin Trap', 'Perreo'],
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
      bassType: ['synth', '808', 'melodic'],
      chordTypes: ['min', 'maj', 'sus']
    },
    instrumentSignatures: ['dembow-rhythm', 'brass', 'reggaeton-synths', 'vocal-chops'],
    productionEra: ['modern'],
    energyRange: { min: 6, max: 8 },
    characteristics: ['danceable', 'latin', 'rhythmic', 'party', 'sensual'],
    mood: 'party and danceable',
    emotionalProfile: ['celebration', 'sensuality', 'party', 'energy'],
    danceability: 0.88,
    origins: 'Puerto Rico',
    influences: ['Dancehall', 'Hip-Hop', 'Latin'],
    djContext: 'Latin party vibes and dancefloor heat',
    productionNotes: 'The dembow rhythm is the foundation - everything builds on that'
  }
}

// SERGIK DNA Profile
const SERGIK_PROFILE = {
  name: 'SERGIK',
  primaryGenres: ['House', 'Hip-Hop', 'Funk'],
  bpmZones: [
    { range: 'Under 90', percentage: 41, style: 'Downtempo/Hip-Hop' },
    { range: '90-119', percentage: 19, style: 'Funk/Soul' },
    { range: '120-129', percentage: 32, style: 'House/Tech House' },
    { range: '130+', percentage: 8, style: 'Techno/Trance' }
  ],
  primaryKeys: ['10B', '11B', '7A', '8A'],
  sweetSpotBpm: { min: 120, max: 127 },
  signature: 'Bridging hip-hop groove with house energy',
  productionPhilosophy: 'Where boom bap swing meets four-on-the-floor drive'
}

// =============================================================================
// Description Generation
// =============================================================================

function generateDetailedDescription(track, genreResult, profile) {
  const bpm = track.bpm || 0
  const key = track.key_signature || ''
  const title = track.title || 'Untitled'
  const artist = track.artist || 'Unknown Artist'
  
  if (!profile) {
    return `${title} is a compelling track that showcases ${artist}'s production style.`
  }
  
  const genre = profile.name
  const mood = profile.mood
  const characteristics = profile.characteristics || []
  const instruments = profile.instrumentSignatures || []
  const djContext = profile.djContext || ''
  
  // Build description parts
  const parts = []
  
  // Opening
  const openings = [
    `${title} is a ${mood} ${genre.toLowerCase()} track`,
    `A ${characteristics[0] || 'compelling'} ${genre.toLowerCase()} production`,
    `This ${genre.toLowerCase()} track delivers ${mood} vibes`,
    `${artist} presents a ${characteristics[0] || 'dynamic'} ${genre.toLowerCase()} composition`
  ]
  parts.push(openings[Math.floor(Math.random() * openings.length)])
  
  // BPM context
  if (bpm) {
    const bpmDescriptors = {
      slow: ['laid-back', 'relaxed', 'groove-focused'],
      mid: ['driving', 'steady', 'well-paced'],
      fast: ['energetic', 'high-energy', 'propulsive']
    }
    const bpmType = bpm < 100 ? 'slow' : bpm < 130 ? 'mid' : 'fast'
    const descriptor = bpmDescriptors[bpmType][Math.floor(Math.random() * 3)]
    parts.push(`at a ${descriptor} ${bpm} BPM`)
  }
  
  // Key context
  if (key) {
    const isMinor = key.includes('A')
    const keyMood = isMinor 
      ? ['darker, moodier', 'introspective', 'emotive', 'deeper'][Math.floor(Math.random() * 4)]
      : ['brighter, uplifting', 'energetic', 'positive', 'major-key warmth'][Math.floor(Math.random() * 4)]
    parts.push(`with ${keyMood} tonality`)
  }
  
  // Characteristics
  if (characteristics.length >= 2) {
    const charStr = characteristics.slice(0, 3).join(', ')
    parts.push(`featuring ${charStr} elements`)
  }
  
  // Instruments
  if (instruments.length >= 2) {
    const instStr = instruments.slice(0, 3).join(', ')
    parts.push(`built around ${instStr}`)
  }
  
  // DJ context
  if (djContext) {
    parts.push(`. ${djContext}`)
  }
  
  // Combine
  let description = parts.join(' ')
  
  // Add period if missing
  if (!description.endsWith('.')) {
    description += '.'
  }
  
  // Capitalize first letter
  description = description.charAt(0).toUpperCase() + description.slice(1)
  
  return description
}

function generateShortDescription(track, genreResult, profile) {
  const bpm = track.bpm || 0
  const genre = genreResult?.genre || 'Electronic'
  const mood = profile?.mood || 'engaging'
  
  if (bpm) {
    return `${genre} track at ${bpm} BPM with ${mood} energy.`
  }
  return `${genre} track with ${mood} vibes.`
}

function generateProductionNotes(track, profile) {
  if (!profile) return null
  
  const notes = []
  notes.push(profile.productionNotes || '')
  
  if (profile.origins) {
    notes.push(`Rooted in the ${profile.origins} sound.`)
  }
  
  if (profile.influences && profile.influences.length > 0) {
    notes.push(`Influences: ${profile.influences.join(', ')}.`)
  }
  
  return notes.filter(n => n).join(' ')
}

// =============================================================================
// Scoring Functions
// =============================================================================

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
    score += 5
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
  if (drumInfo?.kickPattern || drumInfo?.hatPattern) {
    const kick = (drumInfo.kickPattern || '').toLowerCase()
    const hat = (drumInfo.hatPattern || '').toLowerCase()
    
    if (profile.drumPatterns.kickStyle.some(k => kick.includes(k.toLowerCase()) || k.toLowerCase().includes(kick))) {
      score += 15
      matchingFactors.push('Kick pattern')
    }
    
    if (profile.drumPatterns.hatStyle.some(h => hat.includes(h.toLowerCase()) || h.toLowerCase().includes(hat))) {
      score += 12
      matchingFactors.push('Hat pattern')
    }
    
    if (drumInfo.swing !== undefined) {
      const { min, max } = profile.drumPatterns.swingRange
      if (drumInfo.swing >= min && drumInfo.swing <= max) {
        score += 8
        matchingFactors.push('Swing match')
      }
    }
  } else {
    score += 10
  }
  
  return { score, matchingFactors }
}

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
    genre: bestGenre ? GENRE_PROFILES[bestGenre].name : 'House',
    genreKey: bestGenre || 'house',
    score: bestScore,
    matchingFactors: bestFactors
  }
}

function extractDrumPatternInfo(sonicDna) {
  if (!sonicDna) return {}
  try {
    const dna = typeof sonicDna === 'string' ? JSON.parse(sonicDna) : sonicDna
    return {
      kickPattern: dna?.drums?.kickPattern || dna?.drums?.patternType,
      hatPattern: dna?.drums?.hihatPattern || dna?.drums?.hatStyle,
      snarePattern: dna?.drums?.snarePattern,
      swing: dna?.drums?.swing || dna?.drums?.groove?.swing
    }
  } catch {
    return {}
  }
}

function calculateDnaMatch(bpm, key, energy) {
  let score = 0
  
  if (bpm) {
    if (bpm >= 120 && bpm <= 129) score += 40
    else if (bpm < 90) score += 35
    else if (bpm >= 110 && bpm < 120) score += 20
    else score += 10
  }
  
  const primaryKeys = ['10B', '11B']
  const secondaryKeys = ['7A', '8A']
  if (key) {
    if (primaryKeys.includes(key)) score += 40
    else if (secondaryKeys.includes(key)) score += 30
    else score += 15
  }
  
  if (energy !== undefined) {
    if (energy >= 5 && energy <= 7) score += 20
    else if (energy >= 4 && energy <= 8) score += 10
    else score += 5
  }
  
  return score
}

function generateMixingRecommendations(genreKey, bpm, key) {
  const recommendations = {
    mixableGenres: [],
    bpmRange: { min: 0, max: 0 },
    compatibleKeys: [],
    mixingTips: []
  }
  
  if (bpm) {
    recommendations.bpmRange = {
      min: Math.round(bpm * 0.94),
      max: Math.round(bpm * 1.06)
    }
    recommendations.mixingTips.push(`Safe mixing range: ${recommendations.bpmRange.min}-${recommendations.bpmRange.max} BPM`)
  }
  
  if (key) {
    const keyNum = parseInt(key)
    const keyLetter = key.slice(-1)
    
    if (!isNaN(keyNum)) {
      recommendations.compatibleKeys.push(`${keyNum}A`, `${keyNum}B`)
      const prevNum = keyNum === 1 ? 12 : keyNum - 1
      const nextNum = keyNum === 12 ? 1 : keyNum + 1
      recommendations.compatibleKeys.push(`${prevNum}${keyLetter}`, `${nextNum}${keyLetter}`)
      recommendations.mixingTips.push(`Harmonic mixing: stay on the Camelot wheel`)
    }
  }
  
  const profile = GENRE_PROFILES[genreKey]
  if (profile && bpm) {
    for (const [gKey, gProfile] of Object.entries(GENRE_PROFILES)) {
      if (gKey === genreKey) continue
      if (bpm >= gProfile.bpmRange.min - 10 && bpm <= gProfile.bpmRange.max + 10) {
        recommendations.mixableGenres.push(gProfile.name)
      }
    }
    recommendations.mixableGenres = recommendations.mixableGenres.slice(0, 4)
  }
  
  return recommendations
}

// =============================================================================
// Main Enrichment Function
// =============================================================================

function enrichTrack(track, existingSonicDna) {
  const dna = existingSonicDna ? { ...existingSonicDna } : {}
  const drumInfo = extractDrumPatternInfo(existingSonicDna)
  
  // Infer energy from BPM if not available
  let energy = dna?.technical?.energyLevel || track.energy_level
  if (!energy && track.bpm) {
    if (track.bpm < 90) energy = 4
    else if (track.bpm < 110) energy = 5
    else if (track.bpm < 125) energy = 6
    else if (track.bpm < 135) energy = 7
    else energy = 8
  }
  
  // Genre inference
  const genreResult = inferGenre(track.bpm, track.key_signature, energy, drumInfo)
  const profile = GENRE_PROFILES[genreResult.genreKey]
  
  // Initialize structure
  dna.genres = dna.genres || {}
  dna.drums = dna.drums || {}
  dna.technical = dna.technical || {}
  dna.harmony = dna.harmony || {}
  dna.emotional = dna.emotional || {}
  dna.production = dna.production || {}
  dna.mixing = dna.mixing || {}
  dna.musical = dna.musical || {}
  dna.cultural = dna.cultural || {}
  dna._enrichment = dna._enrichment || {}
  
  // Genre enrichment
  if (!dna.genres.primaryGenres?.length) {
    dna.genres.primaryGenres = [genreResult.genre]
    dna.genres.inferred = true
  }
  dna.genres.fullName = profile?.fullName || genreResult.genre
  dna.genres.subgenres = profile?.subgenres?.slice(0, 3) || []
  dna.genres.inferenceScore = genreResult.score
  dna.genres.matchingFactors = genreResult.matchingFactors
  
  // Drums enrichment
  if (!dna.drums.patternType && profile) {
    dna.drums.patternType = profile.drumPatterns.kickStyle[0]
  }
  dna.drums.genreStyles = profile?.drumPatterns?.kickStyle?.slice(0, 2) || []
  dna.drums.hatStyle = profile?.drumPatterns?.hatStyle?.[0]
  
  // Technical enrichment
  dna.technical.bpm = track.bpm || dna.technical.bpm
  dna.technical.keySignature = track.key_signature || dna.technical.keySignature
  dna.technical.energyLevel = energy || profile?.energyRange?.min + Math.floor((profile?.energyRange?.max - profile?.energyRange?.min) / 2)
  dna.technical.danceability = profile?.danceability || 0.7
  
  // Harmony enrichment
  if (profile?.harmonyProfile) {
    dna.harmony.complexity = profile.harmonyProfile.complexity[0]
    dna.harmony.bassType = profile.harmonyProfile.bassType[0]
    dna.harmony.chordTypes = profile.harmonyProfile.chordTypes
  }
  
  // Emotional enrichment
  dna.emotional.mood = profile?.mood || 'engaging'
  dna.emotional.primaryEmotions = profile?.emotionalProfile || ['engaging']
  dna.emotional.characteristics = profile?.characteristics || []
  
  // Production enrichment
  dna.production.era = profile?.productionEra?.[0] || 'modern'
  dna.production.instrumentSignatures = profile?.instrumentSignatures?.slice(0, 6) || []
  dna.production.notes = generateProductionNotes(track, profile)
  
  // Cultural enrichment
  if (profile) {
    dna.cultural.origins = profile.origins
    dna.cultural.influences = profile.influences || []
  }
  
  // Musical context
  dna.musical.djContext = profile?.djContext || ''
  
  // Descriptions
  dna.description = generateDetailedDescription(track, genreResult, profile)
  dna.shortDescription = generateShortDescription(track, genreResult, profile)
  dna.summary = `${genreResult.genre} | ${track.bpm || '?'} BPM | ${track.key_signature || '?'} | Energy: ${dna.technical.energyLevel}/10`
  
  // Mixing recommendations
  const mixingRecs = generateMixingRecommendations(genreResult.genreKey, track.bpm, track.key_signature)
  dna.mixing = {
    ...dna.mixing,
    bpmRange: mixingRecs.bpmRange,
    compatibleKeys: mixingRecs.compatibleKeys,
    mixableGenres: mixingRecs.mixableGenres,
    tips: mixingRecs.mixingTips
  }
  
  // DNA match score
  dna._enrichment.dnaMatchScore = calculateDnaMatch(track.bpm, track.key_signature, dna.technical.energyLevel)
  dna._enrichment.enrichedAt = new Date().toISOString()
  dna._enrichment.version = '3.0'
  dna._enrichment.sergikCompatibility = dna._enrichment.dnaMatchScore >= 70 ? 'High' : dna._enrichment.dnaMatchScore >= 50 ? 'Medium' : 'Low'
  
  return { dna, genreResult, profile }
}

// =============================================================================
// Main Script
// =============================================================================

async function main() {
  console.log('🎵 Starting Comprehensive Track Enrichment...\n')
  console.log('This script will:')
  console.log('  1. Generate detailed natural language descriptions')
  console.log('  2. Enhance sonic DNA with full musical analysis')
  console.log('  3. Add production insights and mixing recommendations')
  console.log('  4. Calculate quality metrics and SERGIK compatibility\n')
  
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
    descriptionsUpdated: 0,
    sonicDnaEnhanced: 0,
    errors: 0,
    genreDistribution: {},
    sergikCompatibility: { high: 0, medium: 0, low: 0 }
  }
  
  console.log('🔬 Enriching tracks with comprehensive analysis...\n')
  
  let processedCount = 0
  
  for (const track of (tracks || [])) {
    try {
      // Parse existing sonic_dna
      let existingSonicDna = track.sonic_dna
      if (typeof existingSonicDna === 'string') {
        try {
          existingSonicDna = JSON.parse(existingSonicDna)
        } catch {
          existingSonicDna = {}
        }
      }
      existingSonicDna = existingSonicDna || {}
      
      // Enrich track
      const { dna, genreResult, profile } = enrichTrack(track, existingSonicDna)
      
      // Track statistics
      stats.genreDistribution[genreResult.genre] = (stats.genreDistribution[genreResult.genre] || 0) + 1
      
      const compatibility = dna._enrichment.sergikCompatibility
      stats.sergikCompatibility[compatibility.toLowerCase()]++
      
      // Track what was updated
      if (dna.description !== existingSonicDna?.description) stats.descriptionsUpdated++
      if (JSON.stringify(dna) !== JSON.stringify(existingSonicDna)) stats.sonicDnaEnhanced++
      
      // Prepare updates
      const updates = {
        sonic_dna: dna,
        updated_at: new Date().toISOString()
      }
      
      // Update energy if not set
      if (!track.energy_level && dna.technical.energyLevel) {
        updates.energy_level = dna.technical.energyLevel
      }
      
      // Update danceability if not set
      if (!track.danceability && dna.technical.danceability) {
        updates.danceability = dna.technical.danceability
      }
      
      // Update metadata
      const metadata = track.metadata || {}
      updates.metadata = {
        ...metadata,
        primary_genre: genreResult.genre,
        genres: dna.genres.primaryGenres,
        subgenres: dna.genres.subgenres,
        mood: dna.emotional.mood,
        dna_match_score: dna._enrichment.dnaMatchScore,
        sergik_compatibility: dna._enrichment.sergikCompatibility,
        last_enriched: new Date().toISOString(),
        enrichment_version: '3.0'
      }
      
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
        processedCount++
        
        // Progress indicator
        if (processedCount % 50 === 0) {
          process.stdout.write(`\n   Processed ${processedCount}/${stats.total} tracks...`)
        } else {
          process.stdout.write('.')
        }
      }
      
    } catch (err) {
      console.error(`\n   ❌ Error processing "${track.title}":`, err.message)
      stats.errors++
    }
  }
  
  console.log('\n')
  
  // Print summary
  console.log('═'.repeat(70))
  console.log('📊 COMPREHENSIVE ENRICHMENT SUMMARY')
  console.log('═'.repeat(70))
  console.log(`Total tracks:              ${stats.total}`)
  console.log(`Successfully enriched:     ${stats.enriched}`)
  console.log(`Descriptions updated:      ${stats.descriptionsUpdated}`)
  console.log(`Sonic DNA enhanced:        ${stats.sonicDnaEnhanced}`)
  console.log(`Errors:                    ${stats.errors}`)
  console.log('')
  console.log('SERGIK Compatibility:')
  console.log(`  High (70%+):    ${stats.sergikCompatibility.high} tracks`)
  console.log(`  Medium (50-69%): ${stats.sergikCompatibility.medium} tracks`)
  console.log(`  Low (<50%):     ${stats.sergikCompatibility.low} tracks`)
  console.log('')
  console.log('Genre Distribution:')
  
  const sortedGenres = Object.entries(stats.genreDistribution)
    .sort((a, b) => b[1] - a[1])
  
  for (const [genre, count] of sortedGenres) {
    const percentage = ((count / stats.total) * 100).toFixed(1)
    const bar = '█'.repeat(Math.round(percentage / 2))
    console.log(`  ${genre.padEnd(15)} ${String(count).padStart(4)} (${percentage.padStart(5)}%) ${bar}`)
  }
  
  console.log('═'.repeat(70))
  console.log('\n✅ Comprehensive track enrichment complete!')
  console.log('\nNew features added to each track:')
  console.log('  • Detailed natural language descriptions')
  console.log('  • Full emotional profiles')
  console.log('  • Production notes and DJ context')
  console.log('  • Cultural origins and influences')
  console.log('  • Enhanced mixing recommendations with tips')
  console.log('  • SERGIK compatibility scores')
}

main().catch(console.error)
