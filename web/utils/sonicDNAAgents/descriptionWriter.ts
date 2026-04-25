/**
 * Description Writer Agent
 * Specializes in: Writing comprehensive track descriptions
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'

export class DescriptionWriterAgent extends BaseAgent {
  type = AgentType.DESCRIPTION_WRITER
  capabilities: AgentCapabilities = {
    canProcessInParallel: true,
    requiresAudioFile: false,
    requiresMusicBrainz: false,
    estimatedProcessingTime: 4000, // AI call
    priority: 8
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const { trackTitle, artistName, audioFeatures, comprehensiveAnalysis, musicbrainzData, previousAgentResults } = context

      // Use previous agent results if available
      const technical = previousAgentResults?.[AgentType.TECHNICAL_ANALYZER]?.data
      const intention = previousAgentResults?.[AgentType.INTENTION_ANALYST]?.data?.intention

      const bpm = audioFeatures?.bpm || 'Unknown'
      const isHalfTime = bpm !== 'Unknown' && typeof bpm === 'number' && bpm < 100
      const timingContext = isHalfTime ? 'HALF-TIME (slower, laid-back feel)' : 'FULL-TIME (standard tempo feel)'
      
      const prompt = `You are an expert music analyst. Write a CONCISE, CONTEXT-AWARE track description based on the actual track data:

Track: "${trackTitle}" by ${artistName}
BPM: ${bpm}
Timing: ${timingContext}
${technical?.key ? `Key: ${technical.key.key} ${technical.key.mode}` : ''}
${comprehensiveAnalysis?.genres?.primary ? `Genres: ${comprehensiveAnalysis.genres.primary.join(', ')}` : ''}
${intention ? `Intention: ${intention}` : ''}
${comprehensiveAnalysis?.technical?.energyLevel ? `Energy Level: ${comprehensiveAnalysis.technical.energyLevel}` : ''}
${comprehensiveAnalysis?.harmony?.scale ? `Scale: ${comprehensiveAnalysis.harmony.scale}` : ''}
${comprehensiveAnalysis?.technical?.timeSignature ? `Time Signature: ${comprehensiveAnalysis.technical.timeSignature}` : ''}

CRITICAL RULES:
- ACCURATELY identify timing: Half-time (60-100 BPM) vs Full-time (standard tempo)
- ACCURATELY distinguish HIP-HOP (60-100 BPM, 808s) from DRUM & BASS (160-180 BPM, high energy)
- Match energy level to timing: Half-time = moderate/low energy, NOT high energy
- Be CONTEXT-AWARE: Use the actual track data provided above
- Be CONCISE but COMPREHENSIVE: Maximum 100 words total
- Cover: sound signature, production, instrumentation, rhythm, emotion, genre, and distinctive features
- Write like a professional music critic - engaging and insightful

Write a CONCISE track description (80-100 words) that covers:
- Overall sound signature and production quality
- Key musical elements and instrumentation
- Rhythmic characteristics (address timing: half-time vs full-time)
- Emotional tone and atmosphere
- Genre identification and stylistic elements
- What makes this track distinctive

Return ONLY a JSON object:
{
  "description": "Your concise, context-aware description here (80-100 words maximum)"
}`

      const result = await this.callAI(this.withUserDirective(prompt, context), 2000)
      const description = result?.description || null
      const processingTime = Date.now() - startTime

      if (description) {
        return this.createSuccess({ description }, 0.85, processingTime)
      } else {
        return this.createFailure('AI analysis failed', processingTime)
      }
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }
}
