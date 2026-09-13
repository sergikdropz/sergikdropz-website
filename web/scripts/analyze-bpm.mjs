#!/usr/bin/env node

/**
 * Pre-analyzes BPM for all tracks in music-library.json
 * Refactored with modular structure and improved detection flow
 * Run with: node scripts/analyze-bpm.mjs [--force]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { parseFile } from 'music-metadata'
import { decode } from 'node-wav'
import MusicTempo from 'music-tempo'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MUSIC_LIBRARY_FILE: join(process.cwd(), 'data', 'music-library.json'),
  AUDIO_DIR: join(process.cwd(), 'public', 'audio'),
  BPM_RANGE: { min: 30, max: 300 },
  VALID_BPM_RANGE: { min: 60, max: 200 },
  ANALYSIS_DURATION: 30, // seconds (reduced from 60 for faster processing)
  TARGET_SAMPLE_RATE: 11025,
  MIN_CONFIDENCE_FOR_EARLY_EXIT: 0.8,
}

// ============================================================================
// UTILITIES
// ============================================================================

class BPMResult {
  constructor(bpm, source, confidence = 0.5, metadata = {}) {
    this.bpm = bpm
    this.source = source
    this.confidence = confidence // 0.0 to 1.0
    this.metadata = metadata
  }

  isValid() {
    return this.bpm >= CONFIG.BPM_RANGE.min && 
           this.bpm <= CONFIG.BPM_RANGE.max &&
           !isNaN(this.bpm)
  }

  isHighConfidence() {
    return this.confidence >= 0.7
  }
}

function validateBPM(bpm) {
  if (!bpm || isNaN(bpm)) return false
  return bpm >= CONFIG.BPM_RANGE.min && bpm <= CONFIG.BPM_RANGE.max
}

function roundBPM(bpm) {
  return Math.round(bpm)
}

// ============================================================================
// BPM EXTRACTORS (Fast, Reliable Methods)
// ============================================================================

class TitleExtractor {
  static extract(track) {
    if (!track || !track.title) return null

    const patterns = [
      /(\d+)\s*bpm/i,
      /(\d+)\s*BPM/i,
      /bpm[:\s]+(\d+)/i,
      /\((\d+)\s*bpm\)/i,
      /\[(\d+)\s*bpm\]/i,
      /-(\d+)\s*bpm/i,
      /\s(\d{2,3})\s*bpm/i,
    ]

    for (const pattern of patterns) {
      const match = track.title.match(pattern)
      if (match) {
        const bpm = parseInt(match[1], 10)
        if (validateBPM(bpm)) {
          return new BPMResult(roundBPM(bpm), 'title', 0.95, { pattern: pattern.toString() })
        }
      }
    }

    return null
  }
}

class MetadataExtractor {
  static async extract(filePath) {
    if (!existsSync(filePath)) return null

    try {
      const metadata = await parseFile(filePath)

      // Check common.bpm (standard field)
      if (metadata.common?.bpm) {
        const bpm = roundBPM(metadata.common.bpm)
        if (validateBPM(bpm)) {
          return new BPMResult(bpm, 'metadata.common.bpm', 0.9)
        }
      }

      // Check native tags
      if (metadata.native) {
        for (const tagType in metadata.native) {
          const tags = metadata.native[tagType]
          for (const tag of tags) {
            const tagId = tag.id?.toLowerCase() || ''
            const tagName = tag.name?.toLowerCase() || ''

            if (tagId.includes('bpm') || tagId === 'tbpm' || tagId === 'tempo' ||
                tagName.includes('bpm') || tagName.includes('tempo')) {
              const value = tag.value
              let bpm = null

              if (typeof value === 'number') {
                bpm = roundBPM(value)
              } else if (typeof value === 'string') {
                const match = value.match(/(\d+)/)
                if (match) bpm = parseInt(match[1], 10)
              } else if (Array.isArray(value) && value.length > 0) {
                const firstValue = value[0]
                if (typeof firstValue === 'number') {
                  bpm = roundBPM(firstValue)
                }
              }

              if (validateBPM(bpm)) {
                return new BPMResult(bpm, `metadata.${tagId || tagName}`, 0.85)
              }
            }
          }
        }
      }

      // Check Vorbis comments
      if (metadata.vorbis?.BPM) {
        const bpm = roundBPM(parseFloat(metadata.vorbis.BPM))
        if (validateBPM(bpm)) {
          return new BPMResult(bpm, 'metadata.vorbis.BPM', 0.85)
        }
      }

      // Check ASF tags
      if (metadata.asf?.BPM) {
        const bpm = roundBPM(parseFloat(metadata.asf.BPM))
        if (validateBPM(bpm)) {
          return new BPMResult(bpm, 'metadata.asf.BPM', 0.85)
        }
      }
    } catch (error) {
      // Metadata extraction failed
    }

    return null
  }
}

// ============================================================================
// AUDIO ANALYZERS (Slower, Less Reliable Methods)
// ============================================================================

class AudioDecoder {
  static cache = new Map()
  static maxCacheSize = 50 // Limit cache size to prevent memory issues

  static decode(filePath) {
    if (!existsSync(filePath)) return null

    // Check cache first
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)
    }

    const ext = extname(filePath).toLowerCase()
    if (ext !== '.wav') return null

    try {
      const audioBuffer = readFileSync(filePath)
      const decoded = decode(audioBuffer)

      if (!decoded?.channelData || decoded.channelData.length === 0) {
        return null
      }

      const audioData = decoded.channelData[0]
      const sampleRate = decoded.sampleRate || 44100

      if (!audioData || audioData.length === 0) {
        return null
      }

      const result = {
        audioData: Array.isArray(audioData) ? audioData : Array.from(audioData),
        sampleRate
      }

      // Cache result (with size limit)
      if (this.cache.size >= this.maxCacheSize) {
        // Remove oldest entry (simple FIFO)
        const firstKey = this.cache.keys().next().value
        this.cache.delete(firstKey)
      }
      this.cache.set(filePath, result)

      return result
    } catch (error) {
      return null
    }
  }

  static clearCache() {
    this.cache.clear()
  }
}

class AubioAnalyzer {
  static async initialize() {
    try {
      const aubioModule = await import('aubiojs')
      return aubioModule.default || aubioModule
    } catch (e) {
      return null
    }
  }

  static async analyze(audioData, sampleRate, aubioInstance) {
    if (!aubioInstance || typeof aubioInstance.Tempo === 'undefined') {
      return null
    }

    if (!audioData || audioData.length === 0) return null

    try {
      const maxSamples = Math.min(audioData.length, sampleRate * CONFIG.ANALYSIS_DURATION)
      const limitedSamples = audioData.slice(0, maxSamples)

      const hopSize = 512
      const bufferSize = 1024
      const tempo = new aubioInstance.Tempo('default', bufferSize, hopSize, sampleRate)

      let bpmSum = 0
      let bpmCount = 0

      for (let i = 0; i < limitedSamples.length - hopSize; i += hopSize) {
        const chunk = limitedSamples.slice(i, i + hopSize)
        while (chunk.length < hopSize) chunk.push(0)

        const fvec = new aubioInstance.Fvec(hopSize)
        for (let j = 0; j < hopSize; j++) {
          fvec.set(j, chunk[j])
        }

        tempo.do(fvec)
        const currentBPM = tempo.getBpm()

        if (currentBPM && currentBPM > 0 && validateBPM(currentBPM)) {
          bpmSum += currentBPM
          bpmCount++
        }
      }

      if (bpmCount > 0) {
        const avgBPM = bpmSum / bpmCount
        return new BPMResult(roundBPM(avgBPM), 'aubio', 0.8, { readings: bpmCount })
      }
    } catch (error) {
      // Aubio analysis failed
    }

    return null
  }
}

class MusicTempoAnalyzer {
  static analyze(audioData, sampleRate) {
    try {
      const maxSamples = Math.min(audioData.length, sampleRate * CONFIG.ANALYSIS_DURATION)
      let audioArray = Array.from(audioData.slice(0, maxSamples))

      // Downsample if needed (optimized: direct indexing instead of filter)
      if (sampleRate > CONFIG.TARGET_SAMPLE_RATE) {
        const downsampleFactor = Math.floor(sampleRate / CONFIG.TARGET_SAMPLE_RATE)
        const downsampled = []
        for (let i = 0; i < audioArray.length; i += downsampleFactor) {
          downsampled.push(audioArray[i])
        }
        audioArray = downsampled
      }

      // Normalize
      const max = Math.max(...audioArray.map(Math.abs))
      if (max > 1) {
        audioArray = audioArray.map(sample => sample / max)
      }

      if (audioArray.length < 1000) return null

      const mt = new MusicTempo(audioArray, {
        bufferSize: 2048,
        hopSize: 441,
        peakThreshold: 0.3
      })

      const bpm = mt.tempo

      if (!bpm || isNaN(bpm)) return null

      // Try different tempo candidates (handle subdivisions)
      const candidates = [bpm, bpm * 2, bpm / 2, bpm * 4, bpm / 4]
      for (const candidate of candidates) {
        if (candidate >= CONFIG.VALID_BPM_RANGE.min && candidate <= CONFIG.VALID_BPM_RANGE.max) {
          return new BPMResult(roundBPM(candidate), 'music-tempo', 0.75, { original: bpm })
        }
      }
    } catch (error) {
      // music-tempo failed
    }

    return null
  }
}

class AutocorrelationAnalyzer {
  static detectOnsets(data, sampleRate) {
    const onsets = []
    const windowSize = Math.floor(sampleRate * 0.08)
    const threshold = 0.03
    const hopSize = Math.floor(windowSize / 4)

    let previousEnergy = 0
    let energyHistory = []
    const historySize = 5

    for (let i = windowSize; i < data.length - windowSize; i += hopSize) {
      let sumSquares = 0
      for (let j = i; j < i + windowSize && j < data.length; j++) {
        sumSquares += data[j] * data[j]
      }
      const rmsEnergy = Math.sqrt(sumSquares / windowSize)

      energyHistory.push(rmsEnergy)
      if (energyHistory.length > historySize) {
        energyHistory.shift()
      }

      const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length
      const energyIncrease = previousEnergy > 0 ? (rmsEnergy - previousEnergy) / previousEnergy : 0

      if (rmsEnergy > threshold && energyIncrease > 0.1 && rmsEnergy > avgEnergy * 1.1) {
        onsets.push(i / sampleRate)
      }

      previousEnergy = rmsEnergy
    }

    return onsets
  }

  // Optimized period scoring for binary search
  static scorePeriod(period, intervals) {
    let score = 0
    let count = 0
    const ratios = [1, 2, 0.5, 4, 0.25, 3, 0.333]

    for (const interval of intervals) {
      for (const ratio of ratios) {
        const testPeriod = period * ratio
        const diff = Math.abs(interval - testPeriod)
        const tolerance = testPeriod * 0.1

        if (diff < tolerance) {
          const matchQuality = 1 - (diff / tolerance)
          const weight = ratio === 1 ? 2 : 1
          score += matchQuality * weight
          count++
          break
        }
      }
    }

    return count > 0 ? (score / count) * Math.sqrt(count) : 0
  }

  static analyze(audioData, sampleRate) {
    const maxSamples = Math.min(audioData.length, sampleRate * CONFIG.ANALYSIS_DURATION)
    const data = audioData.slice(0, maxSamples)

    // Downsample
    const downsampleFactor = Math.floor(sampleRate / CONFIG.TARGET_SAMPLE_RATE)
    const downsampled = []
    for (let i = 0; i < data.length; i += downsampleFactor) {
      downsampled.push(data[i])
    }

    // Detect onsets
    const onsets = this.detectOnsets(downsampled, CONFIG.TARGET_SAMPLE_RATE)
    if (onsets.length < 8) return null

    // Calculate intervals
    const intervals = []
    for (let i = 1; i < onsets.length; i++) {
      const interval = onsets[i] - onsets[i - 1]
      if (interval >= 0.15 && interval <= 2.0) {
        intervals.push(interval)
      }
    }

    if (intervals.length < 4) return null

    // Create histogram
    const intervalHistogram = {}
    const tolerance = 0.03

    intervals.forEach(interval => {
      let matched = false
      for (const key in intervalHistogram) {
        const keyInterval = parseFloat(key)
        const relativeDiff = Math.abs(interval - keyInterval) / keyInterval
        if (relativeDiff <= tolerance) {
          intervalHistogram[key].intervals.push(interval)
          intervalHistogram[key].count++
          matched = true
          break
        }
      }

      if (!matched) {
        intervalHistogram[interval.toFixed(3)] = {
          intervals: [interval],
          count: 1
        }
      }
    })

    // Calculate candidates
    const intervalCandidates = []
    Object.entries(intervalHistogram).forEach(([key, data]) => {
      const avgInterval = data.intervals.reduce((a, b) => a + b, 0) / data.intervals.length
      const bpm = 60 / avgInterval
      intervalCandidates.push({
        interval: avgInterval,
        count: data.count,
        bpm: bpm,
        consistency: 1 - (data.intervals.reduce((sum, i) => sum + Math.abs(i - avgInterval), 0) / data.intervals.length / avgInterval)
      })
    })

    intervalCandidates.sort((a, b) => {
      const aScore = a.count * a.consistency
      const bScore = b.count * b.consistency
      return bScore - aScore
    })

    // Find fundamental tempo (optimized with binary search approach)
    const fundamentalCandidates = []

    // Use top candidates for faster processing
    const topCandidates = intervalCandidates.slice(0, 5)

    for (const candidate of topCandidates) {
      const multipliers = [1, 2, 4, 0.5, 0.25]

      for (const mult of multipliers) {
        const testInterval = candidate.interval * mult
        if (testInterval < 0.2 || testInterval > 2.0) continue

        const testBPM = 60 / testInterval

        if (testBPM >= CONFIG.VALID_BPM_RANGE.min && testBPM <= CONFIG.VALID_BPM_RANGE.max) {
          // Use optimized scoring
          const period = testInterval
          const score = this.scorePeriod(period, intervals.map(i => i))

          if (score > 0.3) {
            let supportCount = 0
            let totalWeight = 0

            for (const otherCandidate of intervalCandidates) {
              const ratio = otherCandidate.interval / testInterval
              const musicalRatios = [1, 2, 0.5, 4, 0.25, 3, 0.333, 1.5, 0.667]
              const closestRatio = musicalRatios.reduce((closest, r) =>
                Math.abs(ratio - r) < Math.abs(ratio - closest) ? r : closest
              )

              if (Math.abs(ratio - closestRatio) < 0.1) {
                const weight = closestRatio === 1 ? 3 : (closestRatio === 2 || closestRatio === 0.5 ? 2 : 1)
                supportCount += otherCandidate.count
                totalWeight += otherCandidate.count * weight
              }
            }

            if (supportCount > 0) {
              fundamentalCandidates.push({
                bpm: testBPM,
                interval: testInterval,
                supportCount: supportCount,
                totalWeight: totalWeight,
                baseCount: candidate.count,
                score: score
              })
            }
          }
        }
      }
    }

    // Sort by score/weight (prioritize higher scores)
    fundamentalCandidates.sort((a, b) => {
      // First by score if available
      if (a.score !== undefined && b.score !== undefined) {
        if (Math.abs(a.score - b.score) > 0.1) {
          return b.score - a.score
        }
      }
      // Then by total weight
      if (Math.abs(a.totalWeight - b.totalWeight) > 5) {
        return b.totalWeight - a.totalWeight
      }
      // Finally prefer BPMs closer to 120 (common tempo)
      const aDist = Math.abs(a.bpm - 120)
      const bDist = Math.abs(b.bpm - 120)
      return aDist - bDist
    })

    if (fundamentalCandidates.length > 0) {
      const best = fundamentalCandidates[0]
      if (best.totalWeight > 10 && best.bpm >= CONFIG.VALID_BPM_RANGE.min && best.bpm <= CONFIG.VALID_BPM_RANGE.max) {
        return new BPMResult(roundBPM(best.bpm), 'autocorrelation', 0.6, {
          supportCount: best.supportCount,
          totalWeight: best.totalWeight
        })
      }
    }

    return null
  }
}

// ============================================================================
// BPM DETECTION ORCHESTRATOR
// ============================================================================

class BPMDetector {
  constructor() {
    this.aubioInstance = null
  }

  async initialize() {
    this.aubioInstance = await AubioAnalyzer.initialize()
  }

  /**
   * Main detection flow: tries all methods in order of reliability
   * OPTIMIZED: Decode audio once, parallelize analyzers, early exit on high confidence
   */
  async detect(track, filePath) {
    const results = []

    // Step 1: Fast extractors (most reliable)
    const titleResult = TitleExtractor.extract(track)
    if (titleResult?.isValid()) {
      // Title extraction is very reliable, return early
      return titleResult
    }

    // Step 2: Metadata extraction
    if (filePath) {
      const metadataResult = await MetadataExtractor.extract(filePath)
      if (metadataResult?.isValid()) {
        results.push(metadataResult)
        // High confidence metadata, return early
        if (metadataResult.isHighConfidence() && metadataResult.confidence >= CONFIG.MIN_CONFIDENCE_FOR_EARLY_EXIT) {
          return metadataResult
        }
      }
    }

    // Step 3: Audio analysis (slower, less reliable)
    // OPTIMIZATION: Decode once, reuse for all analyzers
    if (filePath) {
      const decoded = AudioDecoder.decode(filePath)
      if (decoded) {
        const { audioData, sampleRate } = decoded

        // OPTIMIZATION: Run analyzers in parallel
        const analyzerPromises = []

        // Try Aubio (async)
        if (this.aubioInstance) {
          analyzerPromises.push(
            AubioAnalyzer.analyze(audioData, sampleRate, this.aubioInstance)
              .then(result => result?.isValid() ? result : null)
              .catch(() => null)
          )
        } else {
          analyzerPromises.push(Promise.resolve(null))
        }

        // Try music-tempo (sync, wrap in promise)
        analyzerPromises.push(
          Promise.resolve(MusicTempoAnalyzer.analyze(audioData, sampleRate))
            .then(result => result?.isValid() ? result : null)
        )

        // Try autocorrelation (sync, wrap in promise)
        analyzerPromises.push(
          Promise.resolve(AutocorrelationAnalyzer.analyze(audioData, sampleRate))
            .then(result => result?.isValid() ? result : null)
        )

        // Wait for all analyzers in parallel
        const analyzerResults = await Promise.all(analyzerPromises)

        // Collect valid results
        for (const result of analyzerResults) {
          if (result) {
            results.push(result)
            // Early exit if we get high confidence result
            if (result.isHighConfidence() && result.confidence >= CONFIG.MIN_CONFIDENCE_FOR_EARLY_EXIT) {
              return result
            }
          }
        }
      }
    }

    // Return best result (highest confidence)
    if (results.length > 0) {
      results.sort((a, b) => b.confidence - a.confidence)
      return results[0]
    }

    return null
  }
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processTracks(items, stats, detector, forceReanalyze = false) {
  for (const item of items) {
    if (item.tracks && Array.isArray(item.tracks)) {
      console.log(`\n📂 Processing ${item.tracks.length} tracks in "${item.name}"...`)

      for (let i = 0; i < item.tracks.length; i++) {
        const track = item.tracks[i]
        stats.total++

        // Skip if BPM already exists (unless forcing re-analysis)
        if (!forceReanalyze && track.bpm && track.bpm > 0) {
          stats.skipped++
          process.stdout.write(`   ⏭️  [${i + 1}/${item.tracks.length}] ${track.title} - BPM already set: ${track.bpm}\n`)
          continue
        }

        // Build file path
        // Track.file is like "/audio/unreleased/eps/..."
        // We need to map it to public/audio/unreleased/eps/...
        let filePath = null
        if (track.file) {
          // Remove leading /audio and join with public/audio
          const relativePath = track.file.replace(/^\/audio\//, '')
          filePath = join(process.cwd(), 'public', 'audio', relativePath)
        }

        // Detect BPM
        process.stdout.write(`   🔍 [${i + 1}/${item.tracks.length}] ${track.title} - Analyzing...`)

        const result = await detector.detect(track, filePath)

        if (result && result.isValid()) {
          track.bpm = result.bpm
          stats.updated++

          // Track source
          if (result.source === 'title') stats.fromTitle++
          else if (result.source.startsWith('metadata')) stats.fromMetadata++
          else stats.fromAudio++

          const confidence = result.isHighConfidence() ? '✅' : '⚠️'
          process.stdout.write(`\r   ${confidence} [${i + 1}/${item.tracks.length}] ${track.title} - BPM: ${result.bpm} (from ${result.source})\n`)
        } else {
          stats.notFound++
          process.stdout.write(`\r   ❌ [${i + 1}/${item.tracks.length}] ${track.title} - BPM not found\n`)
        }
      }
    }

    // Process children recursively
    if (item.children && Array.isArray(item.children)) {
      await processTracks(item.children, stats, detector, forceReanalyze)
    }
  }
}

async function analyzeBPM() {
  // Initialize detector
  const detector = new BPMDetector()
  await detector.initialize()

  // Check for --force flag
  const forceReanalyze = process.argv.includes('--force') || process.argv.includes('-f')

  if (forceReanalyze) {
    console.log('🔄 Force re-analysis mode: Will re-analyze all tracks...\n')
  }

  console.log('🎵 Starting BPM analysis for all tracks...\n')
  if (detector.aubioInstance) {
    console.log('✅ Using enhanced BPM detection tools (aubiojs available)\n')
  }

  // Read music library
  if (!existsSync(CONFIG.MUSIC_LIBRARY_FILE)) {
    console.error(`❌ Music library file not found: ${CONFIG.MUSIC_LIBRARY_FILE}`)
    process.exit(1)
  }

  const libraryData = JSON.parse(readFileSync(CONFIG.MUSIC_LIBRARY_FILE, 'utf-8'))

  const stats = {
    total: 0,
    updated: 0,
    skipped: 0,
    fromTitle: 0,
    fromMetadata: 0,
    fromAudio: 0,
    notFound: 0
  }

  // Process all tracks
  if (libraryData.folders && Array.isArray(libraryData.folders)) {
    await processTracks(libraryData.folders, stats, detector, forceReanalyze)
  }

  // Save updated library
  writeFileSync(CONFIG.MUSIC_LIBRARY_FILE, JSON.stringify(libraryData, null, 2))

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 BPM Analysis Summary')
  console.log('='.repeat(60))
  console.log(`Total tracks processed: ${stats.total}`)
  console.log(`✅ Updated with BPM: ${stats.updated}`)
  console.log(`   - From title: ${stats.fromTitle}`)
  console.log(`   - From metadata: ${stats.fromMetadata}`)
  console.log(`   - From audio analysis: ${stats.fromAudio}`)
  console.log(`⏭️  Skipped (already had BPM): ${stats.skipped}`)
  console.log(`❌ BPM not found: ${stats.notFound}`)
  console.log('='.repeat(60))
  console.log(`\n✅ Updated ${CONFIG.MUSIC_LIBRARY_FILE}`)
  console.log(`\n💡 Tracks without BPM will be analyzed in the browser when played.`)
}

// Run the analysis
analyzeBPM().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
