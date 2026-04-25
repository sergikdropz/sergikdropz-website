/**
 * Emotional Psychologist Agent
 * Specializes in: Emotional intelligence, psychological profiles, mood analysis
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'

export class EmotionalPsychologistAgent extends BaseAgent {
  type = AgentType.EMOTIONAL_PSYCHOLOGIST
  capabilities: AgentCapabilities = {
    canProcessInParallel: true,
    requiresAudioFile: false,
    requiresMusicBrainz: false,
    estimatedProcessingTime: 5000, // AI call
    priority: 4
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const { trackTitle, artistName, audioFeatures, comprehensiveAnalysis, previousAgentResults } = context

      const prompt = `You are an expert music psychologist. Provide CONTEXT-AWARE emotional and psychological analysis based on the actual track:

Track: "${trackTitle}" by ${artistName}
BPM: ${audioFeatures?.bpm || 'Unknown'}
Energy: ${audioFeatures?.energyLevel || 'Unknown'}
${comprehensiveAnalysis?.genres?.primary ? `Genres: ${comprehensiveAnalysis.genres.primary.join(', ')}` : ''}
${comprehensiveAnalysis?.harmony?.keySignature ? `Key: ${comprehensiveAnalysis.harmony.keySignature}` : ''}
${comprehensiveAnalysis?.harmony?.scale ? `Scale: ${comprehensiveAnalysis.harmony.scale}` : ''}

Provide CONCISE, CONTEXT-AWARE analysis. Maximum 100 words per field. Be specific to this track:

{
  "primaryEmotions": ["emotion1", "emotion2", "emotion3", "emotion4", "emotion5"],
  "emotionalJourney": "CONCISE description of the emotional arc and evolution (80-100 words). Describe how emotions develop throughout the track, key emotional moments, and the overall emotional narrative. Be specific to this track's BPM, energy level, and genre.",
  
  "psychologicalProfile": "CONCISE psychological impact analysis (80-100 words). Describe how this specific track affects the mind: cognitive responses, mood regulation, therapeutic potential, and psychological states evoked. Be context-aware based on the track's characteristics."
}

Be thorough but concise. Ensure BOTH fields are filled.`

      const emotional = await this.callAI(this.withUserDirective(prompt, context), 2000)
      const processingTime = Date.now() - startTime

      if (emotional) {
        return this.createSuccess(emotional, 0.85, processingTime)
      } else {
        return this.createFailure('AI analysis failed', processingTime)
      }
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }
}
