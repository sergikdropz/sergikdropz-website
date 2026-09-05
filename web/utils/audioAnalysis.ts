/**
 * Audio analysis utilities using peaks.js, wavesurfer.js, and Tone.js
 * for accurate waveform visualization
 */

import {
  envelopesToLegacyPeaks,
  extractDspEnvelopesFromPcm,
  type DspEnvelopeBucket,
} from '@/lib/audio/waveform-dsp-envelope'

export interface PeakData {
  data: number[]
  length: number
  sampleRate: number
  /** Peak + RMS + Low/Mid/High filterbank envelopes (professional tape DSP). */
  envelopes?: DspEnvelopeBucket[]
}

/**
 * Generate peak + DSP band envelopes from audio file using Web Audio API.
 */
export async function generatePeakData(audioFile: string, samples: number = 2000): Promise<PeakData> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  try {
    const response = await fetch(audioFile, {
      headers: { 'ngrok-skip-browser-warning': '1' },
    })
    if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    const left = audioBuffer.getChannelData(0)
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null
    const envelopes = extractDspEnvelopesFromPcm({
      left,
      right,
      sampleRate: audioBuffer.sampleRate,
      buckets: samples,
    })
    const data = envelopesToLegacyPeaks(envelopes)

    return {
      data,
      envelopes,
      length: data.length,
      sampleRate: audioBuffer.sampleRate,
    }
  } finally {
    await audioContext.close().catch(() => {})
  }
}

/**
 * Analyze frequency bands for element detection
 */
export function analyzeFrequencyBands(
  frequencyData: Float32Array,
  sampleRate: number
): {
  kicks: number
  snares: number
  hihats: number
  cymbals: number
} {
  const nyquist = sampleRate / 2
  const binSize = nyquist / frequencyData.length
  
  const getBandEnergy = (lowFreq: number, highFreq: number): number => {
    const lowBin = Math.floor(lowFreq / binSize)
    const highBin = Math.floor(highFreq / binSize)
    let energy = 0
    
    for (let i = lowBin; i <= highBin && i < frequencyData.length; i++) {
      energy += Math.abs(frequencyData[i])
    }
    
    return energy / Math.max(1, highBin - lowBin + 1)
  }
  
  return {
    kicks: getBandEnergy(20, 250),
    snares: getBandEnergy(250, 500),
    hihats: getBandEnergy(2000, 8000),
    cymbals: getBandEnergy(8000, 20000)
  }
}

/**
 * Detect transients using spectral flux and energy change
 */
export function detectTransients(
  currentSpectrum: Float32Array,
  previousSpectrum: Float32Array | null,
  timeData: Float32Array,
  windowSize: number = 1024
): {
  spectralFlux: number
  energyChange: number
  isTransient: boolean
} {
  let spectralFlux = 0
  
  if (previousSpectrum) {
    for (let i = 0; i < currentSpectrum.length; i++) {
      const diff = Math.abs(currentSpectrum[i]) - Math.abs(previousSpectrum[i] || 0)
      if (diff > 0) {
        spectralFlux += diff
      }
    }
  }
  
  // Calculate energy change
  let currentEnergy = 0
  let previousEnergy = 0
  
  for (let i = 0; i < Math.min(windowSize, timeData.length); i++) {
    currentEnergy += timeData[i] * timeData[i]
  }
  currentEnergy = Math.sqrt(currentEnergy / windowSize)
  
  const energyChange = currentEnergy - previousEnergy
  const isTransient = spectralFlux > 0.15 || energyChange > 0.2
  
  return {
    spectralFlux,
    energyChange,
    isTransient
  }
}

/**
 * Use pre-computed peaks if available, otherwise use real-time data
 * This combines peaks.js style pre-computation with real-time updates
 */
export function combinePeakData(
  precomputedPeaks: number[] | null,
  realTimeData: Float32Array,
  currentTime: number,
  duration: number
): number[] {
  if (!precomputedPeaks || precomputedPeaks.length === 0) {
    // Fallback to real-time data
    const data: number[] = []
    const samples = Math.min(2000, realTimeData.length)
    const step = Math.floor(realTimeData.length / samples)
    
    for (let i = 0; i < samples; i++) {
      data.push(Math.abs(realTimeData[i * step]))
    }
    
    return data
  }
  
  // Use pre-computed peaks as base, enhance with real-time data at current position
  const position = duration > 0 ? currentTime / duration : 0
  const currentIndex = Math.floor(position * precomputedPeaks.length)
  
  // Blend pre-computed with real-time for current position
  const blended = [...precomputedPeaks]
  if (currentIndex < precomputedPeaks.length && realTimeData.length > 0) {
    const realTimeValue = Math.abs(realTimeData[Math.floor(realTimeData.length / 2)])
    blended[currentIndex] = (precomputedPeaks[currentIndex] * 0.7 + realTimeValue * 0.3)
  }
  
  return blended
}

/**
 * Detect BPM from audio file using autocorrelation-based onset detection
 */
export async function detectBPM(audioFile: string): Promise<number | null> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  try {
    const response = await fetch(audioFile)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    return analyzeBPM(audioBuffer)
  } catch (error) {
    console.warn('BPM detection failed:', error)
    return null
  } finally {
    await audioContext.close().catch(() => {})
  }
}

/**
 * Analyze BPM from audio buffer using improved autocorrelation (unbiased)
 * Fallback method when Realtime BPM Analyzer is not available
 */
function analyzeBPM(audioBuffer: AudioBuffer): number | null {
  const sampleRate = audioBuffer.sampleRate
  const channelData = audioBuffer.getChannelData(0) // Use first channel
  const length = channelData.length
  
  // Limit analysis to first 30 seconds for faster processing (reduced from 45)
  const maxSamples = Math.min(length, sampleRate * 30)
  const data = channelData.slice(0, maxSamples)
  
  // Downsample for performance (analyze at ~11kHz)
  const targetSampleRate = 11025
  const downsampleFactor = Math.floor(sampleRate / targetSampleRate)
  const downsampled: number[] = []
  // Pre-allocate array for better performance
  const expectedLength = Math.ceil(data.length / downsampleFactor)
  downsampled.length = expectedLength
  let downsampledIndex = 0
  for (let i = 0; i < data.length; i += downsampleFactor) {
    downsampled[downsampledIndex++] = data[i]
  }
  // Trim to actual length
  downsampled.length = downsampledIndex
  
  // Find onset times using energy-based onset detection
  const onsets = detectOnsets(downsampled, targetSampleRate)
  
  if (onsets.length < 8) {
    return null
  }
  
  // Calculate inter-onset intervals (IOI)
  const intervals: number[] = []
  for (let i = 1; i < onsets.length; i++) {
    const interval = onsets[i] - onsets[i - 1]
    if (interval >= 0.15 && interval <= 2.0) {
      intervals.push(interval)
    }
  }
  
  if (intervals.length < 4) {
    return null
  }
  
  // Use autocorrelation to find the fundamental period (optimized with binary search)
  const minBPM = 60
  const maxBPM = 180
  const minPeriod = 60 / maxBPM  // ~0.33 seconds
  const maxPeriod = 60 / minBPM  // 1.0 second
  
  // Optimized: Coarse search first (larger steps), then fine search
  let bestPeriod = null
  let bestScore = 0
  
  // Coarse search: 50ms steps (faster)
  const coarseStep = 0.05
  for (let period = minPeriod; period <= maxPeriod; period += coarseStep) {
    const score = scorePeriod(period, intervals)
    if (score > bestScore) {
      bestScore = score
      bestPeriod = period
    }
  }
  
  // Fine search around best period: 10ms steps (more accurate)
  if (bestPeriod) {
    const fineMin = Math.max(minPeriod, bestPeriod - 0.1)
    const fineMax = Math.min(maxPeriod, bestPeriod + 0.1)
    const fineStep = 0.01
    
    for (let period = fineMin; period <= fineMax; period += fineStep) {
      const score = scorePeriod(period, intervals)
      if (score > bestScore) {
        bestScore = score
        bestPeriod = period
      }
    }
  }
  
  // Helper function for period scoring
  function scorePeriod(period: number, intervals: number[]): number {
    let score = 0
    let count = 0
    const ratios = [1, 2, 0.5, 4, 0.25, 3, 0.333]
    
    for (const interval of intervals) {
      for (const ratio of ratios) {
        const testPeriod = period * ratio
        const diff = Math.abs(interval - testPeriod)
        const tolerance = testPeriod * 0.1 // 10% tolerance
        
        if (diff < tolerance) {
          const matchQuality = 1 - (diff / tolerance)
          const weight = ratio === 1 ? 2 : 1 // Weight direct matches more
          score += matchQuality * weight
          count++
          break
        }
      }
    }
    
    return count > 0 ? (score / count) * Math.sqrt(count) : 0
  }
  
  // If we found a good match, return the BPM
  if (bestPeriod && bestScore > 0.3) {
    const bpm = 60 / bestPeriod
    const roundedBPM = Math.round(bpm)
    
    if (roundedBPM >= 60 && roundedBPM <= 180) {
      return roundedBPM
    }
  }
  
  // Fallback: histogram approach
  const histogram: { [key: string]: { count: number; total: number } } = {}
  const tolerance = 0.02
  
  intervals.forEach(interval => {
    let matched = false
    for (const key in histogram) {
      const keyInterval = parseFloat(key)
      if (Math.abs(interval - keyInterval) / keyInterval <= tolerance) {
        histogram[key].count++
        histogram[key].total += interval
        matched = true
        break
      }
    }
    
    if (!matched) {
      const rounded = Math.round(interval * 100) / 100
      histogram[rounded.toString()] = { count: 1, total: interval }
    }
  })
  
  const candidates: Array<{ interval: number; count: number; bpm: number }> = []
  Object.entries(histogram).forEach(([intervalStr, data]) => {
    const avgInterval = data.total / data.count
    const bpm = 60 / avgInterval
    candidates.push({ 
      interval: avgInterval, 
      count: data.count,
      bpm: bpm
    })
  })
  
  candidates.sort((a, b) => b.count - a.count)
  
  // Try to find fundamental by testing multiples
  if (candidates.length > 0) {
    const topCandidates = candidates.slice(0, 5)
    
    for (const candidate of topCandidates) {
      const multipliers = [2, 4, 1, 0.5, 0.25]
      
      for (const mult of multipliers) {
        const testInterval = candidate.interval * mult
        if (testInterval < 0.2 || testInterval > 2.0) continue
        
        const testBPM = 60 / testInterval
        
        let matchCount = 0
        for (const otherCandidate of candidates) {
          const ratio = otherCandidate.interval / testInterval
          const ratios = [1, 2, 0.5, 4, 0.25, 3, 0.333]
          const isMatch = ratios.some(r => Math.abs(ratio - r) < 0.15)
          if (isMatch) {
            matchCount += otherCandidate.count
          }
        }
        
        if (testBPM >= 70 && testBPM <= 160 && matchCount > candidate.count * 0.5) {
          return Math.round(testBPM)
        }
      }
    }
    
    // Last resort
    const bpm = Math.round(candidates[0].bpm)
    if (bpm >= 60 && bpm <= 180) {
      return bpm
    }
  }
  
  return null
}

/**
 * Detect onsets (beat starts) in audio data
 * Optimized with better energy calculation
 */
function detectOnsets(data: number[], sampleRate: number): number[] {
  const onsets: number[] = []
  const windowSize = Math.floor(sampleRate * 0.08) // 80ms window (slightly smaller for better resolution)
  const threshold = 0.1 // Energy threshold
  const hopSize = Math.floor(windowSize / 4) // Overlap windows for better detection
  
  let previousEnergy = 0
  const energyHistory: number[] = []
  const historySize = 5
  
  for (let i = windowSize; i < data.length - windowSize; i += hopSize) {
    // Calculate RMS energy in this window (more accurate than simple average)
    let sumSquares = 0
    for (let j = i; j < i + windowSize && j < data.length; j++) {
      const sample = data[j]
      sumSquares += sample * sample
    }
    const rmsEnergy = Math.sqrt(sumSquares / windowSize)
    
    // Track energy history for adaptive threshold
    energyHistory.push(rmsEnergy)
    if (energyHistory.length > historySize) {
      energyHistory.shift()
    }
    
    const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length
    const energyIncrease = previousEnergy > 0 ? (rmsEnergy - previousEnergy) / previousEnergy : 0
    
    // Detect onset if energy increases significantly and is above threshold
    if (rmsEnergy > threshold && energyIncrease > 0.1 && rmsEnergy > avgEnergy * 1.1) {
      onsets.push(i / sampleRate) // Convert to seconds
    }
    
    previousEnergy = rmsEnergy
  }
  
  return onsets
}

