/**
 * Extended Subgenre Classification System
 * 
 * Comprehensive 150+ subgenre classification using:
 * - SERGIK AI genre mapping knowledge base
 * - MusicBrainz genre/tag integration
 * - Librosa-based audio feature mapping
 * - AcoustID integration for track identification
 * - Production characteristic analysis
 * 
 * Based on SERGIK DNA profile and comprehensive music taxonomy.
 */

import { DrumAnalysisResult, TimingFeel, BasslineType } from './advancedDrumAnalyzer'

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface SubgenreProfile {
  name: string
  parent: string
  aliases: string[]
  bpmRange: { min: number; max: number; typical: number }
  keyPreference: 'minor' | 'major' | 'modal' | 'any'
  energyRange: { min: number; max: number }
  timingFeel: TimingFeel['type'][]
  drumSignatures: string[]
  bassSignatures: string[]
  productionCharacteristics: string[]
  instrumentSignatures: string[]
  era: { start: number; peak: number; end?: number }
  origins: string[]  // Geographic origins
  musicbrainzTags: string[]  // Known MusicBrainz tags
  characteristics: string[]
  relatedSubgenres: string[]
}

export interface SubgenreClassificationResult {
  primarySubgenre: {
    name: string
    parent: string
    confidence: number
    matchedFeatures: string[]
  }
  secondarySubgenres: {
    name: string
    parent: string
    confidence: number
    matchedFeatures: string[]
  }[]
  microgenres: string[]
  fusionDescription: string | null
  characteristics: string[]
  era: string | null
  origins: string[]
  musicbrainzCompatibleTags: string[]
}

// =============================================================================
// Comprehensive Subgenre Database (150+ Subgenres)
// =============================================================================

export const SUBGENRE_PROFILES: Record<string, SubgenreProfile> = {
  // =========================================================================
  // House Music Subgenres (25+)
  // =========================================================================
  classic_house: {
    name: 'Classic House',
    parent: 'House',
    aliases: ['Chicago House', 'Original House', 'OG House'],
    bpmRange: { min: 118, max: 128, typical: 122 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'clap-backbeat', 'offbeat-hats'],
    bassSignatures: ['synth-bass', 'filtered'],
    productionCharacteristics: ['warm', 'analog', 'piano-stabs'],
    instrumentSignatures: ['piano', 'organ', 'strings', 'vocals'],
    era: { start: 1984, peak: 1988 },
    origins: ['Chicago', 'USA'],
    musicbrainzTags: ['house', 'chicago house', 'classic house'],
    characteristics: ['soulful', 'piano-driven', 'vocal', 'uplifting'],
    relatedSubgenres: ['deep_house', 'garage_house', 'vocal_house']
  },

  deep_house: {
    name: 'Deep House',
    parent: 'House',
    aliases: ['Deep', 'Atmospheric House'],
    bpmRange: { min: 118, max: 125, typical: 122 },
    keyPreference: 'minor',
    energyRange: { min: 4, max: 6 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'soft-kick', 'sparse-hats'],
    bassSignatures: ['deep', 'warm', 'melodic'],
    productionCharacteristics: ['warm', 'spacious', 'reverbed'],
    instrumentSignatures: ['rhodes', 'pads', 'sax', 'strings'],
    era: { start: 1988, peak: 1995 },
    origins: ['Chicago', 'New York', 'UK'],
    musicbrainzTags: ['deep house', 'atmospheric house'],
    characteristics: ['soulful', 'jazzy', 'atmospheric', 'warm'],
    relatedSubgenres: ['classic_house', 'organic_house', 'afro_house']
  },

  tech_house: {
    name: 'Tech House',
    parent: 'House',
    aliases: ['Techy House'],
    bpmRange: { min: 122, max: 130, typical: 126 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'rolling-16ths', 'minimal-snare'],
    bassSignatures: ['rolling', 'filtered', 'acid'],
    productionCharacteristics: ['clean', 'minimal', 'groovy'],
    instrumentSignatures: ['synth-stabs', 'vocal-chops', 'percussion'],
    era: { start: 1995, peak: 2010 },
    origins: ['UK', 'Germany'],
    musicbrainzTags: ['tech house', 'tech-house'],
    characteristics: ['groovy', 'hypnotic', 'minimal', 'driving'],
    relatedSubgenres: ['minimal_tech_house', 'bass_house', 'tribal_tech']
  },

  progressive_house: {
    name: 'Progressive House',
    parent: 'House',
    aliases: ['Prog House', 'Progressive'],
    bpmRange: { min: 125, max: 135, typical: 128 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 9 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'build-percussion', 'layered-kicks'],
    bassSignatures: ['synth-bass', 'rolling', 'sidechain'],
    productionCharacteristics: ['builds', 'drops', 'atmospheric'],
    instrumentSignatures: ['arpeggios', 'pads', 'leads', 'plucks'],
    era: { start: 1992, peak: 2012 },
    origins: ['UK', 'Germany', 'Sweden'],
    musicbrainzTags: ['progressive house', 'prog house'],
    characteristics: ['melodic', 'building', 'emotional', 'euphoric'],
    relatedSubgenres: ['big_room', 'melodic_house', 'trance']
  },

  afro_house: {
    name: 'Afro House',
    parent: 'House',
    aliases: ['African House', 'Afro Tech'],
    bpmRange: { min: 118, max: 128, typical: 123 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'tribal-percussion', 'djembe'],
    bassSignatures: ['deep', 'melodic', 'organic'],
    productionCharacteristics: ['organic', 'percussive', 'spiritual'],
    instrumentSignatures: ['kalimba', 'marimba', 'tribal-drums', 'vocals'],
    era: { start: 2010, peak: 2020 },
    origins: ['South Africa', 'Angola', 'UK'],
    musicbrainzTags: ['afro house', 'afrohouse', 'african house'],
    characteristics: ['tribal', 'spiritual', 'percussive', 'organic'],
    relatedSubgenres: ['deep_house', 'organic_house', 'amapiano']
  },

  organic_house: {
    name: 'Organic House',
    parent: 'House',
    aliases: ['Organic', 'Downtempo House'],
    bpmRange: { min: 115, max: 125, typical: 120 },
    keyPreference: 'minor',
    energyRange: { min: 4, max: 6 },
    timingFeel: ['full-time'],
    drumSignatures: ['soft-kick', 'shaker', 'bongos'],
    bassSignatures: ['warm', 'melodic', 'acoustic'],
    productionCharacteristics: ['organic', 'natural', 'textured'],
    instrumentSignatures: ['acoustic-guitar', 'world-instruments', 'vocals'],
    era: { start: 2015, peak: 2022 },
    origins: ['Europe', 'Global'],
    musicbrainzTags: ['organic house', 'downtempo house'],
    characteristics: ['meditative', 'organic', 'nature-inspired', 'spiritual'],
    relatedSubgenres: ['afro_house', 'deep_house', 'melodic_house']
  },

  melodic_house: {
    name: 'Melodic House & Techno',
    parent: 'House',
    aliases: ['Melodic Techno', 'Indie Dance'],
    bpmRange: { min: 120, max: 130, typical: 124 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'layered-percussion', 'reverbed-snare'],
    bassSignatures: ['melodic', 'driving', 'arpeggiated'],
    productionCharacteristics: ['atmospheric', 'melodic', 'emotional'],
    instrumentSignatures: ['arpeggios', 'pads', 'synth-leads', 'piano'],
    era: { start: 2015, peak: 2022 },
    origins: ['Germany', 'Europe'],
    musicbrainzTags: ['melodic house', 'melodic techno', 'indie dance'],
    characteristics: ['emotional', 'driving', 'atmospheric', 'melodic'],
    relatedSubgenres: ['progressive_house', 'minimal_techno', 'deep_house']
  },

  bass_house: {
    name: 'Bass House',
    parent: 'House',
    aliases: ['UK Bass House', 'G House'],
    bpmRange: { min: 124, max: 130, typical: 128 },
    keyPreference: 'minor',
    energyRange: { min: 7, max: 9 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'punchy-kick', 'tight-snare'],
    bassSignatures: ['wobble', 'distorted', 'heavy'],
    productionCharacteristics: ['heavy', 'distorted', 'energetic'],
    instrumentSignatures: ['bass-drops', 'vocal-chops', 'synth-stabs'],
    era: { start: 2014, peak: 2018 },
    origins: ['UK', 'Australia', 'USA'],
    musicbrainzTags: ['bass house', 'g house', 'uk bass'],
    characteristics: ['heavy', 'bouncy', 'energetic', 'bass-driven'],
    relatedSubgenres: ['tech_house', 'uk_garage', 'dubstep']
  },

  garage_house: {
    name: 'Garage House',
    parent: 'House',
    aliases: ['NY Garage', 'Paradise Garage'],
    bpmRange: { min: 118, max: 128, typical: 124 },
    keyPreference: 'major',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'gospel-snare', 'open-hats'],
    bassSignatures: ['funky', 'melodic', 'walking'],
    productionCharacteristics: ['soulful', 'gospel-influenced', 'uplifting'],
    instrumentSignatures: ['piano', 'organ', 'strings', 'gospel-vocals'],
    era: { start: 1986, peak: 1992 },
    origins: ['New York', 'USA'],
    musicbrainzTags: ['garage house', 'ny garage'],
    characteristics: ['soulful', 'uplifting', 'gospel', 'vocal-heavy'],
    relatedSubgenres: ['classic_house', 'vocal_house', 'disco']
  },

  vocal_house: {
    name: 'Vocal House',
    parent: 'House',
    aliases: ['Vocal', 'Song-based House'],
    bpmRange: { min: 120, max: 130, typical: 125 },
    keyPreference: 'any',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'driving', 'commercial'],
    bassSignatures: ['synth-bass', 'commercial', 'catchy'],
    productionCharacteristics: ['polished', 'commercial', 'radio-friendly'],
    instrumentSignatures: ['vocals', 'piano', 'synth-hooks'],
    era: { start: 1990, peak: 2010 },
    origins: ['Global'],
    musicbrainzTags: ['vocal house', 'vocal'],
    characteristics: ['catchy', 'commercial', 'vocal-driven', 'uplifting'],
    relatedSubgenres: ['garage_house', 'progressive_house', 'euro_house']
  },

  psychedelic_house: {
    name: 'Psychedelic House',
    parent: 'House',
    aliases: ['Psych House', 'Psy House', 'Cosmic House'],
    bpmRange: { min: 118, max: 128, typical: 122 },
    keyPreference: 'modal',
    energyRange: { min: 5, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'offbeat-hats', 'delayed-percussion'],
    bassSignatures: ['filtered', 'analog', 'hypnotic'],
    productionCharacteristics: ['delay', 'phaser', 'filter-sweeps', 'spacious'],
    instrumentSignatures: ['analog-synths', 'drones', 'wah-guitar', 'pads'],
    era: { start: 1988, peak: 2016 },
    origins: ['UK', 'Europe', 'Ibiza'],
    musicbrainzTags: ['psychedelic house', 'cosmic house', 'acid house'],
    characteristics: ['hypnotic', 'trippy', 'expansive', 'immersive'],
    relatedSubgenres: ['organic_house', 'progressive_house', 'deep_house']
  },

  // =========================================================================
  // Techno Subgenres (20+)
  // =========================================================================
  detroit_techno: {
    name: 'Detroit Techno',
    parent: 'Techno',
    aliases: ['Detroit', 'First Wave Techno'],
    bpmRange: { min: 125, max: 135, typical: 130 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'tr-808', 'tr-909'],
    bassSignatures: ['analog', 'synth-bass', 'driving'],
    productionCharacteristics: ['futuristic', 'analog', 'soul-influenced'],
    instrumentSignatures: ['tr-808', 'tr-909', 'synth-strings', 'pads'],
    era: { start: 1984, peak: 1988 },
    origins: ['Detroit', 'USA'],
    musicbrainzTags: ['detroit techno', 'detroit'],
    characteristics: ['futuristic', 'soulful', 'innovative', 'electronic'],
    relatedSubgenres: ['minimal_techno', 'industrial_techno', 'classic_house']
  },

  minimal_techno: {
    name: 'Minimal Techno',
    parent: 'Techno',
    aliases: ['Minimal', 'Click House'],
    bpmRange: { min: 125, max: 135, typical: 128 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 7 },
    timingFeel: ['full-time'],
    drumSignatures: ['sparse-kick', 'glitchy', 'clicks'],
    bassSignatures: ['minimal', 'glitchy', 'sub'],
    productionCharacteristics: ['sparse', 'space', 'micro-variations'],
    instrumentSignatures: ['clicks', 'micro-sounds', 'textures'],
    era: { start: 1993, peak: 2006 },
    origins: ['Germany', 'USA'],
    musicbrainzTags: ['minimal techno', 'minimal', 'microhouse'],
    characteristics: ['sparse', 'hypnotic', 'repetitive', 'space'],
    relatedSubgenres: ['tech_house', 'microhouse', 'dub_techno']
  },

  industrial_techno: {
    name: 'Industrial Techno',
    parent: 'Techno',
    aliases: ['Hard Techno', 'Industrial'],
    bpmRange: { min: 130, max: 150, typical: 140 },
    keyPreference: 'minor',
    energyRange: { min: 8, max: 10 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'distorted-kick', 'industrial-snare'],
    bassSignatures: ['distorted', 'aggressive', 'industrial'],
    productionCharacteristics: ['dark', 'aggressive', 'distorted'],
    instrumentSignatures: ['noise', 'industrial-sounds', 'distortion'],
    era: { start: 1990, peak: 2018 },
    origins: ['Germany', 'UK'],
    musicbrainzTags: ['industrial techno', 'hard techno', 'industrial'],
    characteristics: ['dark', 'aggressive', 'heavy', 'relentless'],
    relatedSubgenres: ['peak_time_techno', 'gabber', 'ebm']
  },

  peak_time_techno: {
    name: 'Peak Time Techno',
    parent: 'Techno',
    aliases: ['Big Room Techno', 'Festival Techno'],
    bpmRange: { min: 132, max: 145, typical: 138 },
    keyPreference: 'minor',
    energyRange: { min: 8, max: 10 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'punchy-kick', 'driving'],
    bassSignatures: ['heavy', 'driving', 'sidechain'],
    productionCharacteristics: ['big', 'festival', 'crowd-pleasing'],
    instrumentSignatures: ['stabs', 'risers', 'drops', 'leads'],
    era: { start: 2015, peak: 2022 },
    origins: ['Global'],
    musicbrainzTags: ['peak time techno', 'big room techno'],
    characteristics: ['big', 'energetic', 'festival', 'driving'],
    relatedSubgenres: ['industrial_techno', 'trance', 'big_room']
  },

  dub_techno: {
    name: 'Dub Techno',
    parent: 'Techno',
    aliases: ['Basic Channel Style', 'Chain Reaction'],
    bpmRange: { min: 120, max: 130, typical: 125 },
    keyPreference: 'minor',
    energyRange: { min: 4, max: 6 },
    timingFeel: ['full-time'],
    drumSignatures: ['minimal-kick', 'reverbed', 'dub-snare'],
    bassSignatures: ['dub', 'reverbed', 'sub'],
    productionCharacteristics: ['dub-delay', 'reverb-heavy', 'spacious'],
    instrumentSignatures: ['dub-chords', 'reverbed-stabs', 'delays'],
    era: { start: 1992, peak: 2000 },
    origins: ['Germany', 'UK'],
    musicbrainzTags: ['dub techno', 'dub-techno'],
    characteristics: ['hypnotic', 'spacious', 'dubby', 'meditative'],
    relatedSubgenres: ['minimal_techno', 'ambient_techno', 'dub']
  },

  acid_techno: {
    name: 'Acid Techno',
    parent: 'Techno',
    aliases: ['Acid', '303 Techno'],
    bpmRange: { min: 130, max: 145, typical: 138 },
    keyPreference: 'minor',
    energyRange: { min: 7, max: 9 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'tr-909', 'hard-kick'],
    bassSignatures: ['acid-303', 'squelchy', 'filtered'],
    productionCharacteristics: ['acid', 'squelchy', 'hypnotic'],
    instrumentSignatures: ['tb-303', 'acid-lines', 'resonance'],
    era: { start: 1987, peak: 1994 },
    origins: ['Chicago', 'UK'],
    musicbrainzTags: ['acid techno', 'acid'],
    characteristics: ['squelchy', 'hypnotic', 'trippy', 'energetic'],
    relatedSubgenres: ['acid_house', 'hard_techno', 'industrial_techno']
  },

  // =========================================================================
  // Hip-Hop Subgenres (20+)
  // =========================================================================
  boom_bap: {
    name: 'Boom Bap',
    parent: 'Hip-Hop',
    aliases: ['Golden Era', 'East Coast', 'Traditional Hip-Hop'],
    bpmRange: { min: 85, max: 98, typical: 92 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 7 },
    timingFeel: ['half-time'],
    drumSignatures: ['boom-bap', 'swing-hats', 'snappy-snare'],
    bassSignatures: ['sampled', 'clean', 'melodic'],
    productionCharacteristics: ['sampled', 'vinyl', 'dusty'],
    instrumentSignatures: ['jazz-samples', 'rhodes', 'horns', 'scratches'],
    era: { start: 1986, peak: 1996 },
    origins: ['New York', 'USA'],
    musicbrainzTags: ['boom bap', 'boom-bap', 'east coast hip hop'],
    characteristics: ['jazzy', 'soulful', 'lyrical', 'sample-based'],
    relatedSubgenres: ['jazz_rap', 'underground_hiphop', 'conscious_hiphop']
  },

  trap: {
    name: 'Trap',
    parent: 'Hip-Hop',
    aliases: ['ATL Trap', 'Southern Trap'],
    bpmRange: { min: 130, max: 170, typical: 145 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 9 },
    timingFeel: ['half-time'],
    drumSignatures: ['808-trap', 'triplet-hats', 'trap-rolls'],
    bassSignatures: ['808-sub', '808-sliding', 'distorted'],
    productionCharacteristics: ['dark', '808-heavy', 'atmospheric'],
    instrumentSignatures: ['808-bass', 'bells', 'brass-hits', 'dark-synths'],
    era: { start: 2003, peak: 2015 },
    origins: ['Atlanta', 'USA'],
    musicbrainzTags: ['trap', 'trap music', 'southern hip hop'],
    characteristics: ['dark', '808-heavy', 'hi-hat-rolls', 'aggressive'],
    relatedSubgenres: ['melodic_trap', 'drill', 'phonk']
  },

  melodic_trap: {
    name: 'Melodic Trap',
    parent: 'Hip-Hop',
    aliases: ['Melodic Rap', 'Emo Trap'],
    bpmRange: { min: 130, max: 165, typical: 145 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 8 },
    timingFeel: ['half-time'],
    drumSignatures: ['808-trap', 'soft-hats', 'light-snare'],
    bassSignatures: ['808-sub', 'melodic', 'sustained'],
    productionCharacteristics: ['melodic', 'atmospheric', 'emotional'],
    instrumentSignatures: ['guitar', 'piano', 'pads', 'autotune-vocals'],
    era: { start: 2015, peak: 2020 },
    origins: ['USA', 'Global'],
    musicbrainzTags: ['melodic trap', 'emo trap', 'melodic rap'],
    characteristics: ['emotional', 'melodic', 'atmospheric', 'introspective'],
    relatedSubgenres: ['trap', 'cloud_rap', 'lofi_hiphop']
  },

  drill: {
    name: 'Drill',
    parent: 'Hip-Hop',
    aliases: ['Chicago Drill', 'UK Drill', 'Brooklyn Drill'],
    bpmRange: { min: 135, max: 145, typical: 140 },
    keyPreference: 'minor',
    energyRange: { min: 7, max: 9 },
    timingFeel: ['half-time'],
    drumSignatures: ['drill-kick', 'sliding-808', 'hi-hat-rolls'],
    bassSignatures: ['808-sliding', 'aggressive', 'distorted'],
    productionCharacteristics: ['dark', 'aggressive', 'menacing'],
    instrumentSignatures: ['dark-pads', 'bells', 'strings', 'drill-slides'],
    era: { start: 2010, peak: 2020 },
    origins: ['Chicago', 'UK', 'Brooklyn'],
    musicbrainzTags: ['drill', 'uk drill', 'chicago drill'],
    characteristics: ['dark', 'aggressive', 'sliding-808s', 'menacing'],
    relatedSubgenres: ['trap', 'grime', 'uk_rap']
  },

  lofi_hiphop: {
    name: 'Lo-Fi Hip-Hop',
    parent: 'Hip-Hop',
    aliases: ['Lo-Fi', 'Chillhop', 'Study Beats'],
    bpmRange: { min: 70, max: 90, typical: 80 },
    keyPreference: 'minor',
    energyRange: { min: 2, max: 5 },
    timingFeel: ['half-time'],
    drumSignatures: ['boom-bap', 'dusty-drums', 'loose-swing'],
    bassSignatures: ['warm', 'mellow', 'upright'],
    productionCharacteristics: ['dusty', 'vinyl-crackle', 'warm'],
    instrumentSignatures: ['vinyl-crackle', 'rhodes', 'guitar', 'rain-sounds'],
    era: { start: 2013, peak: 2020 },
    origins: ['Japan', 'USA', 'Global'],
    musicbrainzTags: ['lo-fi hip hop', 'lofi hip hop', 'chillhop'],
    characteristics: ['relaxing', 'nostalgic', 'warm', 'atmospheric'],
    relatedSubgenres: ['boom_bap', 'jazz_rap', 'ambient']
  },

  phonk: {
    name: 'Phonk',
    parent: 'Hip-Hop',
    aliases: ['Memphis Phonk', 'Drift Phonk'],
    bpmRange: { min: 120, max: 145, typical: 130 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 9 },
    timingFeel: ['half-time'],
    drumSignatures: ['cowbell', 'memphis-drums', 'heavy-kick'],
    bassSignatures: ['distorted-808', 'heavy', 'aggressive'],
    productionCharacteristics: ['dark', 'distorted', 'memphis-influenced'],
    instrumentSignatures: ['cowbell', 'vocal-samples', 'dark-synths'],
    era: { start: 2010, peak: 2022 },
    origins: ['Memphis', 'Russia', 'Global'],
    musicbrainzTags: ['phonk', 'memphis phonk', 'drift phonk'],
    characteristics: ['dark', 'aggressive', 'distorted', 'memphis-inspired'],
    relatedSubgenres: ['trap', 'memphis_rap', 'horrorcore']
  },

  cloud_rap: {
    name: 'Cloud Rap',
    parent: 'Hip-Hop',
    aliases: ['Spacey Hip-Hop', 'Ethereal Rap'],
    bpmRange: { min: 60, max: 100, typical: 80 },
    keyPreference: 'minor',
    energyRange: { min: 3, max: 6 },
    timingFeel: ['half-time'],
    drumSignatures: ['sparse-drums', 'reverbed', 'ethereal'],
    bassSignatures: ['spacey', 'reverbed', 'distant'],
    productionCharacteristics: ['spacey', 'reverbed', 'dreamy'],
    instrumentSignatures: ['pads', 'synths', 'ambient-textures'],
    era: { start: 2009, peak: 2015 },
    origins: ['USA', 'Internet'],
    musicbrainzTags: ['cloud rap', 'witch house'],
    characteristics: ['dreamy', 'spacey', 'atmospheric', 'ethereal'],
    relatedSubgenres: ['lofi_hiphop', 'melodic_trap', 'witch_house']
  },

  // =========================================================================
  // Drum & Bass Subgenres (15+)
  // =========================================================================
  liquid_dnb: {
    name: 'Liquid Drum & Bass',
    parent: 'Drum & Bass',
    aliases: ['Liquid Funk', 'Soulful DnB'],
    bpmRange: { min: 170, max: 178, typical: 174 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 7 },
    timingFeel: ['full-time'],
    drumSignatures: ['breakbeat', 'tight-breaks', 'rolling'],
    bassSignatures: ['reese', 'melodic', 'sub'],
    productionCharacteristics: ['soulful', 'musical', 'uplifting'],
    instrumentSignatures: ['piano', 'strings', 'vocals', 'pads'],
    era: { start: 1998, peak: 2010 },
    origins: ['UK'],
    musicbrainzTags: ['liquid drum and bass', 'liquid funk'],
    characteristics: ['soulful', 'musical', 'uplifting', 'melodic'],
    relatedSubgenres: ['vocal_dnb', 'atmospheric_dnb', 'jungle']
  },

  neurofunk: {
    name: 'Neurofunk',
    parent: 'Drum & Bass',
    aliases: ['Neuro', 'Tech DnB'],
    bpmRange: { min: 172, max: 178, typical: 174 },
    keyPreference: 'minor',
    energyRange: { min: 8, max: 10 },
    timingFeel: ['full-time'],
    drumSignatures: ['breakbeat', 'complex-breaks', 'robotic'],
    bassSignatures: ['neuro', 'modulated', 'aggressive'],
    productionCharacteristics: ['technical', 'aggressive', 'sci-fi'],
    instrumentSignatures: ['neuro-bass', 'sci-fi-sounds', 'modulation'],
    era: { start: 2000, peak: 2015 },
    origins: ['UK', 'Europe'],
    musicbrainzTags: ['neurofunk', 'neuro'],
    characteristics: ['technical', 'aggressive', 'sci-fi', 'complex'],
    relatedSubgenres: ['techstep', 'dark_dnb', 'minimal_dnb']
  },

  jungle: {
    name: 'Jungle',
    parent: 'Drum & Bass',
    aliases: ['Ragga Jungle', 'Old School Jungle'],
    bpmRange: { min: 160, max: 175, typical: 165 },
    keyPreference: 'minor',
    energyRange: { min: 7, max: 9 },
    timingFeel: ['full-time'],
    drumSignatures: ['amen-break', 'chopped-breaks', 'ragga'],
    bassSignatures: ['deep', 'sub', 'reese'],
    productionCharacteristics: ['chopped', 'ragga', 'sampling'],
    instrumentSignatures: ['amen-break', 'ragga-vocals', 'dub-fx'],
    era: { start: 1992, peak: 1996 },
    origins: ['UK'],
    musicbrainzTags: ['jungle', 'ragga jungle'],
    characteristics: ['chopped-breaks', 'ragga', 'deep-bass', 'energetic'],
    relatedSubgenres: ['liquid_dnb', 'darkcore', 'breakbeat_hardcore']
  },

  jump_up: {
    name: 'Jump Up',
    parent: 'Drum & Bass',
    aliases: ['Jump Up DnB', 'Dancefloor DnB'],
    bpmRange: { min: 172, max: 178, typical: 175 },
    keyPreference: 'minor',
    energyRange: { min: 8, max: 10 },
    timingFeel: ['full-time'],
    drumSignatures: ['breakbeat', 'punchy', 'simple'],
    bassSignatures: ['foghorn', 'wobble', 'aggressive'],
    productionCharacteristics: ['energetic', 'dancefloor', 'simple'],
    instrumentSignatures: ['foghorn-bass', 'simple-hooks', 'drops'],
    era: { start: 2005, peak: 2012 },
    origins: ['UK'],
    musicbrainzTags: ['jump up', 'jump-up'],
    characteristics: ['energetic', 'simple', 'dancefloor', 'bouncy'],
    relatedSubgenres: ['neurofunk', 'jungle', 'brostep']
  },

  halftime_dnb: {
    name: 'Halftime DnB',
    parent: 'Drum & Bass',
    aliases: ['Halftime', 'Trapstep'],
    bpmRange: { min: 170, max: 180, typical: 174 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['half-time'],
    drumSignatures: ['halftime-snare', 'sparse-kick', 'triplet-hats'],
    bassSignatures: ['808-style', 'heavy', 'modulated'],
    productionCharacteristics: ['experimental', 'trap-influenced', 'heavy'],
    instrumentSignatures: ['808-bass', 'synth-leads', 'vocal-chops'],
    era: { start: 2014, peak: 2020 },
    origins: ['UK', 'USA'],
    musicbrainzTags: ['halftime', 'halftime dnb'],
    characteristics: ['heavy', 'experimental', 'trap-influenced', 'bass-heavy'],
    relatedSubgenres: ['trap', 'dubstep', 'neurofunk']
  },

  // =========================================================================
  // Dubstep & Bass Music Subgenres (15+)
  // =========================================================================
  deep_dubstep: {
    name: 'Deep Dubstep',
    parent: 'Dubstep',
    aliases: ['Deep Dub', 'Original Dubstep'],
    bpmRange: { min: 138, max: 142, typical: 140 },
    keyPreference: 'minor',
    energyRange: { min: 4, max: 6 },
    timingFeel: ['half-time'],
    drumSignatures: ['two-step', 'sparse', 'reverbed'],
    bassSignatures: ['sub', 'wobble', 'deep'],
    productionCharacteristics: ['dark', 'spacious', 'sub-heavy'],
    instrumentSignatures: ['sub-bass', 'dub-fx', 'reverbed-snare'],
    era: { start: 2002, peak: 2008 },
    origins: ['UK', 'Croydon'],
    musicbrainzTags: ['deep dubstep', 'dubstep'],
    characteristics: ['deep', 'dark', 'spacious', 'sub-heavy'],
    relatedSubgenres: ['uk_garage', 'dub', 'grime']
  },

  brostep: {
    name: 'Brostep',
    parent: 'Dubstep',
    aliases: ['Heavy Dubstep', 'American Dubstep'],
    bpmRange: { min: 140, max: 150, typical: 145 },
    keyPreference: 'minor',
    energyRange: { min: 8, max: 10 },
    timingFeel: ['half-time'],
    drumSignatures: ['heavy-kick', 'aggressive-snare', 'drops'],
    bassSignatures: ['aggressive', 'distorted', 'modulated'],
    productionCharacteristics: ['aggressive', 'heavy', 'drop-focused'],
    instrumentSignatures: ['risers', 'drops', 'screech-bass', 'growls'],
    era: { start: 2010, peak: 2013 },
    origins: ['USA'],
    musicbrainzTags: ['brostep', 'heavy dubstep'],
    characteristics: ['aggressive', 'heavy', 'drop-focused', 'energetic'],
    relatedSubgenres: ['riddim', 'drumstep', 'edm']
  },

  riddim: {
    name: 'Riddim',
    parent: 'Dubstep',
    aliases: ['Riddim Dubstep', 'Minimal Dubstep'],
    bpmRange: { min: 145, max: 155, typical: 150 },
    keyPreference: 'minor',
    energyRange: { min: 7, max: 9 },
    timingFeel: ['half-time'],
    drumSignatures: ['minimal', 'punchy', 'repetitive'],
    bassSignatures: ['repetitive', 'minimal', 'modulated'],
    productionCharacteristics: ['minimal', 'repetitive', 'hypnotic'],
    instrumentSignatures: ['repetitive-bass', 'minimal-drops', 'simple-structure'],
    era: { start: 2015, peak: 2020 },
    origins: ['USA', 'UK'],
    musicbrainzTags: ['riddim', 'riddim dubstep'],
    characteristics: ['minimal', 'repetitive', 'hypnotic', 'bass-focused'],
    relatedSubgenres: ['brostep', 'deep_dubstep', 'uk_bass']
  },

  future_bass: {
    name: 'Future Bass',
    parent: 'Bass Music',
    aliases: ['Kawaii Bass', 'Melodic Bass'],
    bpmRange: { min: 130, max: 160, typical: 145 },
    keyPreference: 'major',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['full-time', 'half-time'],
    drumSignatures: ['snappy', 'trap-influenced', 'sidechained'],
    bassSignatures: ['supersaw', 'chord-bass', 'melodic'],
    productionCharacteristics: ['melodic', 'bright', 'emotional'],
    instrumentSignatures: ['supersaws', 'vocal-chops', 'plucks', 'chords'],
    era: { start: 2014, peak: 2017 },
    origins: ['USA', 'Australia'],
    musicbrainzTags: ['future bass', 'melodic bass'],
    characteristics: ['melodic', 'bright', 'emotional', 'uplifting'],
    relatedSubgenres: ['trap', 'edm', 'melodic_dubstep']
  },

  // =========================================================================
  // Experimental Bass Subgenres
  // =========================================================================
  spacebass: {
    name: 'Spacebass',
    parent: 'Experimental Bass',
    aliases: ['Space Bass', 'Cosmic Bass'],
    bpmRange: { min: 120, max: 150, typical: 140 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 8 },
    timingFeel: ['half-time', 'broken'],
    drumSignatures: ['sparse', 'halftime-snare', 'atmospheric'],
    bassSignatures: ['sub', 'designed', 'modulated', 'wide'],
    productionCharacteristics: ['spacious', 'sound-design', 'psychedelic'],
    instrumentSignatures: ['wavetable-bass', 'pads', 'fx-sweeps', 'reverb-tails'],
    era: { start: 2010, peak: 2018 },
    origins: ['UK', 'Global'],
    musicbrainzTags: ['spacebass', 'space bass', 'bass music'],
    characteristics: ['spacious', 'psychedelic', 'sound-design', 'sub-heavy'],
    relatedSubgenres: ['wonky', 'leftfield_bass', 'wubs', 'uk_bass']
  },

  wubs: {
    name: 'Wubs',
    parent: 'Experimental Bass',
    aliases: ['Wobble Bass', 'Wubstep'],
    bpmRange: { min: 135, max: 150, typical: 140 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 9 },
    timingFeel: ['half-time'],
    drumSignatures: ['two-step', 'half-time', 'punchy'],
    bassSignatures: ['wobble', 'LFO', 'modulated', 'growl'],
    productionCharacteristics: ['bass-led', 'drop-focused', 'LFO-driven'],
    instrumentSignatures: ['wobble-bass', 'sub', 'risers', 'snare-reverb'],
    era: { start: 2006, peak: 2012 },
    origins: ['UK'],
    musicbrainzTags: ['wobble', 'dubstep', 'bass music'],
    characteristics: ['wobbly', 'physical', 'bass-led', 'hypnotic'],
    relatedSubgenres: ['deep_dubstep', 'brostep', 'spacebass', 'riddim']
  },

  wonky: {
    name: 'Wonky',
    parent: 'Experimental Bass',
    aliases: ['Wonky Bass', 'Purple Sound'],
    bpmRange: { min: 80, max: 110, typical: 95 },
    keyPreference: 'minor',
    energyRange: { min: 4, max: 7 },
    timingFeel: ['swing', 'broken', 'off-grid'],
    drumSignatures: ['off-grid', '808', 'sparse-kick', 'skitter'],
    bassSignatures: ['808', 'bent', 'glitchy', 'melodic'],
    productionCharacteristics: ['off-kilter', 'sample-based', 'leftfield'],
    instrumentSignatures: ['bent-808', 'chip-synths', 'glitch-fx', 'weird-samples'],
    era: { start: 2008, peak: 2012 },
    origins: ['UK', 'USA'],
    musicbrainzTags: ['wonky', 'wonky bass', 'purple'],
    characteristics: ['off-kilter', 'playful', 'glitchy', 'leftfield'],
    relatedSubgenres: ['leftfield_bass', 'footwork', 'spacebass', 'future_bass']
  },

  leftfield_bass: {
    name: 'Leftfield Bass',
    parent: 'Experimental Bass',
    aliases: ['Leftfield', 'Experimental Club', 'Club Bass'],
    bpmRange: { min: 110, max: 150, typical: 130 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 8 },
    timingFeel: ['broken', 'half-time', 'polymetric'],
    drumSignatures: ['broken-kick', 'sparse', 'unusual-grid'],
    bassSignatures: ['designed', 'sub', 'textural'],
    productionCharacteristics: ['avant-garde', 'club', 'sound-design'],
    instrumentSignatures: ['designed-bass', 'found-sounds', 'modular', 'negative-space'],
    era: { start: 2009, peak: 2016 },
    origins: ['UK', 'Berlin', 'Global'],
    musicbrainzTags: ['leftfield', 'experimental bass', 'bass music'],
    characteristics: ['avant-garde', 'unpredictable', 'club', 'textural'],
    relatedSubgenres: ['wonky', 'spacebass', 'idm', 'uk_bass']
  },

  uk_bass: {
    name: 'UK Bass',
    parent: 'Experimental Bass',
    aliases: ['UK Bass Music', 'Post-Dubstep'],
    bpmRange: { min: 125, max: 145, typical: 135 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 8 },
    timingFeel: ['half-time', 'broken', 'garage'],
    drumSignatures: ['broken', 'garage-shuffle', 'sparse-kick'],
    bassSignatures: ['sub', 'warm', 'designed'],
    productionCharacteristics: ['post-dubstep', 'garage-adjacent', 'UK'],
    instrumentSignatures: ['sub-bass', 'vocal-chops', 'garage-drums', 'pads'],
    era: { start: 2008, peak: 2014 },
    origins: ['UK', 'London', 'Bristol'],
    musicbrainzTags: ['uk bass', 'bass music', 'post-dubstep'],
    characteristics: ['UK', 'post-dubstep', 'garage-adjacent', 'sub-heavy'],
    relatedSubgenres: ['deep_dubstep', 'wonky', 'leftfield_bass', 'grime']
  },

  broken_808: {
    name: 'Broken 808',
    parent: 'Experimental Bass',
    aliases: ['Broken Bass', '808 Broken'],
    bpmRange: { min: 100, max: 140, typical: 120 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 8 },
    timingFeel: ['broken', 'half-time'],
    drumSignatures: ['broken-kick', '808', 'syncopated'],
    bassSignatures: ['808', 'tuned', 'lead'],
    productionCharacteristics: ['808-led', 'syncopated', 'sparse-hats'],
    instrumentSignatures: ['808-kick', '808-bass', 'sparse-hats', 'claps'],
    era: { start: 2010, peak: 2020 },
    origins: ['UK', 'USA'],
    musicbrainzTags: ['bass music', '808', 'experimental bass'],
    characteristics: ['broken', '808-led', 'syncopated', 'physical'],
    relatedSubgenres: ['half_time_bass', 'sparse_808', 'wonky', 'trap']
  },

  half_time_bass: {
    name: 'Half-time Bass',
    parent: 'Experimental Bass',
    aliases: ['Halftime Bass', 'Halftime'],
    bpmRange: { min: 130, max: 175, typical: 140 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 9 },
    timingFeel: ['half-time'],
    drumSignatures: ['halftime-snare', 'sparse-kick', 'triplet-hats'],
    bassSignatures: ['sub', '808', 'modulated'],
    productionCharacteristics: ['halftime', 'heavy', 'drop-oriented'],
    instrumentSignatures: ['sub-bass', 'halftime-snare', 'designed-bass'],
    era: { start: 2012, peak: 2020 },
    origins: ['UK', 'USA'],
    musicbrainzTags: ['halftime', 'bass music'],
    characteristics: ['halftime', 'heavy', 'sub-heavy', 'physical'],
    relatedSubgenres: ['broken_808', 'halftime_dnb', 'dubstep', 'trap']
  },

  sparse_808: {
    name: 'Sparse 808',
    parent: 'Experimental Bass',
    aliases: ['Minimal 808', 'Space 808'],
    bpmRange: { min: 90, max: 130, typical: 110 },
    keyPreference: 'minor',
    energyRange: { min: 3, max: 6 },
    timingFeel: ['sparse', 'half-time'],
    drumSignatures: ['sparse-kick', 'minimal', 'negative-space'],
    bassSignatures: ['808', 'sub', 'sparse'],
    productionCharacteristics: ['minimal', 'negative-space', '808-led'],
    instrumentSignatures: ['808', 'silence', 'light-hats', 'pads'],
    era: { start: 2014, peak: 2022 },
    origins: ['Global'],
    musicbrainzTags: ['bass music', '808', 'minimal'],
    characteristics: ['sparse', 'minimal', 'space', '808-led'],
    relatedSubgenres: ['broken_808', 'spacebass', 'leftfield_bass', 'downtempo']
  },

  footwork: {
    name: 'Footwork',
    parent: 'Experimental Bass',
    aliases: ['Juke', 'Chicago Footwork', 'Juke Footwork'],
    bpmRange: { min: 150, max: 170, typical: 160 },
    keyPreference: 'minor',
    energyRange: { min: 7, max: 9 },
    timingFeel: ['broken', 'polymetric'],
    drumSignatures: ['sliced-kick', 'rapid', 'syncopated'],
    bassSignatures: ['808', 'sampled', 'punchy'],
    productionCharacteristics: ['high-BPM', 'sample-chops', 'dance-battle'],
    instrumentSignatures: ['sliced-samples', '808', 'rapid-kicks', 'vocal-chops'],
    era: { start: 1996, peak: 2012 },
    origins: ['Chicago', 'USA'],
    musicbrainzTags: ['footwork', 'juke', 'chicago footwork'],
    characteristics: ['fast', 'syncopated', 'battle-dance', 'sample-heavy'],
    relatedSubgenres: ['wonky', 'leftfield_bass', 'jungle', 'trap']
  },

  colour_bass: {
    name: 'Colour Bass',
    parent: 'Experimental Bass',
    aliases: ['Color Bass', 'Melodic Dubstep'],
    bpmRange: { min: 140, max: 155, typical: 145 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 9 },
    timingFeel: ['half-time'],
    drumSignatures: ['half-time', 'punchy', 'sidechained'],
    bassSignatures: ['melodic', 'designed', 'colourful', 'modulated'],
    productionCharacteristics: ['melodic', 'sound-design', 'festival-adjacent'],
    instrumentSignatures: ['designed-bass', 'supersaws', 'vocal-chops', 'risers'],
    era: { start: 2016, peak: 2022 },
    origins: ['USA', 'Global'],
    musicbrainzTags: ['colour bass', 'color bass', 'melodic dubstep'],
    characteristics: ['melodic', 'colourful', 'designed', 'emotional'],
    relatedSubgenres: ['future_bass', 'wubs', 'spacebass', 'brostep']
  },

  neurobass: {
    name: 'Neurobass',
    parent: 'Experimental Bass',
    aliases: ['Neuro Bass', 'Techstep Bass'],
    bpmRange: { min: 135, max: 150, typical: 140 },
    keyPreference: 'minor',
    energyRange: { min: 7, max: 9 },
    timingFeel: ['half-time'],
    drumSignatures: ['tight', 'technical', 'punchy'],
    bassSignatures: ['neuro', 'Reese', 'modulated', 'distorted'],
    productionCharacteristics: ['technical', 'dark', 'sound-design'],
    instrumentSignatures: ['Reese-bass', 'neuro-growls', 'tight-drums', 'FX'],
    era: { start: 2012, peak: 2020 },
    origins: ['UK', 'Global'],
    musicbrainzTags: ['neurobass', 'neuro bass', 'bass music'],
    characteristics: ['technical', 'dark', 'aggressive', 'designed'],
    relatedSubgenres: ['neurofunk', 'wubs', 'tearout', 'riddim']
  },

  tearout: {
    name: 'Tearout',
    parent: 'Experimental Bass',
    aliases: ['Tearout Dubstep', 'Heavy Tearout'],
    bpmRange: { min: 140, max: 150, typical: 145 },
    keyPreference: 'minor',
    energyRange: { min: 8, max: 10 },
    timingFeel: ['half-time'],
    drumSignatures: ['heavy-kick', 'aggressive-snare', 'drops'],
    bassSignatures: ['aggressive', 'distorted', 'tearout'],
    productionCharacteristics: ['aggressive', 'heavy', 'festival'],
    instrumentSignatures: ['tearout-bass', 'growls', 'risers', 'impact-FX'],
    era: { start: 2018, peak: 2023 },
    origins: ['USA', 'Global'],
    musicbrainzTags: ['tearout', 'tearout dubstep'],
    characteristics: ['aggressive', 'heavy', 'distorted', 'festival'],
    relatedSubgenres: ['brostep', 'neurobass', 'riddim', 'wubs']
  },

  wave: {
    name: 'Wave',
    parent: 'Experimental Bass',
    aliases: ['Wave Music', 'Hardwave'],
    bpmRange: { min: 130, max: 160, typical: 140 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 9 },
    timingFeel: ['half-time', 'full-time'],
    drumSignatures: ['trap-influenced', 'punchy', 'sidechained'],
    bassSignatures: ['distorted', 'hardstyle-adjacent', 'modulated'],
    productionCharacteristics: ['internet-era', 'hard', 'emotional'],
    instrumentSignatures: ['distorted-bass', 'pads', 'vocal-chops', 'hard-kicks'],
    era: { start: 2013, peak: 2019 },
    origins: ['Global', 'Internet'],
    musicbrainzTags: ['wave', 'hardwave', 'bass music'],
    characteristics: ['hard', 'emotional', 'internet-era', 'bass-led'],
    relatedSubgenres: ['future_bass', 'trap', 'colour_bass', 'wonky']
  },

  // =========================================================================
  // Funk & Soul Subgenres (10+)
  // =========================================================================
  g_funk: {
    name: 'G-Funk',
    parent: 'Funk',
    aliases: ['West Coast', 'Gangsta Funk'],
    bpmRange: { min: 85, max: 100, typical: 92 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 7 },
    timingFeel: ['half-time'],
    drumSignatures: ['boom-bap', 'swing', 'laid-back'],
    bassSignatures: ['synth-bass', 'melodic', 'bouncy'],
    productionCharacteristics: ['synth-heavy', 'melodic', 'west-coast'],
    instrumentSignatures: ['moog-bass', 'talk-box', 'synth-leads', 'whistle'],
    era: { start: 1992, peak: 1996 },
    origins: ['Los Angeles', 'USA'],
    musicbrainzTags: ['g-funk', 'west coast hip hop'],
    characteristics: ['smooth', 'melodic', 'synth-heavy', 'laid-back'],
    relatedSubgenres: ['boom_bap', 'p_funk', 'west_coast_hiphop']
  },

  nu_disco: {
    name: 'Nu-Disco',
    parent: 'Disco',
    aliases: ['Disco House', 'French Touch'],
    bpmRange: { min: 115, max: 128, typical: 120 },
    keyPreference: 'major',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'disco-drums', 'live-feel'],
    bassSignatures: ['funky', 'octave', 'melodic'],
    productionCharacteristics: ['retro', 'modern', 'polished'],
    instrumentSignatures: ['synths', 'guitar', 'strings', 'disco-fx'],
    era: { start: 2000, peak: 2013 },
    origins: ['France', 'Global'],
    musicbrainzTags: ['nu disco', 'nu-disco', 'disco house'],
    characteristics: ['groovy', 'retro', 'uplifting', 'danceable'],
    relatedSubgenres: ['disco', 'french_house', 'funk']
  },

  neo_soul: {
    name: 'Neo-Soul',
    parent: 'Soul',
    aliases: ['Progressive Soul', 'Alternative R&B'],
    bpmRange: { min: 70, max: 100, typical: 85 },
    keyPreference: 'minor',
    energyRange: { min: 3, max: 6 },
    timingFeel: ['half-time'],
    drumSignatures: ['laid-back', 'live-drums', 'groovy'],
    bassSignatures: ['melodic', 'warm', 'groovy'],
    productionCharacteristics: ['organic', 'warm', 'live'],
    instrumentSignatures: ['rhodes', 'wurlitzer', 'live-bass', 'horns'],
    era: { start: 1994, peak: 2002 },
    origins: ['USA'],
    musicbrainzTags: ['neo soul', 'neo-soul'],
    characteristics: ['soulful', 'jazzy', 'organic', 'emotional'],
    relatedSubgenres: ['rnb', 'jazz', 'soul']
  },

  // =========================================================================
  // Reggae & Dancehall Subgenres (10+)
  // =========================================================================
  reggaeton: {
    name: 'Reggaeton',
    parent: 'Reggae',
    aliases: ['Regueton', 'Urban Latino'],
    bpmRange: { min: 88, max: 100, typical: 95 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['dembow', 'reggaeton-kick', 'offbeat-snare'],
    bassSignatures: ['synth', '808', 'melodic'],
    productionCharacteristics: ['dembow', 'latin', 'urban'],
    instrumentSignatures: ['dembow-rhythm', 'brass', 'synths'],
    era: { start: 1995, peak: 2017 },
    origins: ['Puerto Rico', 'Panama'],
    musicbrainzTags: ['reggaeton', 'latin urban'],
    characteristics: ['dembow-rhythm', 'latin', 'danceable', 'urban'],
    relatedSubgenres: ['latin_trap', 'dancehall', 'moombahton']
  },

  dancehall: {
    name: 'Dancehall',
    parent: 'Reggae',
    aliases: ['Bashment', 'Ragga'],
    bpmRange: { min: 90, max: 110, typical: 100 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 9 },
    timingFeel: ['full-time'],
    drumSignatures: ['dancehall-riddim', 'one-drop', 'digital'],
    bassSignatures: ['heavy', 'digital', 'melodic'],
    productionCharacteristics: ['digital', 'riddim-based', 'energetic'],
    instrumentSignatures: ['synth-bass', 'digital-drums', 'fx'],
    era: { start: 1979, peak: 2000 },
    origins: ['Jamaica'],
    musicbrainzTags: ['dancehall', 'ragga', 'bashment'],
    characteristics: ['energetic', 'rhythmic', 'digital', 'party'],
    relatedSubgenres: ['reggae', 'reggaeton', 'uk_funky']
  },

  roots_reggae: {
    name: 'Roots Reggae',
    parent: 'Reggae',
    aliases: ['Roots', 'Classic Reggae', 'Reggae'],
    bpmRange: { min: 65, max: 85, typical: 75 },
    keyPreference: 'minor',
    energyRange: { min: 4, max: 6 },
    timingFeel: ['half-time'],
    drumSignatures: ['one-drop', 'roots-kick', 'rim-shot', 'offbeat-hihat'],
    bassSignatures: ['melodic', 'walking', 'deep', 'roots-bass'],
    productionCharacteristics: ['organic', 'live', 'reverb', 'analog'],
    instrumentSignatures: ['organ', 'skank-guitar', 'horns', 'nyabinghi'],
    era: { start: 1968, peak: 1978 },
    origins: ['Jamaica', 'Kingston'],
    musicbrainzTags: ['roots reggae', 'reggae', 'roots', 'rasta'],
    characteristics: ['spiritual', 'conscious', 'laid-back', 'groovy', 'jamaican'],
    relatedSubgenres: ['dub', 'rocksteady', 'dancehall', 'lovers_rock']
  },

  dub: {
    name: 'Dub',
    parent: 'Reggae',
    aliases: ['Dub Reggae', 'Dub Music', 'Jamaican Dub'],
    bpmRange: { min: 60, max: 90, typical: 75 },
    keyPreference: 'minor',
    energyRange: { min: 3, max: 6 },
    timingFeel: ['half-time'],
    drumSignatures: ['one-drop', 'sparse', 'reverbed-snare', 'rim-shot', 'dub-drums'],
    bassSignatures: ['heavy', 'sub', 'melodic', 'dub-bass', 'walking'],
    productionCharacteristics: ['reverb-heavy', 'delay', 'echo', 'stripped', 'spacious', 'analog'],
    instrumentSignatures: ['dub-fx', 'delay-throws', 'reverb-tails', 'spring-reverb', 'tape-echo'],
    era: { start: 1968, peak: 1980 },
    origins: ['Jamaica', 'Kingston'],
    musicbrainzTags: ['dub', 'dub reggae', 'jamaican dub', 'roots dub'],
    characteristics: ['spacious', 'psychedelic', 'bass-heavy', 'hypnotic', 'dubby', 'echo'],
    relatedSubgenres: ['roots_reggae', 'dub_techno', 'deep_dubstep', 'lovers_rock']
  },

  lovers_rock: {
    name: 'Lovers Rock',
    parent: 'Reggae',
    aliases: ['Lovers', 'Romantic Reggae'],
    bpmRange: { min: 70, max: 90, typical: 80 },
    keyPreference: 'major',
    energyRange: { min: 4, max: 6 },
    timingFeel: ['half-time'],
    drumSignatures: ['one-drop', 'smooth', 'light'],
    bassSignatures: ['melodic', 'smooth', 'walking'],
    productionCharacteristics: ['smooth', 'romantic', 'soulful'],
    instrumentSignatures: ['strings', 'piano', 'smooth-guitar', 'vocals'],
    era: { start: 1974, peak: 1985 },
    origins: ['UK', 'Jamaica'],
    musicbrainzTags: ['lovers rock', 'romantic reggae'],
    characteristics: ['romantic', 'smooth', 'soulful', 'sweet'],
    relatedSubgenres: ['roots_reggae', 'rnb', 'soul']
  },

  ska: {
    name: 'Ska',
    parent: 'Reggae',
    aliases: ['Original Ska', 'Jamaican Ska'],
    bpmRange: { min: 110, max: 140, typical: 125 },
    keyPreference: 'major',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['ska-beat', 'offbeat', 'upbeat-snare'],
    bassSignatures: ['walking', 'melodic', 'bouncy'],
    productionCharacteristics: ['upbeat', 'brass-heavy', 'energetic'],
    instrumentSignatures: ['brass', 'horns', 'ska-guitar', 'organ'],
    era: { start: 1959, peak: 1966 },
    origins: ['Jamaica', 'Kingston'],
    musicbrainzTags: ['ska', 'jamaican ska', 'rocksteady'],
    characteristics: ['upbeat', 'bouncy', 'energetic', 'brass'],
    relatedSubgenres: ['rocksteady', 'roots_reggae', 'two_tone']
  },

  rocksteady: {
    name: 'Rocksteady',
    parent: 'Reggae',
    aliases: ['Rock Steady'],
    bpmRange: { min: 70, max: 90, typical: 80 },
    keyPreference: 'minor',
    energyRange: { min: 4, max: 6 },
    timingFeel: ['half-time'],
    drumSignatures: ['one-drop', 'steady', 'smooth'],
    bassSignatures: ['melodic', 'prominent', 'walking'],
    productionCharacteristics: ['smooth', 'soulful', 'vocal-focused'],
    instrumentSignatures: ['organ', 'guitar-skank', 'bass', 'drums'],
    era: { start: 1966, peak: 1968 },
    origins: ['Jamaica'],
    musicbrainzTags: ['rocksteady', 'rock steady'],
    characteristics: ['smooth', 'soulful', 'romantic', 'groovy'],
    relatedSubgenres: ['ska', 'roots_reggae', 'lovers_rock']
  },

  digital_reggae: {
    name: 'Digital Reggae',
    parent: 'Reggae',
    aliases: ['Ragga', 'Computer Reggae', 'Digital Dancehall'],
    bpmRange: { min: 85, max: 110, typical: 95 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 8 },
    timingFeel: ['full-time', 'half-time'],
    drumSignatures: ['digital-drums', 'sleng-teng', 'computerized'],
    bassSignatures: ['synth-bass', 'digital', '808'],
    productionCharacteristics: ['digital', 'computerized', 'synth-based'],
    instrumentSignatures: ['synth-bass', 'drum-machine', 'digital-fx'],
    era: { start: 1985, peak: 1995 },
    origins: ['Jamaica'],
    musicbrainzTags: ['digital reggae', 'ragga', 'digital dancehall'],
    characteristics: ['digital', 'modern', 'electronic', 'bass-heavy'],
    relatedSubgenres: ['dancehall', 'roots_reggae', 'dub']
  },

  steppers: {
    name: 'Steppers',
    parent: 'Reggae',
    aliases: ['Steppers Reggae', 'Four-on-the-floor Reggae'],
    bpmRange: { min: 130, max: 160, typical: 145 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-floor', 'steppers-kick', 'driving'],
    bassSignatures: ['heavy', 'driving', 'pulsing'],
    productionCharacteristics: ['driving', 'hypnotic', 'repetitive'],
    instrumentSignatures: ['dub-fx', 'synths', 'heavy-bass'],
    era: { start: 1975, peak: 1985 },
    origins: ['Jamaica', 'UK'],
    musicbrainzTags: ['steppers', 'steppers reggae'],
    characteristics: ['driving', 'hypnotic', 'powerful', 'dubby'],
    relatedSubgenres: ['dub', 'roots_reggae', 'dub_techno']
  },

  // =========================================================================
  // Electronic & Other Subgenres (20+)
  // =========================================================================
  uk_garage: {
    name: 'UK Garage',
    parent: 'Electronic',
    aliases: ['UKG', '2-Step'],
    bpmRange: { min: 125, max: 140, typical: 130 },
    keyPreference: 'minor',
    energyRange: { min: 6, max: 8 },
    timingFeel: ['full-time'],
    drumSignatures: ['two-step', 'shuffle', 'syncopated'],
    bassSignatures: ['deep', 'melodic', 'syncopated'],
    productionCharacteristics: ['skippy', 'shuffled', 'groovy'],
    instrumentSignatures: ['vocal-chops', 'synth-stabs', 'bass-rolls'],
    era: { start: 1994, peak: 2000 },
    origins: ['UK'],
    musicbrainzTags: ['uk garage', '2-step', 'speed garage'],
    characteristics: ['skippy', 'shuffled', 'vocal', 'groovy'],
    relatedSubgenres: ['deep_dubstep', 'grime', 'bassline']
  },

  grime: {
    name: 'Grime',
    parent: 'Electronic',
    aliases: ['UK Grime', 'Eskibeat'],
    bpmRange: { min: 136, max: 144, typical: 140 },
    keyPreference: 'minor',
    energyRange: { min: 7, max: 9 },
    timingFeel: ['full-time'],
    drumSignatures: ['aggressive', 'skippy', 'sharp'],
    bassSignatures: ['aggressive', 'squelchy', 'distorted'],
    productionCharacteristics: ['aggressive', 'dark', 'urban'],
    instrumentSignatures: ['eskibeat', 'stabs', 'strings', 'brass'],
    era: { start: 2002, peak: 2016 },
    origins: ['UK', 'London'],
    musicbrainzTags: ['grime', 'uk grime'],
    characteristics: ['aggressive', 'dark', 'urban', 'energetic'],
    relatedSubgenres: ['uk_garage', 'drill', 'uk_hip_hop']
  },

  amapiano: {
    name: 'Amapiano',
    parent: 'Electronic',
    aliases: ['Piano', 'Yanos'],
    bpmRange: { min: 110, max: 120, typical: 115 },
    keyPreference: 'minor',
    energyRange: { min: 5, max: 7 },
    timingFeel: ['full-time'],
    drumSignatures: ['log-drums', 'shaker', 'sparse-kick'],
    bassSignatures: ['deep', 'melodic', 'rolling'],
    productionCharacteristics: ['soulful', 'jazzy', 'percussive'],
    instrumentSignatures: ['piano', 'log-drums', 'synth-pads', 'vocals'],
    era: { start: 2012, peak: 2021 },
    origins: ['South Africa'],
    musicbrainzTags: ['amapiano'],
    characteristics: ['soulful', 'piano-driven', 'percussive', 'groovy'],
    relatedSubgenres: ['afro_house', 'deep_house', 'kwaito']
  },

  psytrance: {
    name: 'Psytrance',
    parent: 'Trance',
    aliases: ['Psychedelic Trance', 'Psy'],
    bpmRange: { min: 140, max: 150, typical: 145 },
    keyPreference: 'minor',
    energyRange: { min: 8, max: 10 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'offbeat-bass', 'sharp-kick'],
    bassSignatures: ['303-style', 'squelchy', 'driving'],
    productionCharacteristics: ['psychedelic', 'hypnotic', 'trippy'],
    instrumentSignatures: ['303-bass', 'fx', 'alien-sounds', 'arpeggios'],
    era: { start: 1995, peak: 2005 },
    origins: ['Israel', 'Goa', 'Germany'],
    musicbrainzTags: ['psytrance', 'psychedelic trance', 'goa trance'],
    characteristics: ['hypnotic', 'psychedelic', 'driving', 'trippy'],
    relatedSubgenres: ['full_on', 'dark_psy', 'progressive_psy']
  },

  uplifting_trance: {
    name: 'Uplifting Trance',
    parent: 'Trance',
    aliases: ['Epic Trance', 'Emotional Trance'],
    bpmRange: { min: 136, max: 142, typical: 138 },
    keyPreference: 'minor',
    energyRange: { min: 7, max: 9 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'offbeat-hats', 'rolling'],
    bassSignatures: ['rolling', 'melodic', 'supersaw'],
    productionCharacteristics: ['euphoric', 'emotional', 'epic'],
    instrumentSignatures: ['supersaws', 'pads', 'plucks', 'arpeggios'],
    era: { start: 1998, peak: 2008 },
    origins: ['Germany', 'Netherlands'],
    musicbrainzTags: ['uplifting trance', 'euphoric trance'],
    characteristics: ['euphoric', 'emotional', 'epic', 'melodic'],
    relatedSubgenres: ['progressive_trance', 'vocal_trance', 'psytrance']
  },

  big_room: {
    name: 'Big Room',
    parent: 'EDM',
    aliases: ['Big Room House', 'Festival House'],
    bpmRange: { min: 126, max: 132, typical: 128 },
    keyPreference: 'any',
    energyRange: { min: 8, max: 10 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'punchy', 'simple'],
    bassSignatures: ['sidechain', 'simple', 'big'],
    productionCharacteristics: ['big', 'simple', 'drop-focused'],
    instrumentSignatures: ['lead-synths', 'drops', 'risers', 'impacts'],
    era: { start: 2012, peak: 2015 },
    origins: ['Netherlands', 'Global'],
    musicbrainzTags: ['big room', 'big room house', 'edm'],
    characteristics: ['big', 'simple', 'festival', 'energetic'],
    relatedSubgenres: ['progressive_house', 'electro_house', 'hardstyle']
  },

  hardstyle: {
    name: 'Hardstyle',
    parent: 'Hard Dance',
    aliases: ['Hard Dance', 'Dutch Hardstyle'],
    bpmRange: { min: 145, max: 160, typical: 150 },
    keyPreference: 'minor',
    energyRange: { min: 9, max: 10 },
    timingFeel: ['full-time'],
    drumSignatures: ['hardstyle-kick', 'reverse-bass', 'four-on-the-floor'],
    bassSignatures: ['reverse-bass', 'distorted', 'hard'],
    productionCharacteristics: ['hard', 'distorted', 'euphoric'],
    instrumentSignatures: ['hardstyle-kick', 'supersaws', 'leads'],
    era: { start: 2000, peak: 2015 },
    origins: ['Netherlands'],
    musicbrainzTags: ['hardstyle', 'hard dance'],
    characteristics: ['hard', 'euphoric', 'energetic', 'rave'],
    relatedSubgenres: ['gabber', 'happy_hardcore', 'rawstyle']
  },

  happy_hardcore: {
    name: 'Happy Hardcore',
    parent: 'Hardcore',
    aliases: ['Happy', 'UK Hardcore'],
    bpmRange: { min: 160, max: 180, typical: 170 },
    keyPreference: 'major',
    energyRange: { min: 8, max: 10 },
    timingFeel: ['full-time'],
    drumSignatures: ['four-on-the-floor', 'fast', 'breakbeat'],
    bassSignatures: ['hoover', 'happy', 'melodic'],
    productionCharacteristics: ['happy', 'fast', 'euphoric'],
    instrumentSignatures: ['hoover', 'piano', 'vocals', 'synth-leads'],
    era: { start: 1992, peak: 1996 },
    origins: ['UK', 'Netherlands'],
    musicbrainzTags: ['happy hardcore', 'uk hardcore'],
    characteristics: ['happy', 'fast', 'euphoric', 'rave'],
    relatedSubgenres: ['gabber', 'breakbeat_hardcore', 'trance']
  },

  ambient: {
    name: 'Ambient',
    parent: 'Electronic',
    aliases: ['Atmospheric', 'Soundscape'],
    bpmRange: { min: 60, max: 120, typical: 80 },
    keyPreference: 'any',
    energyRange: { min: 1, max: 4 },
    timingFeel: ['variable'],
    drumSignatures: ['sparse-or-none', 'textural', 'minimal'],
    bassSignatures: ['drone', 'sub', 'none'],
    productionCharacteristics: ['spacious', 'atmospheric', 'evolving'],
    instrumentSignatures: ['pads', 'drones', 'field-recordings', 'textures'],
    era: { start: 1978, peak: 1995 },
    origins: ['UK', 'Germany'],
    musicbrainzTags: ['ambient', 'atmospheric'],
    characteristics: ['atmospheric', 'meditative', 'spacious', 'evolving'],
    relatedSubgenres: ['dark_ambient', 'drone', 'new_age']
  },

  downtempo: {
    name: 'Downtempo',
    parent: 'Electronic',
    aliases: ['Chillout', 'Trip Hop'],
    bpmRange: { min: 60, max: 100, typical: 80 },
    keyPreference: 'minor',
    energyRange: { min: 2, max: 5 },
    timingFeel: ['half-time'],
    drumSignatures: ['laid-back', 'trip-hop', 'breakbeat'],
    bassSignatures: ['deep', 'melodic', 'warm'],
    productionCharacteristics: ['atmospheric', 'cinematic', 'moody'],
    instrumentSignatures: ['samples', 'strings', 'rhodes', 'scratches'],
    era: { start: 1991, peak: 2000 },
    origins: ['UK', 'Bristol'],
    musicbrainzTags: ['downtempo', 'trip hop', 'chillout'],
    characteristics: ['moody', 'atmospheric', 'cinematic', 'laid-back'],
    relatedSubgenres: ['trip_hop', 'ambient', 'lofi_hiphop']
  },

  breakcore: {
    name: 'Breakcore',
    parent: 'Electronic',
    aliases: ['Drill and Bass', 'Noise Breakcore'],
    bpmRange: { min: 160, max: 280, typical: 180 },
    keyPreference: 'any',
    energyRange: { min: 8, max: 10 },
    timingFeel: ['variable'],
    drumSignatures: ['chaotic', 'chopped-breaks', 'machine-gun'],
    bassSignatures: ['distorted', 'chaotic', 'glitchy'],
    productionCharacteristics: ['chaotic', 'experimental', 'glitchy'],
    instrumentSignatures: ['chopped-breaks', 'noise', 'glitch'],
    era: { start: 1994, peak: 2005 },
    origins: ['UK', 'USA'],
    musicbrainzTags: ['breakcore', 'drill and bass'],
    characteristics: ['chaotic', 'experimental', 'aggressive', 'complex'],
    relatedSubgenres: ['idm', 'gabber', 'jungle']
  }
}

// =============================================================================
// Classification Functions
// =============================================================================

/**
 * Calculate similarity score between track characteristics and subgenre profile
 */
function calculateSubgenreScore(
  profile: SubgenreProfile,
  bpm: number | null,
  timing: TimingFeel,
  drumGenre: { primary: string; secondary: string[]; subgenres: string[] },
  bassline: { type: BasslineType } | null,
  energy: number | null,
  musicbrainzTags: string[] = [],
  genreHints: string[] = [],
  detectedInstruments: string[] = [],
): { score: number; matchedFeatures: string[] } {
  let score = 0
  const matchedFeatures: string[] = []
  
  // Drum signature match (45 points) — primary identity
  const drumMatches = profile.drumSignatures.filter(sig =>
    drumGenre.primary.toLowerCase().includes(sig.split('-')[0]) ||
    drumGenre.secondary.some(s => s.toLowerCase().includes(sig.split('-')[0]))
  )
  if (drumMatches.length > 0) {
    score += 45 * Math.min(1, drumMatches.length / 2)
    matchedFeatures.push(`drum: ${drumMatches.slice(0, 2).join(', ')}`)
  }
  
  // Timing feel match (15 points)
  if (profile.timingFeel.includes(timing.type)) {
    score += 15
    matchedFeatures.push(`${timing.type} timing`)
  }

  // BPM match (20 points) — after drums
  if (bpm !== null) {
    if (bpm >= profile.bpmRange.min && bpm <= profile.bpmRange.max) {
      const bpmScore = 20 * (1 - Math.abs(bpm - profile.bpmRange.typical) / 30)
      score += Math.max(8, bpmScore)
      matchedFeatures.push(`BPM ${bpm} in range`)
    } else if (Math.abs(bpm - profile.bpmRange.typical) < 15) {
      score += 6
      matchedFeatures.push(`BPM ${bpm} close to range`)
    }
  }
  
  // Bass signature match (20 points) — how bass sits on the grid
  if (bassline) {
    const bassMatches = profile.bassSignatures.filter(sig =>
      bassline.type.toLowerCase().includes(sig.split('-')[0])
    )
    if (bassMatches.length > 0) {
      score += 20
      matchedFeatures.push(`bass: ${bassline.type}`)
    }
  }
  
  // Energy match (3 points) — tie-breaker only
  if (energy !== null) {
    if (energy >= profile.energyRange.min && energy <= profile.energyRange.max) {
      score += 3
      matchedFeatures.push(`energy ${energy}`)
    }
  }
  
  // MusicBrainz tag match (4 points) — never outranks the groove
  const tagMatches = profile.musicbrainzTags.filter(tag =>
    musicbrainzTags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
  )
  if (tagMatches.length > 0) {
    score += 4
    matchedFeatures.push(`tags: ${tagMatches.slice(0, 2).join(', ')}`)
  }
  
  // Genre hint match (5 points)
  const hintMatches = genreHints.filter(hint =>
    profile.name.toLowerCase().includes(hint.toLowerCase()) ||
    profile.aliases.some(a => a.toLowerCase().includes(hint.toLowerCase()))
  )
  if (hintMatches.length > 0) {
    score += 5
    matchedFeatures.push(`hint: ${hintMatches[0]}`)
  }

  // Instrument signature match (8 points) — tie-breaker from measured instrument usage
  if (detectedInstruments.length > 0 && profile.instrumentSignatures?.length) {
    const normalized = detectedInstruments.map((i) => i.toLowerCase().replace(/\s+/g, '-'))
    const instMatches = profile.instrumentSignatures.filter((sig) => {
      const needle = sig.toLowerCase()
      return normalized.some(
        (inst) => inst.includes(needle.split('-')[0]) || needle.includes(inst.split('-')[0]),
      )
    })
    if (instMatches.length > 0) {
      score += Math.min(8, 4 + instMatches.length * 2)
      matchedFeatures.push(`instruments: ${instMatches.slice(0, 3).join(', ')}`)
    }
  }

  // Production characteristics soft match (4 points) — spectral/timbre hints
  if (detectedInstruments.length > 0 && profile.productionCharacteristics?.length) {
    const prodNeedles = ['spacious', 'sound-design', 'minimal', 'analog', 'live', 'organic', 'electronic']
    const instBlob = detectedInstruments.join(' ').toLowerCase()
    const prodMatches = profile.productionCharacteristics.filter((trait) => {
      const t = trait.toLowerCase()
      return prodNeedles.some((p) => t.includes(p) && instBlob.includes(p.split('-')[0]))
    })
    if (prodMatches.length > 0) {
      score += 4
      matchedFeatures.push(`production: ${prodMatches.slice(0, 2).join(', ')}`)
    }
  }
  
  return { score: Math.round(score), matchedFeatures }
}

// Title-based genre keywords mapping (high priority)
const TITLE_GENRE_KEYWORDS: Record<string, string[]> = {
  'dub': ['dub', 'roots_reggae', 'digital_reggae'],
  'reggae': ['roots_reggae', 'dub', 'dancehall'],
  'roots': ['roots_reggae', 'dub'],
  'ska': ['ska', 'rocksteady'],
  'dancehall': ['dancehall', 'digital_reggae'],
  'ragga': ['dancehall', 'digital_reggae', 'jungle'],
  'rasta': ['roots_reggae', 'dub'],
  'rastafari': ['roots_reggae', 'dub'],
  'jah': ['roots_reggae', 'dub'],
  'jahdelicah': ['roots_reggae', 'dub'],  // Spiritual reggae
  'zion': ['roots_reggae', 'dub'],
  'irie': ['roots_reggae', 'dub', 'dancehall'],
  'babylon': ['roots_reggae', 'dub'],
  'nyabinghi': ['roots_reggae'],
  'jamaica': ['roots_reggae', 'dancehall', 'dub'],
  'jamaican': ['roots_reggae', 'dancehall', 'dub'],
  'kingston': ['roots_reggae', 'dancehall', 'dub'],
  'riddim': ['riddim', 'dancehall', 'digital_reggae'],
  'steppers': ['steppers', 'dub'],
  'one drop': ['roots_reggae', 'dub'],
  'rocksteady': ['rocksteady', 'ska'],
  'lovers rock': ['lovers_rock'],
  'lover': ['lovers_rock'],
  'hip hop': ['boom_bap', 'trap', 'lo_fi_hip_hop'],
  'hip-hop': ['boom_bap', 'trap', 'lo_fi_hip_hop'],
  'trap': ['trap', 'drill'],
  'drill': ['drill', 'trap'],
  'house': ['deep_house', 'tech_house', 'classic_house', 'psychedelic_house'],
  'psychedelic': ['psychedelic_house', 'psytrance'],
  'psych house': ['psychedelic_house'],
  'psy house': ['psychedelic_house'],
  'techno': ['detroit_techno', 'minimal_techno', 'acid_techno'],
  'jungle': ['jungle', 'ragga_jungle'],
  'dnb': ['liquid_dnb', 'neurofunk', 'jump_up'],
  'd&b': ['liquid_dnb', 'neurofunk', 'jump_up'],
  'drum and bass': ['liquid_dnb', 'neurofunk', 'jump_up'],
  'dubstep': ['deep_dubstep', 'brostep', 'riddim'],
  'bass': ['uk_bass', 'future_bass', 'deep_dubstep'],
  'garage': ['uk_garage', 'bass_house'],
  'grime': ['grime'],
  'funk': ['g_funk', 'nu_disco'],
  'disco': ['nu_disco', 'classic_house'],
  'soul': ['neo_soul', 'rnb'],
  'jazz': ['nu_jazz', 'lo_fi_hip_hop'],
  'lofi': ['lo_fi_hip_hop'],
  'lo-fi': ['lo_fi_hip_hop'],
  'chill': ['lo_fi_hip_hop', 'ambient_techno'],
  'ambient': ['ambient_techno', 'downtempo'],
  'trance': ['progressive_trance', 'uplifting_trance', 'psytrance'],
  'psytrance': ['psytrance', 'goa_trance'],
  'hardstyle': ['hardstyle', 'hardcore'],
}

/**
 * Extract genre hints from track title
 */
function extractTitleGenreHints(title: string): { subgenres: string[], keywords: string[] } {
  const normalizedTitle = title.toLowerCase()
  const matchedSubgenres: string[] = []
  const matchedKeywords: string[] = []
  
  for (const [keyword, subgenres] of Object.entries(TITLE_GENRE_KEYWORDS)) {
    if (normalizedTitle.includes(keyword)) {
      matchedSubgenres.push(...subgenres)
      matchedKeywords.push(keyword)
    }
  }
  
  return {
    subgenres: Array.from(new Set(matchedSubgenres)),
    keywords: matchedKeywords
  }
}

/**
 * Classify track into subgenres
 */
export function classifySubgenres(
  bpm: number | null,
  timing: TimingFeel,
  drumAnalysis: DrumAnalysisResult | null,
  energy: number | null,
  musicbrainzTags: string[] = [],
  genreHints: string[] = [],
  trackTitle: string = '',
  detectedInstruments: string[] = [],
): SubgenreClassificationResult {
  const scores: { name: string; parent: string; score: number; matchedFeatures: string[] }[] = []
  
  // Title keywords are weak hints only (see score boosts below).
  const titleHints = extractTitleGenreHints(trackTitle)
  const titleBoostSubgenres = new Set(titleHints.subgenres)
  
  // Calculate scores for all subgenres
  for (const [key, profile] of Object.entries(SUBGENRE_PROFILES)) {
    let { score, matchedFeatures } = calculateSubgenreScore(
      profile,
      bpm,
      timing,
      drumAnalysis?.drumGenre || { primary: '', secondary: [], subgenres: [] },
      drumAnalysis?.bassline || null,
      energy,
      musicbrainzTags,
      genreHints,
      detectedInstruments,
    )
    
    // Title is a tie-breaker only (never outranks drum grid / tempo / bass).
    if (titleBoostSubgenres.has(key)) {
      score += 8
      matchedFeatures.push(`title: ${titleHints.keywords.join(', ')}`)
    }
    
    const normalizedTitle = trackTitle.toLowerCase()
    if (normalizedTitle.includes(profile.name.toLowerCase())) {
      score += 6
      matchedFeatures.push(`title-match: ${profile.name}`)
    } else if (profile.aliases.some(a => normalizedTitle.includes(a.toLowerCase()))) {
      score += 5
      matchedFeatures.push(`title-alias: ${profile.aliases.find(a => normalizedTitle.includes(a.toLowerCase()))}`)
    }
    
    if (score >= 30) {
      scores.push({
        name: profile.name,
        parent: profile.parent,
        score,
        matchedFeatures
      })
    }
  }
  
  // Sort by score
  scores.sort((a, b) => b.score - a.score)
  
  // Get primary and secondary subgenres
  const primary = scores[0] || {
    name: 'Electronic',
    parent: 'Electronic',
    score: 30,
    matchedFeatures: ['default']
  }
  
  const secondary = scores.slice(1, 4).map(s => ({
    name: s.name,
    parent: s.parent,
    confidence: s.score / 100,
    matchedFeatures: s.matchedFeatures
  }))
  
  // Generate microgenres (subgenre-specific details)
  const profile = SUBGENRE_PROFILES[primary.name.toLowerCase().replace(/[^a-z]/g, '_')]
  const microgenres = profile?.relatedSubgenres || []
  
  // Generate fusion description if multiple high-scoring genres
  let fusionDescription: string | null = null
  if (secondary.length >= 2 && secondary[0].confidence >= 0.5) {
    fusionDescription = `${primary.name} with ${secondary[0].name} influences and ${secondary[1].name} elements`
  }
  
  // Collect characteristics
  const characteristics: string[] = profile?.characteristics || []
  
  // Determine era
  const era = profile?.era ? `${profile.era.start}s - ${profile.era.peak}s` : null
  
  // Collect origins
  const origins = profile?.origins || []
  
  // Collect compatible MusicBrainz tags
  const musicbrainzCompatibleTags = profile?.musicbrainzTags || []
  
  return {
    primarySubgenre: {
      name: primary.name,
      parent: primary.parent,
      confidence: primary.score / 100,
      matchedFeatures: primary.matchedFeatures
    },
    secondarySubgenres: secondary,
    microgenres,
    fusionDescription,
    characteristics,
    era,
    origins,
    musicbrainzCompatibleTags
  }
}

/**
 * Get all subgenres for a parent genre
 */
export function getSubgenresForParent(parentGenre: string): SubgenreProfile[] {
  return Object.values(SUBGENRE_PROFILES).filter(
    profile => profile.parent.toLowerCase() === parentGenre.toLowerCase()
  )
}

/**
 * Search subgenres by MusicBrainz tag
 */
export function searchByMusicBrainzTag(tag: string): SubgenreProfile[] {
  const tagLower = tag.toLowerCase()
  return Object.values(SUBGENRE_PROFILES).filter(
    profile => profile.musicbrainzTags.some(t => t.toLowerCase().includes(tagLower))
  )
}

/**
 * Get subgenre characteristics string for description
 */
export function getSubgenreDescription(subgenreName: string): string | null {
  const profile = Object.values(SUBGENRE_PROFILES).find(
    p => p.name.toLowerCase() === subgenreName.toLowerCase()
  )
  
  if (!profile) return null
  
  const parts: string[] = [
    `${profile.name} (${profile.parent})`,
    `typically ${profile.bpmRange.typical} BPM`,
    profile.timingFeel.includes('half-time') ? 'half-time feel' : 'full-time feel',
    ...profile.characteristics.slice(0, 3)
  ]
  
  if (profile.origins.length > 0) {
    parts.push(`originated in ${profile.origins[0]}`)
  }
  
  return parts.join(', ')
}

export default classifySubgenres
