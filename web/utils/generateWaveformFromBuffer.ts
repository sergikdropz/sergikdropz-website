/**
 * Generate waveform from audio file buffer
 * Works during upload - generates waveform immediately from buffer
 */

import { decode } from 'node-wav'

export interface WaveformResult {
  data: number[]
  samples: number
  sampleRate: number
}

/**
 * Generate waveform data from audio buffer
 * Supports WAV files directly, other formats need conversion
 */
export async function generateWaveformFromBuffer(
  buffer: Buffer,
  fileName: string,
  samples: number = 2000
): Promise<WaveformResult | null> {
  try {
    const ext = fileName.split('.').pop()?.toLowerCase()
    
    // For WAV files, decode directly
    if (ext === 'wav') {
      try {
        const wavData = decode(buffer)
        const audioData = wavData.channelData[0] // Get first channel
        const sampleRate = wavData.sampleRate
        
        // Generate waveform samples
        const blockSize = Math.floor(audioData.length / samples)
        const waveformData: number[] = []
        
        for (let i = 0; i < samples; i++) {
          const blockStart = blockSize * i
          let sum = 0
          let max = 0
          
          for (let j = 0; j < blockSize && (blockStart + j) < audioData.length; j++) {
            const sample = Math.abs(audioData[blockStart + j])
            sum += sample
            max = Math.max(max, sample)
          }
          
          // Combine RMS and peak
          const rms = Math.sqrt(sum / blockSize)
          const peak = max
          waveformData.push((rms * 0.7 + peak * 0.3))
        }
        
        return {
          data: waveformData,
          samples: waveformData.length,
          sampleRate
        }
      } catch (error: any) {
        console.warn(`[Waveform] WAV decode failed: ${error.message}`)
      }
    }
    
    // For other formats, we'd need ffmpeg or similar
    // For now, return null - will be generated later from file URL
    console.log(`[Waveform] Format ${ext} requires conversion - will generate from file URL`)
    return null
  } catch (error: any) {
    console.warn(`[Waveform] Buffer generation failed: ${error.message}`)
    return null
  }
}

