/**
 * Emotional Psychologist Agent
 * Specializes in: Emotional intelligence grounded in measured groove + encyclopedia.
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import { formatBlackboardPrompt } from '@/lib/audio/sonic-dna-v2/agent-blackboard'

export class EmotionalPsychologistAgent extends BaseAgent {
  type = AgentType.EMOTIONAL_PSYCHOLOGIST
  capabilities: AgentCapabilities = {
    canProcessInParallel: true,
    requiresAudioFile: false,
    requiresMusicBrainz: false,
    estimatedProcessingTime: 5000,
    priority: 4,
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const { trackTitle, artistName, audioFeatures, comprehensiveAnalysis, blackboard } = context
      const emotions = blackboard?.kb?.emotions?.join(', ') || ''

      const prompt = `You are an expert music psychologist writing on a shared Sonic DNA blackboard.

${formatBlackboardPrompt(blackboard)}

Track: "${trackTitle}" by ${artistName}
BPM: ${(blackboard?.measured?.bpm ?? audioFeatures?.bpm) || 'Unknown'}
Energy: ${audioFeatures?.energyLevel || 'Unknown'}
${comprehensiveAnalysis?.harmony?.keySignature || blackboard?.measured?.key ? `Key: ${blackboard?.measured?.key || comprehensiveAnalysis?.harmony?.keySignature}` : ''}
Suggested affect cluster from encyclopedia: ${emotions || 'unmarked'}

Focus on AFFECT only (emotions + journey). Dedicated psychology / psychoacoustics agents handle deeper profiles.
Prefer measured pulse/drums + encyclopedia affect cluster over title guesses. Maximum 100 words per field:

{
  "primaryEmotions": ["emotion1", "emotion2", "emotion3", "emotion4", "emotion5"],
  "emotionalJourney": "CONCISE emotional arc (80-100 words) bound to BPM/feel/drums.",
  "psychologicalProfile": "OPTIONAL short bridge (40-60 words) if affect implies a clear tendency; otherwise omit — psychology_analyst owns the full profile."
}`

      const emotional = await this.callAI(this.withUserDirective(prompt, context), 2000)
      const processingTime = Date.now() - startTime

      if (emotional) {
        return this.createSuccess(emotional, 0.85, processingTime)
      }
      return this.createFailure('AI analysis failed', processingTime)
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }
}
