/**
 * Musicologist Agent
 * Specializes in: Musicological analysis, era, style, production
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import { formatBlackboardPrompt } from '@/lib/audio/sonic-dna-v2/agent-blackboard'

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
      const kb = context.blackboard?.kb
      if (!musicology && !kb) {
        return this.createFailure('No musicology data available', Date.now() - startTime)
      }

      // Extract musicology data (fallback to encyclopedia eras/theory)
      const musicologyData = {
        era: musicology?.era || (kb?.eras?.length ? { decade: kb.eras[0], description: kb.profileExcerpt } : null),
        style: musicology?.style || (kb ? { primaryStyle: kb.primary, description: kb.profileExcerpt } : null),
        production: musicology?.production || null,
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
    const prompt = `You are an expert musicologist writing on a shared Sonic DNA blackboard.

${formatBlackboardPrompt(context.blackboard)}

Track: "${context.trackTitle}" by ${context.artistName}
Era/Decade: ${musicologyData.era?.decade || context.blackboard?.kb?.eras?.[0] || 'Unknown'}
${musicologyData.era?.description ? `Era Description: ${String(musicologyData.era.description).slice(0, 280)}` : ''}
Primary Style: ${musicologyData.style?.primaryStyle || context.blackboard?.kb?.primary || 'Unknown'}
Production Techniques: ${musicologyData.production?.techniques?.join(', ') || 'Unknown'}
BPM: ${(context.blackboard?.measured?.bpm ?? context.audioFeatures?.bpm) || 'Unknown'}

CRITICAL: History/theory must follow measured groove class + encyclopedia — not crate names.

Write a CONCISE musicological analysis (80-120 words).

Return JSON:
{
  "description": "Your concise, context-aware musicological analysis here (80-120 words maximum) or null if musicological data is insufficient"
}`

    const result = await this.callAI(this.withUserDirective(prompt, context), 2000)
    return result?.description || null
  }
}
