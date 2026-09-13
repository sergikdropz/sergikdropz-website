#!/usr/bin/env node
/**
 * Merge All Sonic DNA Data
 * 
 * This script consolidates existing Sonic DNA data with new corrections,
 * ensuring no previously gathered data is ever lost.
 * 
 * Features:
 * - Preserves user-tagged genres
 * - Merges arrays (emotions, influences, regions) instead of replacing
 * - Keeps the best description/intention text
 * - Preserves waveform data
 * - Tracks merge history
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Import merge function inline (since we're in mjs)
function mergeSonicDNA(existing, newData, options = {}) {
  const opts = {
    preferNew: true,
    preserveUserTags: true,
    mergeArrays: true,
    trackHistory: true,
    ...options
  }
  
  if (!existing) return newData
  if (!newData) return existing
  
  const merged = JSON.parse(JSON.stringify(existing))
  
  // Track merge history
  if (opts.trackHistory) {
    merged._mergeHistory = merged._mergeHistory || []
    merged._mergeHistory.push({
      mergedAt: new Date().toISOString(),
      reason: 'data-consolidation'
    })
    if (merged._mergeHistory.length > 5) {
      merged._mergeHistory = merged._mergeHistory.slice(-5)
    }
  }
  
  // Helper functions
  const mergeArrays = (a, b, max = 10) => {
    const arr1 = Array.isArray(a) ? a : []
    const arr2 = Array.isArray(b) ? b : []
    const combined = [...arr1]
    for (const item of arr2) {
      const itemStr = typeof item === 'string' ? item.toLowerCase() : JSON.stringify(item)
      const exists = combined.some(e => {
        const eStr = typeof e === 'string' ? e.toLowerCase() : JSON.stringify(e)
        return eStr === itemStr
      })
      if (!exists) combined.push(item)
    }
    return combined.slice(0, max)
  }
  
  const mergeText = (a, b) => {
    const aVal = a?.trim() || ''
    const bVal = b?.trim() || ''
    if (!aVal) return bVal
    if (!bVal) return aVal
    if (aVal.toLowerCase().includes('analysis pending') && !bVal.toLowerCase().includes('analysis pending')) return bVal
    if (!aVal.toLowerCase().includes('analysis pending') && bVal.toLowerCase().includes('analysis pending')) return aVal
    return aVal.length >= bVal.length ? aVal : bVal
  }
  
  // Merge sections
  merged.description = mergeText(existing.description, newData.description)
  merged.intention = mergeText(existing.intention, newData.intention)
  merged.summary = mergeText(existing.summary, newData.summary)
  
  // Merge emotional
  if (existing.emotional || newData.emotional) {
    merged.emotional = {
      ...existing.emotional,
      ...newData.emotional,
      primaryEmotions: mergeArrays(existing.emotional?.primaryEmotions, newData.emotional?.primaryEmotions, 8),
      emotionalJourney: mergeText(existing.emotional?.emotionalJourney, newData.emotional?.emotionalJourney),
      psychologicalProfile: mergeText(existing.emotional?.psychologicalProfile, newData.emotional?.psychologicalProfile),
      moodTransitions: mergeArrays(existing.emotional?.moodTransitions, newData.emotional?.moodTransitions, 10)
    }
  }
  
  // Merge musical
  if (existing.musical || newData.musical) {
    merged.musical = {
      ...existing.musical,
      ...newData.musical,
      instrumentation: mergeArrays(existing.musical?.instrumentation, newData.musical?.instrumentation, 10),
      productionTechniques: mergeArrays(existing.musical?.productionTechniques, newData.musical?.productionTechniques, 10),
      musicalInfluences: mergeArrays(existing.musical?.musicalInfluences, newData.musical?.musicalInfluences, 8),
      keySignature: (newData.musical?.keySignature && newData.musical.keySignature !== 'Unknown')
        ? newData.musical.keySignature
        : existing.musical?.keySignature
    }
  }
  
  // Merge genres (preserve user tags)
  if (existing.genres || newData.genres) {
    const hasUserTags = existing.genres?.subgenreClassification?.primary?.matchedFeatures?.includes('user-tagged') ||
                        existing.genres?.subgenreClassification?.primary?.matchedFeatures?.includes('artist-tagged')
    
    merged.genres = {
      ...existing.genres,
      ...newData.genres,
      primaryGenres: hasUserTags ? existing.genres?.primaryGenres : mergeArrays(existing.genres?.primaryGenres, newData.genres?.primaryGenres, 6),
      subgenres: mergeArrays(existing.genres?.subgenres, newData.genres?.subgenres, 8),
      microgenres: mergeArrays(existing.genres?.microgenres, newData.genres?.microgenres, 6),
      genreTags: mergeArrays(existing.genres?.genreTags, newData.genres?.genreTags, 12),
      origins: mergeArrays(existing.genres?.origins, newData.genres?.origins, 5),
      genreCharacteristics: mergeArrays(existing.genres?.genreCharacteristics, newData.genres?.genreCharacteristics, 8),
      subgenreClassification: hasUserTags ? existing.genres?.subgenreClassification : newData.genres?.subgenreClassification
    }
  }
  
  // Merge historical
  if (existing.historical || newData.historical) {
    merged.historical = {
      ...existing.historical,
      ...newData.historical,
      eraInfluences: mergeArrays(existing.historical?.eraInfluences, newData.historical?.eraInfluences, 6),
      evolutionFrom: mergeArrays(existing.historical?.evolutionFrom, newData.historical?.evolutionFrom, 5),
      innovationPoints: mergeArrays(existing.historical?.innovationPoints, newData.historical?.innovationPoints, 5),
      historicalContext: mergeText(existing.historical?.historicalContext, newData.historical?.historicalContext)
    }
  }
  
  // Merge regional
  if (existing.regional || newData.regional) {
    merged.regional = {
      ...existing.regional,
      ...newData.regional,
      primaryRegions: mergeArrays(existing.regional?.primaryRegions, newData.regional?.primaryRegions, 6),
      culturalInfluences: mergeArrays(existing.regional?.culturalInfluences, newData.regional?.culturalInfluences, 8),
      crossCulturalElements: mergeArrays(existing.regional?.crossCulturalElements, newData.regional?.crossCulturalElements, 6),
      regionalCharacteristics: mergeText(existing.regional?.regionalCharacteristics, newData.regional?.regionalCharacteristics)
    }
  }
  
  // Merge technical (prefer non-zero values)
  if (existing.technical || newData.technical) {
    merged.technical = {
      ...existing.technical,
      ...newData.technical,
      bpm: newData.technical?.bpm || existing.technical?.bpm,
      energyLevel: newData.technical?.energyLevel ?? existing.technical?.energyLevel,
      danceability: newData.technical?.danceability ?? existing.technical?.danceability,
      key: (newData.technical?.key?.key && newData.technical.key.key !== 'Unknown')
        ? newData.technical.key
        : existing.technical?.key
    }
  }
  
  // Merge drums
  if (existing.drums || newData.drums) {
    merged.drums = {
      ...existing.drums,
      ...newData.drums,
      genreStyles: {
        primary: mergeArrays(existing.drums?.genreStyles?.primary, newData.drums?.genreStyles?.primary, 5),
        secondary: mergeArrays(existing.drums?.genreStyles?.secondary, newData.drums?.genreStyles?.secondary, 5),
        characteristics: mergeArrays(existing.drums?.genreStyles?.characteristics, newData.drums?.genreStyles?.characteristics, 6)
      }
    }
  }
  
  // Preserve waveform (expensive to regenerate)
  if (existing.waveform?.data?.length > 0) {
    merged.waveform = existing.waveform
  }
  
  // Update metadata
  merged._metadata = {
    ...existing._metadata,
    ...newData._metadata,
    processedAt: new Date().toISOString(),
    isMerged: true,
    qualityScore: Math.max(existing._metadata?.qualityScore || 0, newData._metadata?.qualityScore || 0)
  }
  
  return merged
}

async function mergeAllSonicDNA() {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('🔄 MERGING ALL SONIC DNA DATA')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('')
  
  // Fetch all tracks with Sonic DNA
  console.log('📊 Fetching all tracks with Sonic DNA...')
  const { data: tracks, error } = await supabase
    .from('audio_files')
    .select('id, title, sonic_dna, metadata')
    .not('sonic_dna', 'is', null)
    .order('title')
  
  if (error) {
    console.error('❌ Error fetching tracks:', error)
    return
  }
  
  console.log(`   Found ${tracks.length} tracks with Sonic DNA`)
  console.log('')
  
  let merged = 0
  let skipped = 0
  let errors = 0
  
  // Process each track
  console.log('🔄 Processing tracks...')
  console.log('')
  
  for (const track of tracks) {
    try {
      const existingDNA = track.sonic_dna
      const metadataDNA = track.metadata?.sonicDNA || track.metadata?.sonic_dna
      
      // Check if there's data to merge from metadata
      let hasMetadataDNA = metadataDNA && Object.keys(metadataDNA).length > 0
      
      // Also check if the existing DNA is incomplete and needs enrichment
      const needsEnrichment = !existingDNA.emotional?.primaryEmotions?.length ||
                              !existingDNA.historical?.eraInfluences?.length ||
                              !existingDNA.regional?.primaryRegions?.length ||
                              !existingDNA.musical?.instrumentation?.length
      
      if (!hasMetadataDNA && !needsEnrichment) {
        skipped++
        continue
      }
      
      // Merge with metadata DNA if available
      let mergedDNA = existingDNA
      if (hasMetadataDNA) {
        mergedDNA = mergeSonicDNA(existingDNA, metadataDNA)
      }
      
      // Ensure all sections exist with at least empty arrays
      mergedDNA.emotional = mergedDNA.emotional || { primaryEmotions: [], emotionalJourney: '', psychologicalProfile: '' }
      mergedDNA.historical = mergedDNA.historical || { eraInfluences: [], historicalContext: '' }
      mergedDNA.regional = mergedDNA.regional || { primaryRegions: [], culturalInfluences: [] }
      mergedDNA.musical = mergedDNA.musical || { instrumentation: [], productionTechniques: [] }
      
      // Mark as merged
      mergedDNA._metadata = mergedDNA._metadata || {}
      mergedDNA._metadata.isMerged = true
      mergedDNA._metadata.mergedAt = new Date().toISOString()
      
      // Update the track
      const { error: updateError } = await supabase
        .from('audio_files')
        .update({ sonic_dna: mergedDNA })
        .eq('id', track.id)
      
      if (updateError) {
        console.log(`❌ ${track.title}: ${updateError.message}`)
        errors++
      } else {
        process.stdout.write('.')
        merged++
      }
    } catch (err) {
      console.log(`❌ ${track.title}: ${err.message}`)
      errors++
    }
  }
  
  console.log('')
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('📊 MERGE SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(`Total tracks:     ${tracks.length}`)
  console.log(`Merged:           ${merged}`)
  console.log(`Skipped:          ${skipped}`)
  console.log(`Errors:           ${errors}`)
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('')
  console.log('✅ Merge complete!')
}

// Run the script
mergeAllSonicDNA().catch(console.error)
