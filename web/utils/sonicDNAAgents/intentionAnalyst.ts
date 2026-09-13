/**
 * Intention Analyst Agent
 * Specializes in: Purpose / floor role from measured groove + encyclopedia sonic intent.
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import { formatBlackboardPrompt, peerAgentData } from '@/lib/audio/sonic-dna-v2/agent-blackboard'

export class IntentionAnalystAgent extends BaseAgent {
  type = AgentType.INTENTION_ANALYST
  capabilities: AgentCapabilities = {
    canProcessInParallel: false,
    requiresAudioFile: false,
    requiresMusicBrainz: false,
    estimatedProcessingTime: 3000,
    priority: 7,
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const { trackTitle, artistName, audioFeatures, comprehensiveAnalysis, previousAgentResults, blackboard } =
        context
      const drums = peerAgentData(previousAgentResults, AgentType.DRUM_PATTERN_EXPERT)
      const genre = peerAgentData(previousAgentResults, AgentType.GENRE_SPECIALIST)
      const psychology = peerAgentData(previousAgentResults, AgentType.PSYCHOLOGY_ANALYST)
      const psycho = peerAgentData(previousAgentResults, AgentType.PSYCHOACOUSTICS_ANALYST)

      const prompt = `You are an expert music analyst writing intention from a shared Sonic DNA blackboard.

${formatBlackboardPrompt(blackboard)}

Track: "${trackTitle}" by ${artistName}
BPM: ${(blackboard?.measured?.bpm ?? audioFeatures?.bpm) || 'Unknown'}
${genre?.primaryGenres?.length ? `Genres: ${genre.primaryGenres.join(', ')}` : comprehensiveAnalysis?.genres?.primary ? `Genres: ${comprehensiveAnalysis.genres.primary.join(', ')}` : ''}
${drums?.signatureMatch?.name || drums?.pattern?.patternType ? `Drums: ${drums?.signatureMatch?.name || drums?.pattern?.patternType}` : ''}
${psychology?.psychologicalProfile ? `Psychology peer: ${String(psychology.psychologicalProfile).slice(0, 160)}` : ''}
${psycho?.sonicIntent || psycho?.report ? `Psychoacoustics peer: ${String(psycho.sonicIntent || psycho.report).slice(0, 160)}` : ''}
${audioFeatures?.energyLevel ? `Energy Level: ${audioFeatures.energyLevel}` : ''}

Provide a CONCISE intention analysis (80-100 words) for floor/set use. Quote measured BPM or drums once. Weave psychology/psychoacoustics peer claims only when they align with measured facts.

Return ONLY a JSON object:
{
  "intention": "Your concise, context-aware intention analysis here (80-100 words maximum)"
}`

      const result = await this.callAI(this.withUserDirective(prompt, context), 1500)
      const intention = result?.intention || null
      const processingTime = Date.now() - startTime

      if (intention) {
        return this.createSuccess({ intention }, 0.85, processingTime)
      }
      return this.createFailure('AI analysis failed', processingTime)
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }
}
