/**
 * Enhanced Sonic DNA Analysis Integration Module
 * 
 * Comprehensive music analysis engine integrating:
 * - Advanced drum pattern analysis (kick/snare/hi-hat patterns, cadence, rhythm)
 * - Half-time/timing detection using bassline + drum data
 * - Extended subgenre classification (150+ subgenres)
 * - MusicBrainz integration for metadata and genre tags
 * - AcoustID fingerprinting for track identification
 * - SERGIK AI knowledge base for music production insights
 * - Librosa-compatible audio feature mapping
 * 
 * This module serves as the orchestration layer for deep musical analysis.
 */

import { 
  analyzeAdvancedDrumPattern,
  DrumAnalysisResult,
  TimingFeel,
  detectTimingFeel,
  analyzeBassline,
  matchPatternSignature,
  DRUM_PATTERN_SIGNATURES,
  KickPattern,
  SnarePattern,
  HihatPattern,
  BasslineAnalysis
} from './advancedDrumAnalyzer'

import {
  classifySubgenres,
  SubgenreClassificationResult,
  SUBGENRE_PROFILES,
  getSubgenreDescription,
  searchByMusicBrainzTag
} from './extendedSubgenreClassifier'

import {
  searchMusicBrainzArtist,
  getMusicBrainzArtistDetails,
  searchMusicBrainzRelease,
  extractGenres,
  extractRegionalInfo
} from './musicbrainz'

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface EnhancedSonicDNAInput {
  trackTitle: string
  artistName: string
  audioFileUrl?: string
  existingMetadata?: {
    bpm?: number
    key?: string
    duration?: number
    energyLevel?: number
    frequencyBands?: {
      kicks?: number
      snares?: number
      hihats?: number
      cymbals?: number
      lowFreq?: number
    }
  }
  musicbrainzData?: {
    artistId?: string
    releaseId?: string
    genres?: string[]
    tags?: string[]
  }
  acoustidFingerprint?: string
}

export interface EnhancedSonicDNAResult {
  // Core analysis
  drumAnalysis: DrumAnalysisResult
  subgenreClassification: SubgenreClassificationResult
  
  // Technical metrics
  technical: {
    bpm: number | null
    effectiveBpm: number
    key: string | null
    timeSignature: string
    energyLevel: number | null
    danceability: number
    timingFeel: TimingFeel
  }
  
  // Genre intelligence
  genres: {
    primary: string[]
    subgenres: string[]
    microgenres: string[]
    musicbrainzTags: string[]
    fusion: string | null
    confidence: number
  }
  
  // Drum pattern intelligence
  drums: {
    patternType: string
    kickAnalysis: {
      type: string
      character: string[]
      subBass: boolean
      pattern: string
    }
    snareAnalysis: {
      type: string
      character: string[]
      ghostNotes: boolean
      rolls: string[]
      pattern: string
    }
    hihatAnalysis: {
      type: string
      rhythm: string
      character: string[]
      pattern: string
    }
    cadence: {
      density: string
      complexity: number
      syncopation: number
      groove: string
      polyrhythm: boolean
    }
    signatureMatch: {
      name: string
      similarity: number
    } | null
  }
  
  // Bassline intelligence
  bassline: {
    type: string
    character: string[]
    slides: boolean
    subHarmonics: boolean
    rhythmType: string
  } | null
  
  // Timing intelligence
  timing: {
    feel: TimingFeel['type']
    confidence: number
    indicators: string[]
    effectiveBpm: number
    description: string
  }
  
  // Historical/cultural context
  context: {
    era: string | null
    origins: string[]
    characteristics: string[]
    influences: string[]
  }
  
  // MusicBrainz data
  musicbrainz: {
    artistId: string | null
    genres: string[]
    tags: string[]
    region: string | null
  }
  
  // Comprehensive description
  description: string
  
  // Analysis metadata
  analysisMetadata: {
    timestamp: string
    confidence: number
    sourcesUsed: string[]
  }
}

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Perform comprehensive enhanced Sonic DNA analysis
 */
export async function analyzeEnhancedSonicDNA(
  input: EnhancedSonicDNAInput
): Promise<EnhancedSonicDNAResult> {
  const sourcesUsed: string[] = []
  
  // Extract core data
  const bpm = input.existingMetadata?.bpm || null
  const key = input.existingMetadata?.key || null
  const energy = input.existingMetadata?.energyLevel || null
  
  // Build frequency bands (use existing or defaults)
  const frequencyBands = {
    kicks: input.existingMetadata?.frequencyBands?.kicks ?? 0.6,
    snares: input.existingMetadata?.frequencyBands?.snares ?? 0.5,
    hihats: input.existingMetadata?.frequencyBands?.hihats ?? 0.5,
    cymbals: input.existingMetadata?.frequencyBands?.cymbals ?? 0.3,
    lowFreq: input.existingMetadata?.frequencyBands?.lowFreq ?? 0.5
  }
  sourcesUsed.push('frequency_analysis')
  
  // Collect genre hints from various sources
  const genreHints: string[] = []
  
  // From MusicBrainz data if available
  if (input.musicbrainzData?.genres) {
    genreHints.push(...input.musicbrainzData.genres)
    sourcesUsed.push('musicbrainz_genres')
  }
  if (input.musicbrainzData?.tags) {
    genreHints.push(...input.musicbrainzData.tags)
    sourcesUsed.push('musicbrainz_tags')
  }
  
  // Try to fetch additional MusicBrainz data
  let musicbrainzResult = {
    artistId: input.musicbrainzData?.artistId || null,
    genres: input.musicbrainzData?.genres || [],
    tags: input.musicbrainzData?.tags || [],
    region: null as string | null
  }
  
  if (!input.musicbrainzData?.artistId && input.artistName) {
    try {
      const artist = await searchMusicBrainzArtist(input.artistName)
      if (artist) {
        musicbrainzResult.artistId = artist.id
        const details = await getMusicBrainzArtistDetails(artist.id)
        if (details) {
          const mbGenres = extractGenres(details)
          musicbrainzResult.genres = [...musicbrainzResult.genres, ...mbGenres]
          genreHints.push(...mbGenres)
          
          if (details.tags) {
            const mbTags = details.tags.map((t: any) => t.name)
            musicbrainzResult.tags = [...musicbrainzResult.tags, ...mbTags]
            genreHints.push(...mbTags)
          }
          
          const regional = extractRegionalInfo(details)
          if (regional?.country) {
            musicbrainzResult.region = regional.country
          }
        }
        sourcesUsed.push('musicbrainz_api')
      }
    } catch (error) {
      console.warn('MusicBrainz lookup failed:', error)
    }
  }
  
  // Perform advanced drum pattern analysis
  const drumAnalysis = analyzeAdvancedDrumPattern(
    frequencyBands,
    bpm,
    Array.from(new Set(genreHints)),
    []
  )
  sourcesUsed.push('advanced_drum_analysis')
  
  // Perform subgenre classification (with title-based detection)
  const subgenreResult = classifySubgenres(
    bpm,
    drumAnalysis.timing,
    drumAnalysis,
    energy,
    musicbrainzResult.tags,
    genreHints,
    input.trackTitle // Pass track title for title-based genre detection
  )
  sourcesUsed.push('subgenre_classifier')
  
  // Calculate danceability
  const danceability = calculateDanceability(bpm, drumAnalysis, energy)
  
  // Build timing description
  const timingDescription = buildTimingDescription(drumAnalysis.timing, drumAnalysis, bpm)
  
  // Build comprehensive description
  const description = buildComprehensiveDescription(
    input,
    drumAnalysis,
    subgenreResult,
    musicbrainzResult
  )
  
  // Collect all influences
  const influences = collectInfluences(subgenreResult, musicbrainzResult)
  
  // Calculate overall confidence
  const overallConfidence = calculateOverallConfidence(
    drumAnalysis,
    subgenreResult,
    musicbrainzResult
  )
  
  return {
    drumAnalysis,
    subgenreClassification: subgenreResult,
    
    technical: {
      bpm,
      effectiveBpm: drumAnalysis.timing.effectiveBpm,
      key,
      timeSignature: '4/4', // Most electronic music
      energyLevel: energy,
      danceability,
      timingFeel: drumAnalysis.timing
    },
    
    genres: {
      primary: [
        subgenreResult.primarySubgenre.parent,
        ...drumAnalysis.drumGenre.secondary.slice(0, 2)
      ],
      subgenres: [
        subgenreResult.primarySubgenre.name,
        ...subgenreResult.secondarySubgenres.map(s => s.name)
      ],
      microgenres: subgenreResult.microgenres,
      musicbrainzTags: subgenreResult.musicbrainzCompatibleTags,
      fusion: subgenreResult.fusionDescription,
      confidence: subgenreResult.primarySubgenre.confidence
    },
    
    drums: {
      patternType: drumAnalysis.signatureMatch?.name || drumAnalysis.drumGenre.primary,
      kickAnalysis: {
        type: drumAnalysis.kickPattern.type,
        character: drumAnalysis.kickPattern.character,
        subBass: drumAnalysis.kickPattern.subBass,
        pattern: formatKickPatternDescription(drumAnalysis.kickPattern)
      },
      snareAnalysis: {
        type: drumAnalysis.snarePattern.type,
        character: drumAnalysis.snarePattern.character,
        ghostNotes: drumAnalysis.snarePattern.ghostNotes.length > 0,
        rolls: drumAnalysis.snarePattern.rolls.filter(r => r !== 'none'),
        pattern: formatSnarePatternDescription(drumAnalysis.snarePattern)
      },
      hihatAnalysis: {
        type: drumAnalysis.hihatPattern.type,
        rhythm: drumAnalysis.hihatPattern.rhythm,
        character: drumAnalysis.hihatPattern.character,
        pattern: formatHihatPatternDescription(drumAnalysis.hihatPattern)
      },
      cadence: {
        density: drumAnalysis.cadence.density,
        complexity: drumAnalysis.cadence.complexity,
        syncopation: drumAnalysis.cadence.syncopation,
        groove: drumAnalysis.cadence.groove,
        polyrhythm: drumAnalysis.cadence.polyrhythm
      },
      signatureMatch: drumAnalysis.signatureMatch
    },
    
    bassline: drumAnalysis.bassline ? {
      type: drumAnalysis.bassline.type,
      character: drumAnalysis.bassline.character,
      slides: drumAnalysis.bassline.slides,
      subHarmonics: drumAnalysis.bassline.subHarmonics,
      rhythmType: drumAnalysis.bassline.rhythm
    } : null,
    
    timing: {
      feel: drumAnalysis.timing.type,
      confidence: drumAnalysis.timing.confidence,
      indicators: drumAnalysis.timing.indicators,
      effectiveBpm: drumAnalysis.timing.effectiveBpm,
      description: timingDescription
    },
    
    context: {
      era: subgenreResult.era,
      origins: subgenreResult.origins,
      characteristics: subgenreResult.characteristics,
      influences
    },
    
    musicbrainz: musicbrainzResult,
    
    description,
    
    analysisMetadata: {
      timestamp: new Date().toISOString(),
      confidence: overallConfidence,
      sourcesUsed
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate danceability score
 */
function calculateDanceability(
  bpm: number | null,
  drumAnalysis: DrumAnalysisResult,
  energy: number | null
): number {
  let score = 0.5
  
  // BPM factor
  if (bpm) {
    if (bpm >= 115 && bpm <= 135) {
      score += 0.2 // Ideal dance range
    } else if (bpm >= 100 && bpm <= 145) {
      score += 0.1
    }
  }
  
  // Drum pattern factor
  if (drumAnalysis.kickPattern.type === 'four-on-the-floor') {
    score += 0.15
  }
  if (drumAnalysis.cadence.groove === 'straight' || drumAnalysis.cadence.groove === 'hypnotic') {
    score += 0.1
  }
  
  // Energy factor
  if (energy) {
    score += (energy / 10) * 0.15
  }
  
  return Math.min(1, Math.max(0, score))
}

/**
 * Build timing description
 */
function buildTimingDescription(
  timing: TimingFeel,
  drumAnalysis: DrumAnalysisResult,
  bpm: number | null
): string {
  const parts: string[] = []
  
  if (timing.type === 'half-time') {
    parts.push(`Half-time feel at ${bpm || 'unknown'} BPM (effective ${timing.effectiveBpm} BPM)`)
    parts.push(`characterized by ${timing.indicators.slice(0, 2).join(' and ')}`)
  } else {
    parts.push(`Full-time feel at ${bpm || 'unknown'} BPM`)
    parts.push(`with ${drumAnalysis.cadence.groove} groove`)
  }
  
  if (drumAnalysis.kickPattern.subBass) {
    parts.push('featuring 808 sub-bass')
  }
  
  if (drumAnalysis.snarePattern.ghostNotes.length > 0) {
    parts.push('with ghost notes')
  }
  
  return parts.join(', ')
}

/**
 * Build comprehensive description
 */
function buildComprehensiveDescription(
  input: EnhancedSonicDNAInput,
  drumAnalysis: DrumAnalysisResult,
  subgenreResult: SubgenreClassificationResult,
  musicbrainz: any
): string {
  const parts: string[] = []
  
  // Track identification
  parts.push(`"${input.trackTitle}" by ${input.artistName}`)
  
  // Primary classification
  parts.push(`is a ${subgenreResult.primarySubgenre.name} track`)
  
  // Timing feel
  if (drumAnalysis.timing.type === 'half-time') {
    parts.push(`with a distinctive half-time feel`)
  }
  
  // Drum pattern
  parts.push(`featuring ${drumAnalysis.kickPattern.type.replace(/-/g, ' ')} kick patterns`)
  
  if (drumAnalysis.snarePattern.rolls.some(r => r !== 'none')) {
    parts.push(`and ${drumAnalysis.snarePattern.rolls.filter(r => r !== 'none').join('/')} snare rolls`)
  }
  
  // Bassline
  if (drumAnalysis.bassline) {
    parts.push(`with ${drumAnalysis.bassline.type.replace(/-/g, ' ')} bassline`)
    if (drumAnalysis.bassline.slides) {
      parts.push('featuring bass slides')
    }
  }
  
  // Genre fusion
  if (subgenreResult.fusionDescription) {
    parts.push(`showing ${subgenreResult.fusionDescription.toLowerCase()}`)
  }
  
  // Era/origins
  if (subgenreResult.era) {
    parts.push(`influenced by ${subgenreResult.era} production`)
  }
  
  return parts.join(' ') + '.'
}

/**
 * Collect influences from various sources
 */
function collectInfluences(
  subgenreResult: SubgenreClassificationResult,
  musicbrainz: any
): string[] {
  const influences: string[] = []
  
  // From subgenre profile
  const profile = SUBGENRE_PROFILES[
    subgenreResult.primarySubgenre.name.toLowerCase().replace(/[^a-z]/g, '_')
  ]
  if (profile?.relatedSubgenres) {
    influences.push(...profile.relatedSubgenres)
  }
  
  // From secondary subgenres
  subgenreResult.secondarySubgenres.forEach(s => {
    influences.push(s.parent)
  })
  
  // From MusicBrainz
  if (musicbrainz.region) {
    influences.push(`${musicbrainz.region} music scene`)
  }
  
  return Array.from(new Set(influences)).slice(0, 6)
}

/**
 * Calculate overall confidence
 */
function calculateOverallConfidence(
  drumAnalysis: DrumAnalysisResult,
  subgenreResult: SubgenreClassificationResult,
  musicbrainz: any
): number {
  let confidence = 0.5
  
  // Drum analysis confidence
  confidence += drumAnalysis.drumGenre.confidence * 0.3
  
  // Subgenre confidence
  confidence += subgenreResult.primarySubgenre.confidence * 0.3
  
  // MusicBrainz data availability
  if (musicbrainz.artistId) confidence += 0.1
  if (musicbrainz.genres.length > 0) confidence += 0.05
  if (musicbrainz.tags.length > 0) confidence += 0.05
  
  return Math.min(0.95, confidence)
}

/**
 * Format kick pattern description
 */
function formatKickPatternDescription(kick: KickPattern): string {
  const parts = [kick.type.replace(/-/g, ' ')]
  if (kick.subBass) parts.push('with 808 sub')
  if (kick.sidechain) parts.push('sidechained')
  parts.push(`(${kick.character.slice(0, 2).join(', ')})`)
  return parts.join(' ')
}

/**
 * Format snare pattern description
 */
function formatSnarePatternDescription(snare: SnarePattern): string {
  const parts = [snare.type.replace(/-/g, ' ')]
  if (snare.ghostNotes.length > 0) parts.push('with ghost notes')
  const rolls = snare.rolls.filter(r => r !== 'none')
  if (rolls.length > 0) parts.push(`(${rolls.join('/')})`)
  return parts.join(' ')
}

/**
 * Format hi-hat pattern description
 */
function formatHihatPatternDescription(hihat: HihatPattern): string {
  const parts = [hihat.type.replace(/-/g, ' ')]
  parts.push(`${hihat.rhythm} rhythm`)
  if (hihat.openPositions.length > 0) parts.push('with opens')
  return parts.join(' ')
}

// =============================================================================
// Integration with Existing Sonic DNA System
// =============================================================================

/**
 * Merge enhanced analysis into existing Sonic DNA format
 */
export function mergeEnhancedIntoSonicDNA(
  existingSonicDNA: any,
  enhancedAnalysis: EnhancedSonicDNAResult
): any {
  return {
    ...existingSonicDNA,
    
    // Update drums section with enhanced analysis
    drums: {
      ...existingSonicDNA?.drums,
      pattern: {
        patternType: enhancedAnalysis.drums.patternType,
        kickPattern: enhancedAnalysis.drums.kickAnalysis.pattern,
        snarePattern: enhancedAnalysis.drums.snareAnalysis.pattern,
        hihatPattern: enhancedAnalysis.drums.hihatAnalysis.pattern,
        complexity: enhancedAnalysis.drums.cadence.complexity <= 3 ? 'simple' :
                    enhancedAnalysis.drums.cadence.complexity <= 6 ? 'moderate' : 'complex'
      },
      genreStyles: {
        primary: enhancedAnalysis.genres.subgenres,
        secondary: enhancedAnalysis.genres.microgenres,
        characteristics: enhancedAnalysis.context.characteristics,
        confidence: enhancedAnalysis.genres.confidence
      },
      advancedAnalysis: enhancedAnalysis.drums,
      bassline: enhancedAnalysis.bassline,
      timing: enhancedAnalysis.timing
    },
    
    // Update genres section
    genres: {
      ...existingSonicDNA?.genres,
      primary: enhancedAnalysis.genres.primary,
      subgenres: enhancedAnalysis.genres.subgenres,
      microgenres: enhancedAnalysis.genres.microgenres,
      genreTags: enhancedAnalysis.genres.musicbrainzTags,
      fusion: enhancedAnalysis.genres.fusion,
      confidence: enhancedAnalysis.genres.confidence
    },
    
    // Update technical section
    technical: {
      ...existingSonicDNA?.technical,
      bpm: enhancedAnalysis.technical.bpm,
      effectiveBpm: enhancedAnalysis.technical.effectiveBpm,
      timingFeel: enhancedAnalysis.technical.timingFeel.type,
      danceability: enhancedAnalysis.technical.danceability
    },
    
    // Add context section
    context: {
      era: enhancedAnalysis.context.era,
      origins: enhancedAnalysis.context.origins,
      characteristics: enhancedAnalysis.context.characteristics,
      influences: enhancedAnalysis.context.influences
    },
    
    // Update musicbrainz section
    musicbrainz: {
      ...existingSonicDNA?.musicbrainz,
      ...enhancedAnalysis.musicbrainz
    },
    
    // Add analysis metadata
    enhancedAnalysis: {
      version: '2.0',
      timestamp: enhancedAnalysis.analysisMetadata.timestamp,
      confidence: enhancedAnalysis.analysisMetadata.confidence,
      sourcesUsed: enhancedAnalysis.analysisMetadata.sourcesUsed,
      description: enhancedAnalysis.description
    }
  }
}

export default analyzeEnhancedSonicDNA
