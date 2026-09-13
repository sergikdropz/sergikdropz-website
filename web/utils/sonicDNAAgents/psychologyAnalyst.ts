/**
 * Psychology Analyst Agent
 * Listener psychology / cognitive-affective tendencies from measured groove + encyclopedia.
 * Complements EmotionalPsychologist (affect arc) with deeper psychological framing.
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import { formatBlackboardPrompt } from '@/lib/audio/sonic-dna-v2/agent-blackboard'

export class PsychologyAnalystAgent extends BaseAgent {
  type = AgentType.PSYCHOLOGY_ANALYST
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
      const { trackTitle, artistName, audioFeatures, blackboard } = context
      const kbPsych = String(blackboard?.kb?.profileExcerpt || '').match(/Psychology:[^\n]+/)?.[0] || ''

      const prompt = `You are an expert music psychologist on the shared Sonic DNA blackboard.

${formatBlackboardPrompt(blackboard)}

Track: "${trackTitle}" by ${artistName}
BPM: ${(blackboard?.measured?.bpm ?? audioFeatures?.bpm) || 'Unknown'}
Energy: ${audioFeatures?.energyLevel || 'Unknown'}
Encyclopedia psychology cue: ${kbPsych || 'use measured groove + affect cluster'}

Write psychology ONLY from measured BPM/drums/bass/feel + encyclopedia. No title/folder genre guesses. Not clinical therapy — dancefloor / listening tendencies.

Return JSON:
{
  "psychologicalProfile": "90-140 words: attention, motor coupling, arousal/regulation, social affiliation tendencies bound to this groove.",
  "cognitiveEffects": ["3-5 short listener tendency tags"],
  "regulationNotes": "1-2 sentences on how the pulse may regulate or elevate arousal."
}`

      const data = await this.callAI(this.withUserDirective(prompt, context), 2200)
      const processingTime = Date.now() - startTime
      if (data) return this.createSuccess(data, 0.84, processingTime)
      return this.createFailure('Psychology analysis failed', processingTime)
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }
}
