/**
 * Cultural Analyst Agent
 * Specializes in: Cultural analysis, regional characteristics, cultural influences
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import { formatBlackboardPrompt } from '@/lib/audio/sonic-dna-v2/agent-blackboard'

export class CulturalAnalystAgent extends BaseAgent {
  type = AgentType.CULTURAL_ANALYST
  capabilities: AgentCapabilities = {
    canProcessInParallel: true,
    requiresAudioFile: false,
    requiresMusicBrainz: true, // Benefits from MusicBrainz regional data
    estimatedProcessingTime: 3500, // AI call
    priority: 5
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const { comprehensiveAnalysis, musicbrainzData } = context

      const cultural = comprehensiveAnalysis?.cultural
      const kb = context.blackboard?.kb
      if (!cultural && !kb) {
        return this.createFailure('No cultural data available', Date.now() - startTime)
      }

      // Extract cultural data (seed from encyclopedia when comprehensive is thin)
      const culturalData = {
        regions: cultural?.regions?.length ? cultural.regions : kb?.regions || [],
        culturalInfluences: cultural?.culturalInfluences?.length
          ? cultural.culturalInfluences
          : kb?.related || [],
        regionalCharacteristics: cultural?.regionalCharacteristics || '',
        crossCulturalElements: cultural?.crossCulturalElements || kb?.related?.slice(0, 5) || [],
      }

      // Generate description if we have meaningful data
      let description: string | null = null
      if (culturalData.regions.length > 0 || culturalData.culturalInfluences.length > 0) {
        description = await this.generateDescription(culturalData, context)
      }

      const result = {
        ...culturalData,
        description
      }

      const processingTime = Date.now() - startTime
      return this.createSuccess(result, 0.85, processingTime)
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }

  private async generateDescription(culturalData: any, context: AgentContext): Promise<string | null> {
    const kb = context.blackboard?.kb
    const regions = [
      ...culturalData.regions,
      ...(kb?.regions || []),
    ].filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
    const influences = [
      ...culturalData.culturalInfluences,
      ...(kb?.related || []),
    ].filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)

    const prompt = `You are an expert ethnomusicologist writing on a shared Sonic DNA blackboard.

${formatBlackboardPrompt(context.blackboard)}

Track: "${context.trackTitle}" by ${context.artistName}
Regions: ${regions.join(', ') || 'Unknown'}
Cultural Influences / related traditions: ${influences.join(', ') || 'None'}
Regional Characteristics: ${culturalData.regionalCharacteristics || kb?.profileExcerpt?.slice(0, 200) || 'Unknown'}
Cross-Cultural Elements: ${culturalData.crossCulturalElements.join(', ') || 'None'}
BPM: ${(context.blackboard?.measured?.bpm ?? context.audioFeatures?.bpm) || 'Unknown'}

CRITICAL: Bind culture to measured drum/bass usage. Never invent from title/folder/crate names.

Write a CONCISE cultural analysis (80-120 words).

Return JSON:
{
  "description": "Your concise, context-aware cultural analysis here (80-120 words maximum) or null if cultural data is insufficient"
}`

    const result = await this.callAI(this.withUserDirective(prompt, context), 2000)
    return result?.description || null
  }
}
