/**
 * Generate Sonic DNA using Agent Pipeline
 * Efficient, parallel processing with specialized agents
 * 
 * Enhanced with:
 * - Advanced drum pattern analysis (kick/snare/hi-hat patterns)
 * - Half-time/timing detection using bassline + drum data
 * - Extended subgenre classification (150+ subgenres)
 * - MusicBrainz integration for metadata and genre tags
 * - SERGIK AI knowledge base integration
 */

import { EnhancedPipelineOrchestrator } from './sonicDNAAgents'
import { AgentContext } from './sonicDNAAgents'
import { analyzeComprehensive } from './comprehensiveMusicAnalysis'
import { getMusicBrainzArtistDetails, searchMusicBrainzArtist, extractGenres } from './musicbrainz'
import { analyzeEnhancedSonicDNA, mergeEnhancedIntoSonicDNA } from './enhancedSonicDNAAnalysis'

// Use enhanced orchestrator with retry logic and quality checks
const orchestrator = new EnhancedPipelineOrchestrator()

/**
 * Generate comprehensive Sonic DNA using agent pipeline
 * Enhanced with advanced drum/genre analysis
 */
export async function generateSonicDNAWithAgents(
  trackTitle: string,
  artistName: string,
  trackId: string,
  existingMetadata?: {
    bpm?: number
    key?: string
    duration?: number
    energyLevel?: number
    frequencyBands?: any
    audioFileUrl?: string
    filePath?: string
    waveformData?: number[] // Existing waveform data from database
    waveformSamples?: number // Existing waveform samples count
  },
  userDirective?: string
): Promise<any> {
  console.log(`[${trackTitle}] Starting enhanced agent pipeline analysis...`)
  console.log(`[${trackTitle}] File metadata:`, {
    audioFileUrl: existingMetadata?.audioFileUrl || 'Not provided',
    filePath: existingMetadata?.filePath || 'Not provided',
    hasAudioFile: !!(existingMetadata?.audioFileUrl || existingMetadata?.filePath)
  })

  // Step 1: Get MusicBrainz data first (for genre hints)
  console.log(`[${trackTitle}] Step 1: MusicBrainz lookup...`)
  let musicbrainzData = null
  let musicbrainzGenres: string[] = []
  let musicbrainzTags: string[] = []
  
  try {
    const artist = await searchMusicBrainzArtist(artistName)
    if (artist) {
      musicbrainzData = await getMusicBrainzArtistDetails(artist.id)
      if (musicbrainzData) {
        musicbrainzGenres = extractGenres(musicbrainzData)
        musicbrainzTags = musicbrainzData.tags?.map((t: any) => t.name) || []
        console.log(`[${trackTitle}] ✅ MusicBrainz: ${musicbrainzGenres.length} genres, ${musicbrainzTags.length} tags`)
      }
    }
  } catch (error) {
    console.warn(`[${trackTitle}] ⚠️ MusicBrainz lookup failed:`, error)
  }

  // Step 2: Get comprehensive analysis (non-AI, fast) - now with genre hints
  console.log(`[${trackTitle}] Step 2: Comprehensive analysis with genre hints...`)
  const audioFileUrl = existingMetadata?.audioFileUrl || existingMetadata?.filePath || ''
  if (!audioFileUrl) {
    console.warn(`[${trackTitle}] ⚠️ No audio file URL or path provided - analysis will proceed without audio file access`)
  } else {
    console.log(`[${trackTitle}] ✅ Audio file available: ${audioFileUrl}`)
  }
  
  const comprehensiveAnalysis = await analyzeComprehensive(
    trackTitle,
    artistName,
    audioFileUrl,
    existingMetadata
  )

  // Step 3: Perform enhanced drum/genre analysis in parallel with agent pipeline
  console.log(`[${trackTitle}] Step 3: Enhanced drum/genre analysis...`)
  let enhancedAnalysis = null
  try {
    enhancedAnalysis = await analyzeEnhancedSonicDNA({
      trackTitle,
      artistName,
      audioFileUrl,
      existingMetadata: {
        bpm: comprehensiveAnalysis.technical.bpm || existingMetadata?.bpm,
        key: comprehensiveAnalysis.harmony.keySignature || existingMetadata?.key,
        duration: existingMetadata?.duration,
        energyLevel: comprehensiveAnalysis.technical.energy?.level || existingMetadata?.energyLevel,
        frequencyBands: existingMetadata?.frequencyBands
      },
      musicbrainzData: musicbrainzData ? {
        artistId: musicbrainzData.id,
        genres: musicbrainzGenres,
        tags: musicbrainzTags
      } : undefined
    })
    console.log(`[${trackTitle}] ✅ Enhanced analysis: ${enhancedAnalysis.subgenreClassification.primarySubgenre.name} (${Math.round(enhancedAnalysis.subgenreClassification.primarySubgenre.confidence * 100)}% confidence)`)
    console.log(`[${trackTitle}] ✅ Timing: ${enhancedAnalysis.timing.feel} (${enhancedAnalysis.timing.confidence}% confidence)`)
  } catch (error) {
    console.warn(`[${trackTitle}] ⚠️ Enhanced analysis failed:`, error)
  }

  // Step 4: Build agent context (include enhanced analysis data)
  const context: AgentContext = {
    trackTitle,
    artistName,
    userDirective,
    audioFeatures: {
      bpm: comprehensiveAnalysis.technical.bpm || existingMetadata?.bpm,
      energyLevel: comprehensiveAnalysis.technical.energy.level || existingMetadata?.energyLevel,
      duration: existingMetadata?.duration || 0,
      key: comprehensiveAnalysis.harmony.keySignature,
      timeSignature: comprehensiveAnalysis.technical.timeSignature,
      audioFileUrl: comprehensiveAnalysis.audioFileUrl || existingMetadata?.audioFileUrl || undefined
    },
    comprehensiveAnalysis: {
      ...comprehensiveAnalysis,
      filePath: existingMetadata?.filePath || undefined,
      audioFileUrl: comprehensiveAnalysis.audioFileUrl || existingMetadata?.audioFileUrl || undefined,
      // Include enhanced analysis data for agents to use
      enhancedDrumAnalysis: enhancedAnalysis?.drumAnalysis,
      enhancedSubgenreClassification: enhancedAnalysis?.subgenreClassification,
      enhancedTiming: enhancedAnalysis?.timing
    },
    musicbrainzData: musicbrainzData ? {
      ...musicbrainzData,
      artistInfo: {
        ...musicbrainzData,
        genres: musicbrainzGenres,
        tags: musicbrainzTags
      }
    } : null,
    // Include existing waveform data if available (from database)
    waveformData: existingMetadata?.waveformData ? {
      data: existingMetadata.waveformData,
      samples: existingMetadata.waveformSamples || existingMetadata.waveformData.length,
      sampleRate: 44100
    } : undefined
  }

  // Step 5: Process through agent pipeline (parallel where possible)
  console.log(`[${trackTitle}] Step 4: Agent pipeline processing...`)
  const agentResults = await orchestrator.processTrack(context, true) // Use retry logic

  // Step 6: Quality check
  const qualityCheck = orchestrator.qualityCheck(agentResults, context)
  if (!qualityCheck.passed) {
    console.warn(`[${trackTitle}] ⚠️ Quality check issues:`, qualityCheck.issues)
    console.warn(`[${trackTitle}] Quality score: ${qualityCheck.score}/100`)
  } else {
    console.log(`[${trackTitle}] ✅ Quality check passed (score: ${qualityCheck.score}/100)`)
  }

  // Step 7: Synthesize results
  console.log(`[${trackTitle}] Step 5: Synthesizing results...`)
  let sonicDNA = orchestrator.synthesizeResults(
    agentResults,
    comprehensiveAnalysis,
    musicbrainzData
  )

  // Step 8: Merge enhanced analysis into final Sonic DNA
  if (enhancedAnalysis) {
    console.log(`[${trackTitle}] Step 6: Merging enhanced analysis...`)
    sonicDNA = mergeEnhancedIntoSonicDNA(sonicDNA, enhancedAnalysis)
  }

  // Log agent performance
  console.log(`[${trackTitle}] Agent Results:`)
  agentResults.forEach((result, type) => {
    const status = result.success ? '✅' : '❌'
    console.log(`  ${status} ${type}: ${result.processingTime}ms (confidence: ${result.confidence})`)
  })

  // Log enhanced analysis summary
  if (enhancedAnalysis) {
    console.log(`[${trackTitle}] Enhanced Analysis Summary:`)
    console.log(`  🥁 Drum Pattern: ${enhancedAnalysis.drums.patternType}`)
    console.log(`  ⏱️ Timing: ${enhancedAnalysis.timing.feel} (effective BPM: ${enhancedAnalysis.timing.effectiveBpm})`)
    console.log(`  🎵 Subgenre: ${enhancedAnalysis.subgenreClassification.primarySubgenre.name}`)
    if (enhancedAnalysis.subgenreClassification.secondarySubgenres.length > 0) {
      console.log(`  🎶 Secondary: ${enhancedAnalysis.subgenreClassification.secondarySubgenres.map(s => s.name).join(', ')}`)
    }
  }

  return sonicDNA
}

/**
 * Batch process multiple tracks efficiently
 */
export async function batchProcessTracks(
  tracks: Array<{
    id: string
    title: string
    artist: string
    bpm?: number
    key?: string
    duration?: number
    energyLevel?: number
    frequencyBands?: any
  }>,
  batchSize: number = 3,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, any>> {
  const results = new Map<string, any>()
  const total = tracks.length

  // Process in batches
  for (let i = 0; i < tracks.length; i += batchSize) {
    const batch = tracks.slice(i, i + batchSize)
    
    // Process batch in parallel
    const batchPromises = batch.map(track =>
      generateSonicDNAWithAgents(
        track.title,
        track.artist,
        track.id,
        {
          bpm: track.bpm,
          key: track.key,
          duration: track.duration,
          energyLevel: track.energyLevel,
          frequencyBands: track.frequencyBands
        }
      ).then(sonicDNA => ({ trackId: track.id, sonicDNA }))
        .catch(error => {
          console.error(`[${track.title}] Agent pipeline failed:`, error)
          return { trackId: track.id, sonicDNA: null, error: error.message }
        })
    )

    const batchResults = await Promise.all(batchPromises)
    
    batchResults.forEach(({ trackId, sonicDNA }) => {
      if (sonicDNA) {
        results.set(trackId, sonicDNA)
      }
    })

    // Report progress
    if (onProgress) {
      onProgress(results.size, total)
    }

    // Small delay between batches to avoid rate limits
    if (i + batchSize < tracks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  return results
}
