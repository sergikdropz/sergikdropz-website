/**
 * Cultural Analyst Agent
 * Specializes in: Cultural analysis, regional characteristics, cultural influences
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'

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
      if (!cultural) {
        return this.createFailure('No cultural data available', Date.now() - startTime)
      }

      // Extract cultural data
      const culturalData = {
        regions: cultural.regions || [],
        culturalInfluences: cultural.culturalInfluences || [],
        regionalCharacteristics: cultural.regionalCharacteristics || '',
        crossCulturalElements: cultural.crossCulturalElements || []
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
    const prompt = `You are an expert ethnomusicologist. Provide a CONCISE, CONTEXT-AWARE cultural analysis:

Track: "${context.trackTitle}" by ${context.artistName}
Regions: ${culturalData.regions.join(', ') || 'Unknown'}
Cultural Influences: ${culturalData.culturalInfluences.join(', ') || 'None'}
Regional Characteristics: ${culturalData.regionalCharacteristics || 'Unknown'}
Cross-Cultural Elements: ${culturalData.crossCulturalElements.join(', ') || 'None'}
BPM: ${context.audioFeatures?.bpm || 'Unknown'}
Energy Level: ${context.audioFeatures?.energyLevel || 'Unknown'}
${context.comprehensiveAnalysis?.genres?.primary ? `Genres: ${context.comprehensiveAnalysis.genres.primary.join(', ')}` : ''}

Write a CONCISE cultural analysis (80-100 words). Be CONTEXT-AWARE and cover:
- Regional characteristics and musical traditions (if regions provided)
- Cultural context and significance
- Cross-cultural elements and fusion (if present)
- How cultural elements manifest in the music
- Social/cultural meanings (if relevant)

Return JSON:
{
  "description": "Your concise, context-aware cultural analysis here (80-100 words maximum) or null if cultural data is insufficient"
}`

    const result = await this.callAI(this.withUserDirective(prompt, context), 2000)
    return result?.description || null
  }
}
