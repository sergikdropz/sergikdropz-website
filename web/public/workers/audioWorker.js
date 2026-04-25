/**
 * Web Worker for audio processing (BPM detection and peak generation)
 * Runs in a separate thread to avoid blocking the main UI
 */

// Generate peak data from audio buffer
function generatePeakDataFromBuffer(audioBuffer, samples = 2000) {
  const rawData = audioBuffer.getChannelData(0) // Get first channel
  const blockSize = Math.floor(rawData.length / samples)
  const filteredData = []
  
  for (let i = 0; i < samples; i++) {
    const blockStart = blockSize * i
    let sum = 0
    let max = 0
    
    for (let j = 0; j < blockSize; j++) {
      const sample = Math.abs(rawData[blockStart + j])
      sum += sample
      max = Math.max(max, sample)
    }
    
    // Use RMS for smoother visualization, but keep peak for transients
    const rms = Math.sqrt(sum / blockSize)
    const peak = max
    // Combine RMS and peak for better transient visibility
    filteredData.push((rms * 0.7 + peak * 0.3))
  }
  
  return filteredData
}

// Detect onsets (beat starts) in audio data
// Optimized with better energy calculation and adaptive threshold
function detectOnsets(data, sampleRate) {
  const onsets = []
  const windowSize = Math.floor(sampleRate * 0.08) // 80ms window (slightly smaller for better resolution)
  const threshold = 0.1 // Energy threshold
  const hopSize = Math.floor(windowSize / 4) // Overlap windows for better detection
  
  let previousEnergy = 0
  const energyHistory = []
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

// Analyze BPM from audio buffer
function analyzeBPM(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate
  const channelData = audioBuffer.getChannelData(0)
  const length = channelData.length
  
  // Limit analysis to first 30 seconds for faster processing (reduced from 45)
  const maxSamples = Math.min(length, sampleRate * 30)
  const data = channelData.slice(0, maxSamples)
  
  // Downsample for performance (analyze at ~11kHz)
  const targetSampleRate = 11025
  const downsampleFactor = Math.floor(sampleRate / targetSampleRate)
  // Pre-allocate array for better performance
  const expectedLength = Math.ceil(data.length / downsampleFactor)
  const downsampled = new Array(expectedLength)
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
  const intervals = []
  for (let i = 1; i < onsets.length; i++) {
    const interval = onsets[i] - onsets[i - 1]
    if (interval >= 0.15 && interval <= 2.0) {
      intervals.push(interval)
    }
  }
  
  if (intervals.length < 4) {
    return null
  }
  
  // Use optimized autocorrelation approach (similar to audioAnalysis.ts)
  const minBPM = 60
  const maxBPM = 180
  const minPeriod = 60 / maxBPM  // ~0.33 seconds
  const maxPeriod = 60 / minBPM  // 1.0 second
  
  // Optimized: Coarse search first, then fine search
  let bestPeriod = null
  let bestScore = 0
  
  // Coarse search: 50ms steps
  const coarseStep = 0.05
  for (let period = minPeriod; period <= maxPeriod; period += coarseStep) {
    const score = scorePeriod(period, intervals)
    if (score > bestScore) {
      bestScore = score
      bestPeriod = period
    }
  }
  
  // Fine search around best period: 10ms steps
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
  function scorePeriod(period, intervals) {
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
  
  // If we found a good match, return the BPM
  if (bestPeriod && bestScore > 0.3) {
    const bpm = 60 / bestPeriod
    const roundedBPM = Math.round(bpm)
    
    if (roundedBPM >= 60 && roundedBPM <= 180) {
      return roundedBPM
    }
  }
  
  // Fallback: histogram approach
  const histogram = {}
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
  
  const candidates = []
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
  
  if (candidates.length > 0) {
    const bpm = Math.round(candidates[0].bpm)
    if (bpm >= 60 && bpm <= 180) {
      return bpm
    }
  }
  
  return null
}

// Main worker message handler
self.addEventListener('message', async (event) => {
  const { id, type, audioUrl, samples = 2000 } = event.data
  
  try {
    // Download and decode audio
    const response = await fetch(audioUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    
    // Create AudioContext - handle different browser implementations
    // Note: AudioContext is available in Web Workers in modern browsers
    let AudioContextClass = null
    if (typeof AudioContext !== 'undefined') {
      AudioContextClass = AudioContext
    } else if (typeof self.AudioContext !== 'undefined') {
      AudioContextClass = self.AudioContext
    } else if (typeof webkitAudioContext !== 'undefined') {
      AudioContextClass = webkitAudioContext
    } else if (typeof self.webkitAudioContext !== 'undefined') {
      AudioContextClass = self.webkitAudioContext
    } else {
      throw new Error('AudioContext is not supported in this environment')
    }
    
    const audioContext = new AudioContextClass()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    
    let result = {}

    if (type === 'generatePeaks' || type === 'both') {
      const peakData = generatePeakDataFromBuffer(audioBuffer, samples)
      result.peaks = {
        data: peakData,
        length: samples,
        sampleRate: audioBuffer.sampleRate
      }
    }

    if (type === 'detectBPM' || type === 'both') {
      result.bpm = analyzeBPM(audioBuffer)
    }

    await audioContext.close()

    self.postMessage({ id, type: 'success', data: result })
  } catch (error) {
    const response = {
      id,
      type: 'error',
      error: error.message || 'Unknown error'
    }
    self.postMessage(response)
  }
})

