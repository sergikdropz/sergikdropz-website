/**
 * Harmony Analyst Agent
 * Specializes in: Harmonic analysis, scale, key signature, time signature
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import { peerAgentData } from '@/lib/audio/sonic-dna-v2/agent-blackboard'

export class HarmonyAnalystAgent extends BaseAgent {
  type = AgentType.HARMONY_ANALYST
  capabilities: AgentCapabilities = {
    canProcessInParallel: true,
    requiresAudioFile: false,
    requiresMusicBrainz: false,
    estimatedProcessingTime: 3000, // AI call
    priority: 7
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const { comprehensiveAnalysis, previousAgentResults } = context

      const harmony = comprehensiveAnalysis?.harmony
      const technical = peerAgentData(previousAgentResults, AgentType.TECHNICAL_ANALYZER)
      const seededKey = context.blackboard?.measured?.key

      if (!harmony && !technical && !seededKey) {
        return this.createFailure('No harmony data available', Date.now() - startTime)
      }

      // Extract harmony data
      const harmonyData = {
        keySignature: harmony?.keySignature || technical?.key?.key || seededKey || 'Unknown',
        scale: harmony?.scale || technical?.key?.scale || 'major',
        tonality: harmony?.tonality || (technical?.key?.mode === 'minor' ? 'minor' : 'major'),
        timeSignature: comprehensiveAnalysis?.technical?.timeSignature || technical?.timeSignature || '4/4'
      }

      // Generate technical description if meaningful
      let technicalDescription: string | null = null
      if (harmonyData.keySignature !== 'Unknown') {
        technicalDescription = await this.generateTechnicalDescription(harmonyData, context)
      }

      const result = {
        ...harmonyData,
        technicalDescription
      }

      const processingTime = Date.now() - startTime
      return this.createSuccess(result, 0.85, processingTime)
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }

  private async generateTechnicalDescription(harmonyData: any, context: AgentContext): Promise<string | null> {
    const prompt = `You are an expert audio engineer. Provide a CONCISE, CONTEXT-AWARE technical analysis:

Track: "${context.trackTitle}" by ${context.artistName}
Key: ${harmonyData.keySignature}
Scale: ${harmonyData.scale}
Tonality: ${harmonyData.tonality}
Time Signature: ${harmonyData.timeSignature}
BPM: ${context.audioFeatures?.bpm || 'Unknown'}
Energy Level: ${context.audioFeatures?.energyLevel || 'Unknown'}
${context.comprehensiveAnalysis?.genres?.primary ? `Genres: ${context.comprehensiveAnalysis.genres.primary.join(', ')}` : ''}

Write a CONCISE technical analysis (80-100 words). Be CONTEXT-AWARE and cover:
- Key production techniques and mixing approach
- Sound design and timbral characteristics
- Spatial and dynamic processing (if notable)
- Harmonic content and musical structure
- How technical choices support the music

Return JSON:
{
  "technicalDescription": "Your concise, context-aware technical analysis here (80-100 words maximum)"
}`

    const result = await this.callAI(this.withUserDirective(prompt, context), 2000)
    return result?.technicalDescription || null
  }
}
