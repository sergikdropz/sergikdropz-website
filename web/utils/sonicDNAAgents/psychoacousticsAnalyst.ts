/**
 * Psychoacoustics Analyst Agent
 * Activation, entrainment, spectral/temporal listener effects from measured groove + KB science.
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import { formatBlackboardPrompt } from '@/lib/audio/sonic-dna-v2/agent-blackboard'

export class PsychoacousticsAnalystAgent extends BaseAgent {
  type = AgentType.PSYCHOACOUSTICS_ANALYST
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
      const science = (blackboard?.kb?.scienceNotes || []).join(' | ')

      const prompt = `You are a psychoacoustics specialist on the shared Sonic DNA blackboard.

${formatBlackboardPrompt(blackboard)}

Track: "${trackTitle}" by ${artistName}
BPM: ${(blackboard?.measured?.bpm ?? audioFeatures?.bpm) || 'Unknown'}
Drums: ${blackboard?.measured?.drumFamily || 'unknown'}
Bass lock: ${blackboard?.measured?.bass?.lock || 'unknown'}
Science notes: ${science || 'use measured groove physics'}

Ground EVERY claim in measured pulse, drum family, hat/snare roles, and bass lock. Prefer encyclopedia science notes. No crate/title leakage.

Return JSON:
{
  "report": "110-160 words unifying activation, entrainment, and listener effects for this groove.",
  "activationFormula": "1-2 sentences: how BPM + grid density drive arousal.",
  "socialUsage": "1-2 sentences: dancefloor / body coupling use of this pulse.",
  "sonicIntent": "1-2 sentences: what the arrangement is designed to do psychoacoustically.",
  "listenerEffects": ["3-6 short effect tags e.g. motor coupling, prediction error, sub pressure"]
}`

      const data = await this.callAI(this.withUserDirective(prompt, context), 2400)
      const processingTime = Date.now() - startTime
      if (data) return this.createSuccess(data, 0.84, processingTime)
      return this.createFailure('Psychoacoustics analysis failed', processingTime)
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }
}
