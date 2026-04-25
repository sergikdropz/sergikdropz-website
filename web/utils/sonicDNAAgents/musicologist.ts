/**
 * Musicologist Agent
 * Specializes in: Musicological analysis, era, style, production
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'

export class MusicologistAgent extends BaseAgent {
  type = AgentType.MUSICOLOGIST
  capabilities: AgentCapabilities = {
    canProcessInParallel: true,
    requiresAudioFile: false,
    requiresMusicBrainz: true, // Benefits from MusicBrainz data
    estimatedProcessingTime: 3500, // AI call
    priority: 5
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const { comprehensiveAnalysis, musicbrainzData } = context

      const musicology = comprehensiveAnalysis?.musicology
      if (!musicology) {
        return this.createFailure('No musicology data available', Date.now() - startTime)
      }

      // Extract musicology data
      const musicologyData = {
        era: musicology.era || null,
        style: musicology.style || null,
        production: musicology.production || null
      }

      // Generate description if we have meaningful data
      let description: string | null = null
      if (musicologyData.era || musicologyData.style || musicologyData.production) {
        description = await this.generateDescription(musicologyData, context)
      }

      const result = {
        ...musicologyData,
        description
      }

      const processingTime = Date.now() - startTime
      return this.createSuccess(result, 0.85, processingTime)
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }

  private async generateDescription(musicologyData: any, context: AgentContext): Promise<string | null> {
    const prompt = `You are an expert musicologist. Provide a CONCISE, CONTEXT-AWARE musicological analysis:

Track: "${context.trackTitle}" by ${context.artistName}
Era/Decade: ${musicologyData.era?.decade || 'Unknown'}
${musicologyData.era?.description ? `Era Description: ${musicologyData.era.description}` : ''}
Primary Style: ${musicologyData.style?.primaryStyle || 'Unknown'}
${musicologyData.style?.description ? `Style Description: ${musicologyData.style.description}` : ''}
Production Techniques: ${musicologyData.production?.techniques?.join(', ') || 'Unknown'}
${musicologyData.production?.description ? `Production Description: ${musicologyData.production.description}` : ''}
BPM: ${context.audioFeatures?.bpm || 'Unknown'}
Energy Level: ${context.audioFeatures?.energyLevel || 'Unknown'}
${context.comprehensiveAnalysis?.genres?.primary ? `Genres: ${context.comprehensiveAnalysis.genres.primary.join(', ')}` : ''}

Write a CONCISE musicological analysis (80-100 words). Be CONTEXT-AWARE and cover:
- Historical context and era characteristics
- Stylistic significance and genre evolution
- Production era and technology (if relevant)
- How this track fits into musical history
- Musicological significance

Return JSON:
{
  "description": "Your concise, context-aware musicological analysis here (80-100 words maximum) or null if musicological data is insufficient"
}`

    const result = await this.callAI(this.withUserDirective(prompt, context), 2000)
    return result?.description || null
  }
}
