/**
 * Waveform Generator Agent
 * The "Father" - Creates waveform data that all other agents can use
 * Highest priority - runs first
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'

export class WaveformGeneratorAgent extends BaseAgent {
  type = AgentType.WAVEFORM_GENERATOR
  capabilities: AgentCapabilities = {
    canProcessInParallel: false, // Must run first, before others
    requiresAudioFile: true, // Needs actual audio file
    requiresMusicBrainz: false,
    estimatedProcessingTime: 2000, // Fast - just waveform extraction
    priority: 10 // HIGHEST PRIORITY - The "Father" agent
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const { trackTitle } = context

      // FIRST: Check if waveform already exists in database (from context)
      if (context.waveformData && context.waveformData.data && Array.isArray(context.waveformData.data) && context.waveformData.data.length > 0) {
        console.log(`[WaveformGenerator] ✅ Using existing waveform from database (${context.waveformData.data.length} samples)`)
        const processingTime = Date.now() - startTime
        
        return this.createSuccess({
          waveformData: context.waveformData.data,
          waveformSamples: context.waveformData.samples || context.waveformData.data.length,
          sampleRate: context.waveformData.sampleRate || 44100,
          version: 2,
          generatedAt: new Date().toISOString(),
          fromDatabase: true // Flag to indicate this came from DB, not generated
        }, 1.0, processingTime) // Perfect confidence - it's already in DB
      }

      // SECOND: Check if we have audio file URL to generate waveform
      const audioFileUrl = context.audioFeatures?.audioFileUrl || 
                          context.comprehensiveAnalysis?.audioFileUrl ||
                          null

      if (!audioFileUrl) {
        // Try to generate from file_path if we have it
        const filePath = context.comprehensiveAnalysis?.filePath
        if (filePath) {
          // Construct Supabase URL
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
          if (supabaseUrl) {
            const constructedUrl = `${supabaseUrl}/storage/v1/object/public/audio-files/${filePath}`
            return await this.generateWaveform(constructedUrl, trackTitle, startTime)
          }
        }
        
        // No waveform exists and no way to generate one
        console.log(`[WaveformGenerator] ⚠️ No existing waveform found and no audio file URL available`)
        return this.createFailure('No audio file URL available and no existing waveform in database', Date.now() - startTime)
      }

      // Generate new waveform (for new uploads)
      console.log(`[WaveformGenerator] 🔄 Generating new waveform from audio file...`)
      return await this.generateWaveform(audioFileUrl, trackTitle, startTime)
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }

  private async generateWaveform(
    audioFileUrl: string,
    trackTitle: string,
    startTime: number
  ): Promise<AgentResult> {
    try {
      // Use server-side waveform generation
      const waveform = await this.generateWaveformServerSide(audioFileUrl)
      
      if (!waveform || !waveform.data || waveform.data.length === 0) {
        return this.createFailure('Failed to generate waveform data', Date.now() - startTime)
      }

      const processingTime = Date.now() - startTime
      
      return this.createSuccess({
        waveformData: waveform.data,
        waveformSamples: waveform.length,
        sampleRate: waveform.sampleRate || 44100,
        version: 2, // Version 2 for agent-generated waveforms
        generatedAt: new Date().toISOString()
      }, 0.95, processingTime) // High confidence - waveform generation is reliable
    } catch (error: any) {
      return this.createFailure(`Waveform generation failed: ${error.message}`, Date.now() - startTime)
    }
  }

  /**
   * Generate waveform using server-side API or direct generation
   */
  private async generateWaveformServerSide(audioFileUrl: string): Promise<{
    data: number[]
    length: number
    sampleRate?: number
  } | null> {
    try {
      // Extract file path from URL
      const urlObj = new URL(audioFileUrl)
      const filePath = urlObj.pathname.replace('/storage/v1/object/public/audio-files/', '')
      
      // Call our waveform API endpoint
      const apiUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      const response = await fetch(`${apiUrl}/api/audio/waveform?path=${encodeURIComponent(filePath)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        
        if (data.waveform_data && Array.isArray(data.waveform_data)) {
          return {
            data: data.waveform_data,
            length: data.waveform_data.length,
            sampleRate: 44100
          }
        }
      }

      // If waveform doesn't exist in DB, generate it using audio analysis
      // This requires server-side audio processing
      console.log(`[WaveformGenerator] Waveform not in DB, generating from audio file...`)
      return await this.generateWaveformFromAudio(audioFileUrl)
    } catch (error: any) {
      console.warn(`[WaveformGenerator] API call failed:`, error.message)
      // Try direct generation as fallback
      return await this.generateWaveformFromAudio(audioFileUrl)
    }
  }

  /**
   * Generate waveform directly from audio file
   * This is a simplified version - in production, you'd use a proper audio processing library
   */
  private async generateWaveformFromAudio(audioFileUrl: string): Promise<{
    data: number[]
    length: number
    sampleRate?: number
  } | null> {
    // For now, return null - waveform generation from audio requires server-side processing
    // This would typically use ffmpeg or a Node.js audio library
    // The waveform should ideally be generated during upload or initial analysis
    console.warn(`[WaveformGenerator] Direct audio generation not implemented - requires server-side audio processing`)
    return null
  }
}

