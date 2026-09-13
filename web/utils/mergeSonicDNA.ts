/**
 * Smart Sonic DNA Merger
 * Merges new analysis data with existing data, preserving valuable information
 * and prioritizing corrections while never losing previously gathered data
 */

export interface MergeOptions {
  preferNew?: boolean           // Prefer new data over old (default: true for corrections)
  preserveUserTags?: boolean    // Always preserve user-tagged data (default: true)
  mergeArrays?: boolean         // Merge arrays instead of replacing (default: true)
  trackHistory?: boolean        // Keep history of changes (default: true)
}

const DEFAULT_OPTIONS: MergeOptions = {
  preferNew: true,
  preserveUserTags: true,
  mergeArrays: true,
  trackHistory: true
}

/**
 * Deep merge two Sonic DNA objects, preserving valuable data
 */
export function mergeSonicDNA(
  existing: any,
  newData: any,
  options: MergeOptions = {}
): any {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  if (!existing) return newData
  if (!newData) return existing
  
  // Start with existing data as base
  const merged: any = JSON.parse(JSON.stringify(existing))
  
  // Track merge history
  if (opts.trackHistory) {
    merged._mergeHistory = merged._mergeHistory || []
    merged._mergeHistory.push({
      mergedAt: new Date().toISOString(),
      previousVersion: existing._metadata?.agentVersion,
      newVersion: newData._metadata?.agentVersion
    })
    // Keep only last 5 merge records
    if (merged._mergeHistory.length > 5) {
      merged._mergeHistory = merged._mergeHistory.slice(-5)
    }
  }
  
  // Merge each section
  merged.description = mergeTextFields(existing.description, newData.description, opts)
  merged.intention = mergeTextFields(existing.intention, newData.intention, opts)
  merged.summary = mergeTextFields(existing.summary, newData.summary, opts)
  
  // Merge emotional section
  merged.emotional = mergeEmotionalSection(existing.emotional, newData.emotional, opts)
  
  // Merge musical section
  merged.musical = mergeMusicalSection(existing.musical, newData.musical, opts)
  
  // Merge genres section (special handling for user tags)
  merged.genres = mergeGenresSection(existing.genres, newData.genres, opts)
  
  // Merge historical section
  merged.historical = mergeHistoricalSection(existing.historical, newData.historical, opts)
  
  // Merge regional section
  merged.regional = mergeRegionalSection(existing.regional, newData.regional, opts)
  
  // Merge technical section
  merged.technical = mergeTechnicalSection(existing.technical, newData.technical, opts)
  
  // Merge drums section
  merged.drums = mergeDrumsSection(existing.drums, newData.drums, opts)
  
  // Merge harmony section
  merged.harmony = mergeObjectFields(existing.harmony, newData.harmony, opts)
  
  // Merge musicology section
  merged.musicology = mergeObjectFields(existing.musicology, newData.musicology, opts)
  
  // Merge cultural section
  merged.cultural = mergeObjectFields(existing.cultural, newData.cultural, opts)
  
  // Merge timing section
  merged.timing = mergeObjectFields(existing.timing, newData.timing, opts)
  
  // Merge waveform (prefer existing if valid, new if existing is empty)
  merged.waveform = mergeWaveform(existing.waveform, newData.waveform)
  
  // Merge comprehensive data
  merged.comprehensive = mergeObjectFields(existing.comprehensive, newData.comprehensive, opts)
  
  // Merge musicbrainz data
  merged.musicbrainz = mergeObjectFields(existing.musicbrainz, newData.musicbrainz, opts)

  // DSP measurements are never overwritten by LLM/folder inference.
  merged.measured = newData.measured || existing.measured || merged.measured
  
  // Update metadata
  merged._metadata = {
    ...existing._metadata,
    ...newData._metadata,
    processedAt: new Date().toISOString(),
    agentVersion: newData._metadata?.agentVersion || existing._metadata?.agentVersion,
    mergedFrom: existing._metadata?.agentVersion,
    qualityScore: Math.max(
      existing._metadata?.qualityScore || 0,
      newData._metadata?.qualityScore || 0
    ),
    isMerged: true,
    preservedFields: countPreservedFields(existing, merged)
  }
  
  return merged
}

/**
 * Merge text fields - prefer non-empty, longer, or more detailed content
 */
function mergeTextFields(existing: string | undefined, newText: string | undefined, opts: MergeOptions): string {
  const existingVal = existing?.trim() || ''
  const newVal = newText?.trim() || ''
  
  // If one is empty, use the other
  if (!existingVal) return newVal
  if (!newVal) return existingVal
  
  // If they're the same, return either
  if (existingVal === newVal) return existingVal
  
  // Check for "Analysis pending" or placeholder text
  const isExistingPlaceholder = existingVal.toLowerCase().includes('analysis pending') || existingVal.length < 20
  const isNewPlaceholder = newVal.toLowerCase().includes('analysis pending') || newVal.length < 20
  
  if (isExistingPlaceholder && !isNewPlaceholder) return newVal
  if (!isExistingPlaceholder && isNewPlaceholder) return existingVal
  
  // Prefer longer, more detailed content (unless it's just padding)
  if (opts.preferNew && newVal.length > existingVal.length * 0.8) {
    return newVal
  }
  
  // Default to existing if both are valid
  return existingVal.length >= newVal.length ? existingVal : newVal
}

/**
 * Merge arrays - combine unique values
 */
function mergeArrays(existing: any[] | undefined, newArr: any[] | undefined, maxItems: number = 10): any[] {
  const existingArr = Array.isArray(existing) ? existing : []
  const newArrVal = Array.isArray(newArr) ? newArr : []
  
  // Combine and deduplicate
  const combined = [...existingArr]
  
  for (const item of newArrVal) {
    const itemStr = typeof item === 'string' ? item.toLowerCase() : JSON.stringify(item)
    const exists = combined.some(e => {
      const eStr = typeof e === 'string' ? e.toLowerCase() : JSON.stringify(e)
      return eStr === itemStr
    })
    if (!exists) {
      combined.push(item)
    }
  }
  
  return combined.slice(0, maxItems)
}

/**
 * Merge emotional section
 */
function mergeEmotionalSection(existing: any, newData: any, opts: MergeOptions): any {
  if (!existing && !newData) return {}
  if (!existing) return newData
  if (!newData) return existing
  
  return {
    primaryEmotions: mergeArrays(existing.primaryEmotions, newData.primaryEmotions, 8),
    emotionalJourney: mergeTextFields(existing.emotionalJourney, newData.emotionalJourney, opts),
    psychologicalProfile: mergeTextFields(existing.psychologicalProfile, newData.psychologicalProfile, opts),
    moodTransitions: mergeArrays(existing.moodTransitions, newData.moodTransitions, 10),
    mood: newData.mood || existing.mood,
    intensity: newData.intensity ?? existing.intensity,
    valence: newData.valence ?? existing.valence,
    arousal: newData.arousal ?? existing.arousal
  }
}

/**
 * Merge musical section
 */
function mergeMusicalSection(existing: any, newData: any, opts: MergeOptions): any {
  if (!existing && !newData) return {}
  if (!existing) return newData
  if (!newData) return existing
  
  return {
    keySignature: mergeKeySignature(existing.keySignature, newData.keySignature),
    timeSignature: newData.timeSignature || existing.timeSignature || '4/4',
    scale: newData.scale || existing.scale,
    harmonicComplexity: mergeTextFields(existing.harmonicComplexity, newData.harmonicComplexity, opts),
    rhythmicPatterns: mergeTextFields(existing.rhythmicPatterns, newData.rhythmicPatterns, opts),
    instrumentation: mergeArrays(existing.instrumentation, newData.instrumentation, 10),
    productionTechniques: mergeArrays(existing.productionTechniques, newData.productionTechniques, 10),
    musicalInfluences: mergeArrays(existing.musicalInfluences, newData.musicalInfluences, 8)
  }
}

/**
 * Merge key signature - prefer known over unknown
 */
function mergeKeySignature(existing: string | undefined, newKey: string | undefined): string {
  const existingVal = existing?.trim() || ''
  const newVal = newKey?.trim() || ''
  
  if (!existingVal || existingVal === 'Unknown') return newVal || 'Unknown'
  if (!newVal || newVal === 'Unknown') return existingVal
  
  // If both are valid, prefer the new one (might be corrected)
  return newVal
}

/**
 * Merge genres section with special handling for user tags
 */
function mergeGenresSection(existing: any, newData: any, opts: MergeOptions): any {
  if (!existing && !newData) return {}
  if (!existing) return newData
  if (!newData) return existing
  
  // Check if existing has user tags (should be preserved)
  const hasUserTags = existing.subgenreClassification?.primary?.matchedFeatures?.includes('user-tagged') ||
                      existing.subgenreClassification?.primary?.matchedFeatures?.includes('artist-tagged')
  
  // If user tagged and preserveUserTags is true, keep existing classification
  let subgenreClassification = newData.subgenreClassification
  if (opts.preserveUserTags && hasUserTags) {
    subgenreClassification = existing.subgenreClassification
  } else if (existing.subgenreClassification && newData.subgenreClassification) {
    // Merge classifications
    subgenreClassification = {
      ...newData.subgenreClassification,
      secondary: mergeArrays(
        existing.subgenreClassification?.secondary,
        newData.subgenreClassification?.secondary,
        5
      )
    }
  }
  
  return {
    primaryGenres: opts.preserveUserTags && hasUserTags
      ? existing.primaryGenres
      : mergeArrays(existing.primaryGenres, newData.primaryGenres, 6),
    subgenres: mergeArrays(existing.subgenres, newData.subgenres, 8),
    microgenres: mergeArrays(existing.microgenres, newData.microgenres, 6),
    genreTags: mergeArrays(existing.genreTags, newData.genreTags, 12),
    subgenreClassification,
    genreFusion: mergeTextFields(existing.genreFusion, newData.genreFusion, opts),
    genreEvolution: mergeTextFields(existing.genreEvolution, newData.genreEvolution, opts),
    genreCharacteristics: mergeArrays(existing.genreCharacteristics, newData.genreCharacteristics, 8),
    genreInfluences: mergeArrays(existing.genreInfluences, newData.genreInfluences, 6),
    era: newData.era || existing.era,
    origins: mergeArrays(existing.origins, newData.origins, 5),
    timingContext: newData.timingContext || existing.timingContext,
    productionStyle: mergeTextFields(existing.productionStyle, newData.productionStyle, opts),
    confidence: Math.max(existing.confidence || 0, newData.confidence || 0)
  }
}

/**
 * Merge historical section
 */
function mergeHistoricalSection(existing: any, newData: any, opts: MergeOptions): any {
  if (!existing && !newData) return {}
  if (!existing) return newData
  if (!newData) return existing
  
  return {
    eraInfluences: mergeArrays(existing.eraInfluences, newData.eraInfluences, 6),
    historicalContext: mergeTextFields(existing.historicalContext, newData.historicalContext, opts),
    evolutionFrom: mergeArrays(existing.evolutionFrom, newData.evolutionFrom, 5),
    innovationPoints: mergeArrays(existing.innovationPoints, newData.innovationPoints, 5),
    era: newData.era || existing.era
  }
}

/**
 * Merge regional section
 */
function mergeRegionalSection(existing: any, newData: any, opts: MergeOptions): any {
  if (!existing && !newData) return {}
  if (!existing) return newData
  if (!newData) return existing
  
  return {
    primaryRegions: mergeArrays(existing.primaryRegions, newData.primaryRegions, 6),
    culturalInfluences: mergeArrays(existing.culturalInfluences, newData.culturalInfluences, 8),
    regionalCharacteristics: mergeTextFields(existing.regionalCharacteristics, newData.regionalCharacteristics, opts),
    crossCulturalElements: mergeArrays(existing.crossCulturalElements, newData.crossCulturalElements, 6)
  }
}

/**
 * Merge technical section
 */
function mergeTechnicalSection(existing: any, newData: any, opts: MergeOptions): any {
  if (!existing && !newData) return {}
  if (!existing) return newData
  if (!newData) return existing
  
  return {
    ...existing,
    ...newData,
    // Prefer non-zero values
    bpm: newData.bpm || existing.bpm,
    energyLevel: newData.energyLevel ?? existing.energyLevel,
    danceability: newData.danceability ?? existing.danceability,
    // Merge key info
    key: newData.key?.key !== 'Unknown' ? newData.key : existing.key,
    // Keep timing info
    timingFeel: newData.timingFeel || existing.timingFeel,
    effectiveBpm: newData.effectiveBpm || existing.effectiveBpm,
    timingConfidence: Math.max(newData.timingConfidence || 0, existing.timingConfidence || 0),
    technicalDescription: mergeTextFields(existing.technicalDescription, newData.technicalDescription, opts)
  }
}

/**
 * Merge drums section
 */
function mergeDrumsSection(existing: any, newData: any, opts: MergeOptions): any {
  if (!existing && !newData) return {}
  if (!existing) return newData
  if (!newData) return existing
  
  return {
    ...existing,
    ...newData,
    // Merge pattern info
    pattern: {
      ...existing.pattern,
      ...newData.pattern
    },
    // Merge genre styles
    genreStyles: newData.genreStyles || existing.genreStyles ? {
      primary: mergeArrays(existing.genreStyles?.primary, newData.genreStyles?.primary, 5),
      secondary: mergeArrays(existing.genreStyles?.secondary, newData.genreStyles?.secondary, 5),
      characteristics: mergeArrays(existing.genreStyles?.characteristics, newData.genreStyles?.characteristics, 6),
      confidence: Math.max(existing.genreStyles?.confidence || 0, newData.genreStyles?.confidence || 0)
    } : undefined,
    // Merge analysis objects
    kickAnalysis: newData.kickAnalysis || existing.kickAnalysis,
    snareAnalysis: newData.snareAnalysis || existing.snareAnalysis,
    hihatAnalysis: newData.hihatAnalysis || existing.hihatAnalysis,
    cadence: newData.cadence || existing.cadence,
    timing: newData.timing || existing.timing,
    bassline: newData.bassline || existing.bassline,
    signatureMatch: newData.signatureMatch || existing.signatureMatch,
    patternRecognition: mergeTextFields(existing.patternRecognition, newData.patternRecognition, opts)
  }
}

/**
 * Generic object field merger
 */
function mergeObjectFields(existing: any, newData: any, opts: MergeOptions): any {
  if (!existing && !newData) return null
  if (!existing) return newData
  if (!newData) return existing
  
  const merged = { ...existing }
  
  for (const key of Object.keys(newData)) {
    const existingVal = existing[key]
    const newVal = newData[key]
    
    if (Array.isArray(newVal)) {
      merged[key] = mergeArrays(existingVal, newVal)
    } else if (typeof newVal === 'object' && newVal !== null) {
      merged[key] = mergeObjectFields(existingVal, newVal, opts)
    } else if (typeof newVal === 'string') {
      merged[key] = mergeTextFields(existingVal, newVal, opts)
    } else if (newVal !== undefined && newVal !== null) {
      // For numbers/booleans, prefer new if existing is null/undefined
      merged[key] = existingVal ?? newVal
    }
  }
  
  return merged
}

/**
 * Merge waveform data - prefer existing valid data
 */
function mergeWaveform(existing: any, newData: any): any {
  // If existing has valid waveform data, keep it (expensive to regenerate)
  if (existing?.data?.length > 0) {
    return existing
  }
  return newData
}

/**
 * Count how many fields were preserved from existing data
 */
function countPreservedFields(existing: any, merged: any): number {
  let count = 0
  
  const checkFields = ['description', 'intention', 'summary']
  for (const field of checkFields) {
    if (existing[field] && merged[field] === existing[field]) {
      count++
    }
  }
  
  // Check emotional
  if (existing.emotional?.primaryEmotions?.length > 0 &&
      merged.emotional?.primaryEmotions?.some((e: string) => 
        existing.emotional.primaryEmotions.includes(e))) {
    count++
  }
  
  return count
}

/**
 * Export for use in pipeline
 */
export default mergeSonicDNA
