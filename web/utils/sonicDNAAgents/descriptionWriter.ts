/**
 * Description Writer Agent
 * Specializes in: Writing comprehensive track descriptions from the shared blackboard.
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import { formatBlackboardPrompt, peerAgentData } from '@/lib/audio/sonic-dna-v2/agent-blackboard'

export class DescriptionWriterAgent extends BaseAgent {
  type = AgentType.DESCRIPTION_WRITER
  capabilities: AgentCapabilities = {
    canProcessInParallel: false,
    requiresAudioFile: false,
    requiresMusicBrainz: false,
    estimatedProcessingTime: 4000,
    priority: 8,
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const {
        trackTitle,
        artistName,
        audioFeatures,
        comprehensiveAnalysis,
        previousAgentResults,
        blackboard,
      } = context

      const technical = peerAgentData(previousAgentResults, AgentType.TECHNICAL_ANALYZER)
      const intention = peerAgentData(previousAgentResults, AgentType.INTENTION_ANALYST)?.intention
      const drums = peerAgentData(previousAgentResults, AgentType.DRUM_PATTERN_EXPERT)
      const genre = peerAgentData(previousAgentResults, AgentType.GENRE_SPECIALIST)
      const psychology = peerAgentData(previousAgentResults, AgentType.PSYCHOLOGY_ANALYST)
      const psycho = peerAgentData(previousAgentResults, AgentType.PSYCHOACOUSTICS_ANALYST)
      const boardBlock = formatBlackboardPrompt(blackboard)

      const bpm = blackboard?.measured?.bpm ?? audioFeatures?.bpm ?? 'Unknown'
      const feel = blackboard?.measured?.timingFeel
      const isHalfTime =
        feel === 'half-time' || (bpm !== 'Unknown' && typeof bpm === 'number' && bpm < 100)
      const timingContext = isHalfTime
        ? 'HALF-TIME (slower, laid-back feel)'
        : 'FULL-TIME (standard tempo feel)'

      const keyLine = technical?.key
        ? typeof technical.key === 'object'
          ? `Key: ${technical.key.key} ${technical.key.mode || ''}`.trim()
          : `Key: ${technical.key}`
        : blackboard?.measured?.key
          ? `Key: ${blackboard.measured.key}`
          : ''

      const prompt = `You are an expert music analyst writing from a shared measured + encyclopedia blackboard.

${boardBlock}

Track: "${trackTitle}" by ${artistName}
BPM: ${bpm}
Timing: ${timingContext}
${keyLine}
${genre?.primaryGenres?.length ? `Genres: ${genre.primaryGenres.join(', ')}` : comprehensiveAnalysis?.genres?.primary ? `Genres: ${comprehensiveAnalysis.genres.primary.join(', ')}` : ''}
${intention ? `Intention: ${intention}` : ''}
${drums?.signatureMatch?.name || drums?.pattern?.patternType ? `Drum family: ${drums?.signatureMatch?.name || drums?.pattern?.patternType}` : ''}
${psychology?.psychologicalProfile ? `Psychology: ${String(psychology.psychologicalProfile).slice(0, 140)}` : ''}
${psycho?.activationFormula || psycho?.report ? `Psychoacoustics: ${String(psycho.activationFormula || psycho.report).slice(0, 140)}` : ''}
${comprehensiveAnalysis?.technical?.energyLevel ? `Energy Level: ${comprehensiveAnalysis.technical.energyLevel}` : ''}

CRITICAL RULES:
- Quote measured BPM / Drums / Groove class literally at least once
- Prefer blackboard encyclopedia + psychology/psychoacoustics peers over crate/title guesses
- ACCURATELY identify timing from measured feel when present
- Be CONCISE but COMPREHENSIVE: Maximum 120 words total

Return ONLY a JSON object:
{
  "description": "Your concise, context-aware description here (80-120 words maximum)"
}`

      const result = await this.callAI(this.withUserDirective(prompt, context), 2000)
      const description = result?.description || null
      const processingTime = Date.now() - startTime

      if (description) {
        return this.createSuccess({ description }, 0.85, processingTime)
      }
      return this.createFailure('AI analysis failed', processingTime)
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }
}
