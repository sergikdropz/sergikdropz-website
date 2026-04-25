/**
 * Comprehensive Music Analysis
 * Integrates multiple APIs and analysis methods for complete musicological research
 * 
 * Enhanced with:
 * - Advanced drum pattern analysis (kick/snare/hi-hat patterns)
 * - Half-time/timing detection using bassline + drum data
 * - Extended subgenre classification (150+ subgenres)
 * - MusicBrainz integration
 * - SERGIK AI knowledge base
 */

import { searchMusicBrainzArtist, getMusicBrainzArtistDetails, searchMusicBrainzRelease, extractGenres, extractRegionalInfo } from './musicbrainz'
import { analyzeAdvancedDrumPattern, detectTimingFeel, DrumAnalysisResult } from './advancedDrumAnalyzer'
import { classifySubgenres, SubgenreClassificationResult } from './extendedSubgenreClassifier'

export interface ComprehensiveMusicAnalysis {
  // Technical Audio Features
  technical: {
    bpm: number | null
    key: {
      key: string // e.g., "C", "A"
      mode: 'major' | 'minor' | null // or scale type
      confidence: number
    }
    timeSignature: string // e.g., "4/4", "3/4"
    tempo: {
      bpm: number
      tempoClass: 'very-slow' | 'slow' | 'medium' | 'fast' | 'very-fast'
      swing: boolean
    }
    energy: {
      level: number // 0-1
      dynamicRange: number
      peakEnergy: number
    }
    danceability: number // 0-1
    valence: number // 0-1 (positivity)
    acousticness: number // 0-1
    instrumentalness: number // 0-1
    liveness: number // 0-1
    speechiness: number // 0-1
  }

  // Drum Pattern Analysis
  drums: {
    pattern: {
      kickPattern: string // e.g., "4/4 on-beat"
      snarePattern: string
      hihatPattern: string
      patternType: 'four-on-the-floor' | 'breakbeat' | 'drum-and-bass' | 'house' | 'techno' | 'other'
      complexity: 'simple' | 'moderate' | 'complex'
    }
    frequency: {
      kickFrequency: number // Hz
      snareFrequency: number
      hihatFrequency: number
    }
    timing: {
      swingAmount: number // 0-1
      groove: string
      syncopation: number // 0-1
    }
    genreStyles: {
      primary: string[] // Primary drum genre styles (e.g., ["House", "Four-on-the-Floor"])
      secondary: string[] // Secondary styles
      characteristics: string[] // Specific characteristics (e.g., ["Driving kick", "Open hi-hats"])
      confidence: number // 0-1
    }
  }

  // Harmonic Analysis
  harmony: {
    keySignature: string
    chordProgression: string[]
    scale: string
    tonality: 'major' | 'minor' | 'modal' | 'atonal'
    harmonicComplexity: 'simple' | 'moderate' | 'complex'
    chordTypes: string[] // e.g., ["major", "minor", "dominant7"]
  }

  // Genre Classification
  genres: {
    primary: string[]
    secondary: string[]
    subgenres: string[]
    microgenres: string[]
    genreTags: string[]
    confidence: number
    fusion: string // Description of genre fusion
  }

  // MusicBrainz Metadata
  musicbrainz: {
    artistId: string | null
    releaseId: string | null
    artistInfo: {
      name: string
      area: string | null
      country: string | null
      genres: string[]
      tags: string[]
      aliases: string[]
      type: string | null // Person, Group, etc.
    }
    releaseInfo: {
      title: string | null
      date: string | null
      country: string | null
      label: string | null
      releaseGroupType: string | null
    }
  }

  // Musicological Analysis
  musicology: {
    era: {
      decade: string | null
      eraInfluences: string[]
      historicalPeriod: string | null
    }
    style: {
      primaryStyle: string
      styleCharacteristics: string[]
      stylisticInfluences: string[]
    }
    production: {
      techniques: string[]
      equipment: string[] // Inferred or known
      productionEra: string | null
    }
  }

  // Regional & Cultural
  cultural: {
    regions: string[]
    culturalInfluences: string[]
    regionalCharacteristics: string
    crossCulturalElements: string[]
  }

  // Summary
  summary: string
  
  // Audio file reference (optional, for waveform generation)
  audioFileUrl?: string
  filePath?: string
}

/**
 * Perform comprehensive music analysis
 */
export async function analyzeComprehensive(
  trackTitle: string,
  artistName: string,
  audioFileUrl: string,
  existingMetadata?: {
    bpm?: number
    key?: string
    duration?: number
    energyLevel?: number
    frequencyBands?: any
  }
): Promise<ComprehensiveMusicAnalysis> {
  console.log('Starting comprehensive analysis for:', { trackTitle, artistName })

  // Step 1: MusicBrainz lookup
  const musicbrainzData = await fetchMusicBrainzData(artistName, trackTitle)

  // Step 2: Audio analysis (if audio file available)
  const audioAnalysis = existingMetadata ? {
    bpm: existingMetadata.bpm || null,
    key: existingMetadata.key ? parseKey(existingMetadata.key) : null,
    duration: existingMetadata.duration || 0,
    energy: existingMetadata.energyLevel || 0,
    frequencyBands: existingMetadata.frequencyBands || {}
  } : null

  // Step 3: Analyze drum patterns (from frequency bands if available)
  // Collect genre hints from MusicBrainz data
  const genreHints = [
    ...(musicbrainzData?.artistInfo?.genres || []),
    ...(musicbrainzData?.artistInfo?.tags || [])
  ]
  const drumAnalysis = audioAnalysis?.frequencyBands ? analyzeDrumPattern(audioAnalysis.frequencyBands, audioAnalysis.bpm, genreHints) : null

  // Step 4: Genre classification (combine MusicBrainz + audio features)
  const genreAnalysis = classifyGenres(musicbrainzData, audioAnalysis)

  // Step 5: Musicological analysis
  const musicology = analyzeMusicology(musicbrainzData, audioAnalysis, genreAnalysis)

  // Step 6: Cultural analysis
  const cultural = analyzeCultural(musicbrainzData)

  // Step 7: Build comprehensive summary
  const summary = buildSummary(trackTitle, artistName, audioAnalysis, genreAnalysis, musicology)

  return {
    technical: {
      bpm: audioAnalysis?.bpm || null,
      key: audioAnalysis?.key || { key: 'Unknown', mode: null, confidence: 0 },
      timeSignature: inferTimeSignature(audioAnalysis?.bpm),
      tempo: {
        bpm: audioAnalysis?.bpm || 0,
        tempoClass: classifyTempo(audioAnalysis?.bpm),
        swing: false // Would need audio analysis
      },
      energy: {
        level: audioAnalysis?.energy || 0,
        dynamicRange: 0, // Would need audio analysis
        peakEnergy: 0 // Would need audio analysis
      },
      danceability: calculateDanceability(audioAnalysis),
      valence: 0.5, // Would need audio analysis
      acousticness: 0, // Would need audio analysis
      instrumentalness: 0, // Would need audio analysis
      liveness: 0, // Would need audio analysis
      speechiness: 0 // Would need audio analysis
    },
    drums: (drumAnalysis as any) || {
      pattern: {
        kickPattern: 'Unknown',
        snarePattern: 'Unknown',
        hihatPattern: 'Unknown',
        patternType: 'other',
        complexity: 'moderate'
      },
      frequency: {
        kickFrequency: 0,
        snareFrequency: 0,
        hihatFrequency: 0
      },
      timing: {
        swingAmount: 0,
        groove: 'straight',
        syncopation: 0
      },
      genreStyles: {
        primary: [],
        secondary: [],
        characteristics: [],
        confidence: 0
      }
    },
    harmony: {
      keySignature: audioAnalysis?.key?.key || 'Unknown',
      chordProgression: [],
      scale: audioAnalysis?.key?.mode || 'major',
      tonality: (audioAnalysis?.key?.mode === 'minor' ? 'minor' : 'major') as any,
      harmonicComplexity: 'moderate',
      chordTypes: []
    },
    genres: genreAnalysis,
    musicbrainz: musicbrainzData,
    musicology,
    cultural,
    summary,
    audioFileUrl,
    filePath: audioFileUrl // For backward compatibility
  }
}

/**
 * Fetch comprehensive MusicBrainz data
 */
async function fetchMusicBrainzData(artistName: string, trackTitle: string) {
  const artist = await searchMusicBrainzArtist(artistName)
  let artistDetails = null
  let releaseInfo = null

  if (artist) {
    artistDetails = await getMusicBrainzArtistDetails(artist.id)
    releaseInfo = await searchMusicBrainzRelease(artistName, trackTitle)
  }

  return {
    artistId: artist?.id || null,
    releaseId: releaseInfo?.id || null,
    artistInfo: {
      name: artistDetails?.name || artistName,
      area: artistDetails?.area?.name || null,
      country: artistDetails?.area?.['iso-3166-1-codes']?.[0] || null,
      genres: extractGenres(artistDetails),
      tags: artistDetails?.tags?.map((t: any) => t.name) || [],
      aliases: artistDetails?.['aliases']?.map((a: any) => a.name) || [],
      type: artistDetails?.type || null
    },
    releaseInfo: {
      title: releaseInfo?.title || null,
      date: releaseInfo?.date || null,
      country: releaseInfo?.country || null,
      label: releaseInfo?.['label-info']?.[0]?.label?.name || null,
      releaseGroupType: releaseInfo?.['release-group']?.['primary-type'] || null
    }
  }
}

/**
 * Analyze drum patterns from frequency bands and classify genre styles
 * Enhanced with advanced drum pattern analysis
 */
function analyzeDrumPattern(frequencyBands: any, bpm: number | null = null, genreHints: string[] = []) {
  const kicks = frequencyBands.kicks || 0
  const snares = frequencyBands.snares || 0
  const hihats = frequencyBands.hihats || 0
  const cymbals = frequencyBands.cymbals || 0
  const lowFreq = frequencyBands.lowFreq || 0.5

  // Use advanced drum pattern analysis
  const advancedAnalysis = analyzeAdvancedDrumPattern(
    { kicks, snares, hihats, cymbals, lowFreq },
    bpm,
    genreHints
  )

  // Map advanced pattern type to legacy format for compatibility
  let patternType: 'four-on-the-floor' | 'breakbeat' | 'drum-and-bass' | 'house' | 'techno' | 'other' = 'other'
  const kickType = advancedAnalysis.kickPattern.type
  
  if (kickType === 'four-on-the-floor') {
    patternType = bpm && bpm >= 130 ? 'techno' : 'house'
  } else if (kickType === 'breakbeat' || kickType === 'jungle') {
    patternType = bpm && bpm >= 160 ? 'drum-and-bass' : 'breakbeat'
  } else if (kickType === 'boom-bap' || kickType === '808-trap' || kickType === 'halftime-dnb') {
    patternType = 'other' // Half-time patterns
  }
  
  // Override with specific pattern detection
  if (kicks > 0.7 && hihats > 0.5 && advancedAnalysis.timing.type === 'full-time') {
    patternType = 'four-on-the-floor'
  }

  // Build enhanced genre styles using advanced analysis
  const genreStyles = {
    primary: advancedAnalysis.drumGenre.subgenres.length > 0 
      ? advancedAnalysis.drumGenre.subgenres 
      : [advancedAnalysis.drumGenre.primary, ...advancedAnalysis.drumGenre.secondary],
    secondary: advancedAnalysis.characteristics.slice(0, 5),
    characteristics: [
      ...advancedAnalysis.kickPattern.character,
      advancedAnalysis.cadence.groove,
      advancedAnalysis.timing.type === 'half-time' ? 'half-time feel' : 'full-time feel'
    ],
    confidence: advancedAnalysis.drumGenre.confidence
  }

  return {
    pattern: {
      kickPattern: advancedAnalysis.kickPattern.type.replace(/-/g, ' '),
      snarePattern: advancedAnalysis.snarePattern.type.replace(/-/g, ' '),
      hihatPattern: advancedAnalysis.hihatPattern.type.replace(/-/g, ' '),
      patternType,
      complexity: advancedAnalysis.cadence.complexity <= 3 ? 'simple' : 
                  advancedAnalysis.cadence.complexity <= 6 ? 'moderate' : 'complex'
    },
    frequency: {
      kickFrequency: 60,
      snareFrequency: 200,
      hihatFrequency: 8000
    },
    timing: {
      swingAmount: advancedAnalysis.cadence.syncopation / 100,
      groove: advancedAnalysis.cadence.groove,
      syncopation: advancedAnalysis.cadence.syncopation / 100
    },
    genreStyles,
    // Include advanced analysis for downstream consumers
    advancedAnalysis: {
      kickPattern: advancedAnalysis.kickPattern,
      snarePattern: advancedAnalysis.snarePattern,
      hihatPattern: advancedAnalysis.hihatPattern,
      cadence: advancedAnalysis.cadence,
      timing: advancedAnalysis.timing,
      bassline: advancedAnalysis.bassline,
      signatureMatch: advancedAnalysis.signatureMatch,
      description: advancedAnalysis.description
    }
  }
}

/**
 * Classify drum genre styles based on pattern characteristics and BPM
 */
function classifyDrumGenreStyles(
  kicks: number,
  snares: number,
  hihats: number,
  cymbals: number,
  bpm: number | null,
  patternType: string
): {
  primary: string[]
  secondary: string[]
  characteristics: string[]
  confidence: number
} {
  const primary: string[] = []
  const secondary: string[] = []
  const characteristics: string[] = []
  let confidence = 0.5

  // Analyze based on pattern type
  if (patternType === 'four-on-the-floor') {
    primary.push('Four-on-the-Floor', 'House')
    if (bpm && bpm >= 120 && bpm <= 130) {
      primary.push('Disco')
      secondary.push('Classic House', 'Garage')
    }
    if (hihats > 0.6) {
      characteristics.push('Driving kick pattern', 'Open hi-hats', 'Steady rhythm')
      confidence = 0.8
    }
  }

  if (patternType === 'house') {
    primary.push('House')
    if (bpm && bpm >= 120 && bpm <= 128) {
      primary.push('Deep House', 'Classic House')
    }
    if (hihats > 0.5 && snares > 0.3) {
      characteristics.push('Shuffle hi-hats', 'Snare backbeat', 'Groovy rhythm')
      confidence = 0.75
    }
  }

  if (patternType === 'techno') {
    primary.push('Techno')
    if (bpm && bpm >= 128 && bpm <= 140) {
      primary.push('Detroit Techno', 'Minimal Techno')
    }
    if (kicks > 0.8 && hihats < 0.3) {
      characteristics.push('Heavy kick', 'Minimal hi-hats', 'Driving bass')
      confidence = 0.8
    }
  }

  if (patternType === 'breakbeat') {
    primary.push('Breakbeat')
    if (bpm && bpm >= 130 && bpm <= 150) {
      primary.push('Drum & Bass', 'Jungle')
      secondary.push('Breakbeat Hardcore')
    }
    if (snares > 0.6 && kicks > 0.4) {
      characteristics.push('Complex snare patterns', 'Syncopated kicks', 'Rolling breaks')
      confidence = 0.75
    }
  }

  // BPM-based classification
  if (bpm) {
    if (bpm >= 140 && bpm <= 180) {
      if (kicks > 0.6 && snares > 0.5) {
        primary.push('Drum & Bass', 'Jungle')
        secondary.push('Hardcore', 'Gabber')
        characteristics.push('Fast tempo', 'Complex breaks', 'High energy')
        confidence = 0.85
      }
    } else if (bpm >= 128 && bpm <= 140) {
      if (kicks > 0.7) {
        primary.push('Trance', 'Progressive House')
        secondary.push('Big Room', 'Festival House')
        characteristics.push('Uplifting tempo', 'Driving bass')
        confidence = 0.7
      }
    } else if (bpm >= 100 && bpm <= 120) {
      if (snares > 0.5 && kicks > 0.4) {
        // Check for halftime characteristics
        const isHalfTime = detectHalfTimeFromPattern(patternType, kicks, snares, hihats, bpm)
        if (isHalfTime) {
          primary.push('Hip Hop', 'Trap')
          secondary.push('Boom Bap', 'Lo-Fi')
          characteristics.push('Half-time feel', 'Laid-back groove', 'Snare backbeat', 'Syncopated')
          confidence = 0.8
        } else {
          primary.push('Hip Hop', 'Trap')
          secondary.push('Boom Bap', 'Lo-Fi')
          characteristics.push('Laid-back groove', 'Snare backbeat', 'Syncopated')
          confidence = 0.75
        }
      }
    } else if (bpm >= 90 && bpm <= 110) {
      if (snares > 0.4 && hihats > 0.3) {
        // Strong halftime indicator in this BPM range
        const isHalfTime = detectHalfTimeFromPattern(patternType, kicks, snares, hihats, bpm)
        if (isHalfTime || hihats > 0.5) {
          primary.push('Trap', 'Hip Hop')
          secondary.push('Southern Hip Hop', 'Crunk', 'Half-time')
          characteristics.push('Half-time feel', 'Slow tempo', 'Heavy 808s', 'Triplet hi-hats')
          confidence = 0.85
        } else {
          primary.push('Trap', 'Hip Hop')
          secondary.push('Southern Hip Hop', 'Crunk')
          characteristics.push('Slow tempo', 'Heavy 808s', 'Triplet hi-hats')
          confidence = 0.7
        }
      }
    } else if (bpm >= 60 && bpm <= 90) {
      if (snares > 0.3) {
        // Very likely halftime in this range
        primary.push('Downtempo', 'Trip Hop', 'Half-time')
        secondary.push('Ambient', 'Chillout', 'Hip Hop')
        characteristics.push('Half-time feel', 'Relaxed tempo', 'Atmospheric', 'Minimal drums')
        confidence = 0.75
      } else {
        // Even without strong snares, low BPM suggests halftime
        primary.push('Downtempo', 'Ambient')
        secondary.push('Half-time', 'Chillout')
        characteristics.push('Half-time feel', 'Relaxed tempo', 'Atmospheric')
        confidence = 0.7
      }
    }
  }

  // Frequency-based classification
  if (kicks > 0.7 && snares < 0.3 && hihats < 0.3) {
    primary.push('Minimal Techno', 'Industrial')
    characteristics.push('Kick-focused', 'Sparse arrangement')
    confidence = 0.7
  }

  if (snares > 0.7 && kicks > 0.5) {
    primary.push('Breakbeat', 'Jungle')
    secondary.push('Drum & Bass', 'Hardcore')
    characteristics.push('Snare-heavy', 'Complex breaks')
    confidence = 0.8
  }

  if (hihats > 0.7 && kicks > 0.5) {
    primary.push('House', 'Garage')
    secondary.push('UK Garage', '2-Step')
    characteristics.push('Hi-hat focused', 'Shuffle rhythm')
    confidence = 0.75
  }

  if (cymbals > 0.6) {
    secondary.push('Rock', 'Live Drums', 'Acoustic')
    characteristics.push('Cymbal-heavy', 'Natural sound')
    confidence = 0.6
  }

  // Pattern complexity analysis
  const complexity = (kicks + snares + hihats + cymbals) / 4
  if (complexity > 0.7) {
    characteristics.push('Complex arrangement', 'Layered percussion')
    secondary.push('Progressive', 'Experimental')
  } else if (complexity < 0.3) {
    characteristics.push('Minimal arrangement', 'Sparse drums')
    secondary.push('Minimal', 'Ambient')
  }

  // Remove duplicates and ensure we have results
  const uniquePrimary = Array.from(new Set(primary))
  const uniqueSecondary = Array.from(new Set(secondary))
  const uniqueCharacteristics = Array.from(new Set(characteristics))

  // If no primary styles found, add generic ones
  if (uniquePrimary.length === 0) {
    if (bpm && bpm > 120) {
      uniquePrimary.push('Electronic')
    } else {
      uniquePrimary.push('Acoustic', 'Organic')
    }
    confidence = 0.4
  }

  return {
    primary: uniquePrimary,
    secondary: uniqueSecondary,
    characteristics: uniqueCharacteristics,
    confidence: Math.min(confidence, 0.95) // Cap at 0.95
  }
}

/**
 * Detect halftime from pattern characteristics
 */
function detectHalfTimeFromPattern(
  patternType: string,
  kicks: number,
  snares: number,
  hihats: number,
  bpm: number
): boolean {
  // Pattern type indicators
  const patternLower = patternType.toLowerCase()
  if (patternLower.includes('half') || patternLower.includes('trap') || patternLower.includes('hip-hop')) {
    return true
  }
  
  // BPM-based detection
  if (bpm < 100) {
    // Check for trap/hip-hop characteristics
    if (hihats > 0.4 && snares > 0.3) {
      // High hi-hat activity with moderate snares suggests trap halftime
      return true
    }
    if (kicks > 0.5 && snares > 0.4 && bpm < 90) {
      // Strong kick/snare pattern at low BPM suggests halftime
      return true
    }
  }
  
  // Very low BPM is almost always halftime
  if (bpm < 85) {
    return true
  }
  
  return false
}

/**
 * Classify genres from multiple sources
 */
function classifyGenres(musicbrainzData: any, audioAnalysis: any) {
  const genres: string[] = []
  const subgenres: string[] = []
  const tags: string[] = []

  // From MusicBrainz
  if (musicbrainzData.artistInfo.genres) {
    genres.push(...musicbrainzData.artistInfo.genres)
  }
  if (musicbrainzData.artistInfo.tags) {
    tags.push(...musicbrainzData.artistInfo.tags)
  }

  // From audio features (BPM-based genre inference)
  if (audioAnalysis?.bpm) {
    const bpmGenres = inferGenresFromBPM(audioAnalysis.bpm)
    genres.push(...bpmGenres)
  }

  // Remove duplicates
  const uniqueGenres = Array.from(new Set(genres))
  const uniqueTags = Array.from(new Set(tags))

  return {
    primary: uniqueGenres.slice(0, 3),
    secondary: uniqueGenres.slice(3, 6),
    subgenres: subgenres,
    microgenres: [],
    genreTags: uniqueTags,
    confidence: uniqueGenres.length > 0 ? 0.8 : 0.3,
    fusion: uniqueGenres.length > 1 ? `${uniqueGenres.slice(0, 2).join(' + ')} fusion` : 'Single genre'
  }
}

/**
 * Infer genres from BPM
 */
function inferGenresFromBPM(bpm: number): string[] {
  const genres: string[] = []
  
  if (bpm >= 120 && bpm <= 130) {
    genres.push('House', 'Disco')
  } else if (bpm >= 128 && bpm <= 135) {
    genres.push('Techno', 'Trance')
  } else if (bpm >= 140 && bpm <= 150) {
    genres.push('Drum and Bass', 'Dubstep')
  } else if (bpm >= 150 && bpm <= 180) {
    genres.push('Hardcore', 'Gabber')
  } else if (bpm >= 90 && bpm <= 110) {
    genres.push('Hip Hop', 'Trap')
  } else if (bpm >= 60 && bpm <= 90) {
    genres.push('Downtempo', 'Ambient')
  }

  return genres
}

/**
 * Analyze musicological aspects
 */
function analyzeMusicology(musicbrainzData: any, audioAnalysis: any, genreAnalysis: any) {
  const decade = musicbrainzData?.releaseInfo?.date ? 
    Math.floor(parseInt(musicbrainzData.releaseInfo.date.substring(0, 4)) / 10) * 10 : null

  const tags = musicbrainzData?.artistInfo?.tags || []
  const styleCharacteristics = genreAnalysis?.genreTags || []
  const stylisticInfluences = Array.isArray(tags) ? tags.slice(0, 5) : []

  return {
    era: {
      decade: decade ? `${decade}s` : null,
      eraInfluences: decade ? [`${decade}s ${genreAnalysis?.primary?.[0] || 'Electronic'}`] : [],
      historicalPeriod: decade ? getHistoricalPeriod(decade) : null
    },
    style: {
      primaryStyle: genreAnalysis?.primary?.[0] || 'Electronic',
      styleCharacteristics: styleCharacteristics.slice(0, 5),
      stylisticInfluences: stylisticInfluences
    },
    production: {
      techniques: inferProductionTechniques(genreAnalysis, audioAnalysis),
      equipment: [],
      productionEra: decade ? `${decade}s` : null
    }
  }
}

/**
 * Analyze cultural aspects
 */
function analyzeCultural(musicbrainzData: any) {
  const regions: string[] = []
  const artistInfo = musicbrainzData?.artistInfo || {}
  
  if (artistInfo.area) {
    regions.push(artistInfo.area)
  }
  if (artistInfo.country) {
    regions.push(artistInfo.country)
  }

  const tags = artistInfo.tags || []
  const culturalInfluences = Array.isArray(tags) ? tags.filter((tag: string) => 
    tag && typeof tag === 'string' && (
      tag.toLowerCase().includes('african') || 
      tag.toLowerCase().includes('latin') ||
      tag.toLowerCase().includes('asian') ||
      tag.toLowerCase().includes('european') ||
      tag.toLowerCase().includes('american') ||
      tag.toLowerCase().includes('caribbean')
    )
  ) : []

  return {
    regions: Array.from(new Set(regions)),
    culturalInfluences: culturalInfluences,
    regionalCharacteristics: artistInfo.area ? 
      `Music from ${artistInfo.area}` : 'Unknown origin',
    crossCulturalElements: []
  }
}

/**
 * Build comprehensive summary
 */
function buildSummary(
  trackTitle: string,
  artistName: string,
  audioAnalysis: any,
  genreAnalysis: any,
  musicology: any
): string {
  const parts: string[] = []
  
  parts.push(`${trackTitle} by ${artistName}`)
  
  if (audioAnalysis?.bpm) {
    parts.push(`features a ${audioAnalysis.bpm} BPM ${classifyTempo(audioAnalysis.bpm)} tempo`)
  }
  
  if (genreAnalysis.primary.length > 0) {
    parts.push(`classified as ${genreAnalysis.primary.join(' and ')}`)
  }
  
  if (musicology.era.decade) {
    parts.push(`with ${musicology.era.decade} influences`)
  }

  return parts.join(', ') + '.'
}

// Helper functions
function parseKey(keyString: string): { key: string; mode: 'major' | 'minor' | null; confidence: number } {
  const majorMatch = keyString.match(/([A-G])\s*major/i)
  const minorMatch = keyString.match(/([A-G])\s*minor/i)
  
  if (majorMatch) {
    return { key: majorMatch[1].toUpperCase(), mode: 'major', confidence: 0.8 }
  }
  if (minorMatch) {
    return { key: minorMatch[1].toUpperCase(), mode: 'minor', confidence: 0.8 }
  }
  
  return { key: 'Unknown', mode: null, confidence: 0 }
}

function inferTimeSignature(bpm: number | null | undefined): string {
  // Most electronic music is 4/4
  return '4/4'
}

function classifyTempo(bpm: number | null | undefined): 'very-slow' | 'slow' | 'medium' | 'fast' | 'very-fast' {
  if (!bpm) return 'medium'
  if (bpm < 70) return 'very-slow'
  if (bpm < 100) return 'slow'
  if (bpm < 130) return 'medium'
  if (bpm < 160) return 'fast'
  return 'very-fast'
}

function calculateDanceability(audioAnalysis: any): number {
  if (!audioAnalysis?.bpm) return 0.5
  // Higher BPM generally = more danceable (for electronic music)
  if (audioAnalysis.bpm >= 120 && audioAnalysis.bpm <= 140) return 0.9
  if (audioAnalysis.bpm >= 100 && audioAnalysis.bpm < 120) return 0.7
  if (audioAnalysis.bpm >= 140) return 0.8
  return 0.5
}

function getHistoricalPeriod(decade: number): string {
  if (decade < 1980) return 'Early Electronic'
  if (decade < 1990) return '1980s Electronic Revolution'
  if (decade < 2000) return '1990s Rave Era'
  if (decade < 2010) return '2000s Digital Age'
  return 'Modern Electronic'
}

function inferProductionTechniques(genreAnalysis: any, audioAnalysis: any): string[] {
  const techniques: string[] = []
  
  if (genreAnalysis.primary.some((g: string) => g.toLowerCase().includes('techno'))) {
    techniques.push('Synthesis', 'Sequencing', 'Modular Synthesis')
  }
  if (genreAnalysis.primary.some((g: string) => g.toLowerCase().includes('house'))) {
    techniques.push('Sampling', 'Drum Machine', 'Bass Synthesis')
  }
  if (audioAnalysis?.bpm && audioAnalysis.bpm > 140) {
    techniques.push('High-Energy Production', 'Fast Sequencing')
  }

  return techniques.length > 0 ? techniques : ['Electronic Production']
}

