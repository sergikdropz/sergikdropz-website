/**
 * Technical Analyzer Agent
 * Specializes in: BPM, key, scale, time signature, energy, danceability
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'

export class TechnicalAnalyzerAgent extends BaseAgent {
  type = AgentType.TECHNICAL_ANALYZER
  capabilities: AgentCapabilities = {
    canProcessInParallel: true,
    requiresAudioFile: false, // Can work with existing metadata
    requiresMusicBrainz: false,
    estimatedProcessingTime: 500, // Fast - mostly data extraction
    priority: 9 // High priority - foundational data
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const { audioFeatures, comprehensiveAnalysis } = context

      // Extract technical data from comprehensive analysis or audio features
      const technical = {
        bpm: comprehensiveAnalysis?.technical?.bpm || audioFeatures?.bpm || null,
        key: comprehensiveAnalysis?.harmony?.keySignature 
          ? {
              key: comprehensiveAnalysis.harmony.keySignature.split(' ')[0] || comprehensiveAnalysis.harmony.keySignature,
              mode: comprehensiveAnalysis.harmony.scale || comprehensiveAnalysis.harmony.tonality || 'major',
              scale: comprehensiveAnalysis.harmony.scale || comprehensiveAnalysis.harmony.tonality || 'major',
              confidence: 0.8
            }
          : audioFeatures?.key ? {
              key: audioFeatures.key.split(' ')[0] || audioFeatures.key,
              mode: 'major',
              scale: 'major',
              confidence: 0.6
            } : null,
        timeSignature: comprehensiveAnalysis?.technical?.timeSignature || audioFeatures?.timeSignature || '4/4',
        energyLevel: comprehensiveAnalysis?.technical?.energy?.level || audioFeatures?.energyLevel || null,
        danceability: comprehensiveAnalysis?.technical?.danceability || null,
        technicalDescription: null // Will be filled by AI if needed
      }

      const processingTime = Date.now() - startTime
      return this.createSuccess(technical, 0.9, processingTime)
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }
}

