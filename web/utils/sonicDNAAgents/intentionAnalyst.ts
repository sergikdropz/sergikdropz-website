/**
 * Intention Analyst Agent
 * Specializes in: Understanding the purpose and intention of the music
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'

export class IntentionAnalystAgent extends BaseAgent {
  type = AgentType.INTENTION_ANALYST
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
      const { trackTitle, artistName, audioFeatures, comprehensiveAnalysis, musicbrainzData } = context

      // Build focused prompt for intention analysis
      const prompt = `You are an expert music analyst. Provide a CONCISE, CONTEXT-AWARE analysis of the intention and purpose of this track:

Track: "${trackTitle}" by ${artistName}
BPM: ${audioFeatures?.bpm || 'Unknown'}
${comprehensiveAnalysis?.genres?.primary ? `Genres: ${comprehensiveAnalysis.genres.primary.join(', ')}` : ''}
${audioFeatures?.energyLevel ? `Energy Level: ${audioFeatures.energyLevel}` : ''}
${comprehensiveAnalysis?.harmony?.keySignature ? `Key: ${comprehensiveAnalysis.harmony.keySignature}` : ''}
${comprehensiveAnalysis?.harmony?.scale ? `Scale: ${comprehensiveAnalysis.harmony.scale}` : ''}

Provide a CONCISE intention analysis (80-100 words). Be CONTEXT-AWARE and cover:
- Primary intention and artistic goal
- Message or experience being communicated
- Function and purpose (dance, meditation, storytelling, etc.)
- Emotional/psychological intention
- Cultural/social context (if relevant)
- What makes this intention unique

Return ONLY a JSON object with:
{
  "intention": "Your concise, context-aware intention analysis here (80-100 words maximum)"
}`

      const result = await this.callAI(this.withUserDirective(prompt, context), 1500)
      const intention = result?.intention || null
      const processingTime = Date.now() - startTime

      if (intention) {
        return this.createSuccess({ intention }, 0.85, processingTime)
      } else {
        return this.createFailure('AI analysis failed', processingTime)
      }
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }
}
