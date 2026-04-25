/**
 * Pipeline Orchestrator
 * Coordinates specialized agents for efficient Sonic DNA analysis
 */

import { AgentType, AgentContext, AgentResult } from './agentTypes'
import { BaseAgent } from './baseAgent'
import { TechnicalAnalyzerAgent } from './technicalAnalyzer'
import { IntentionAnalystAgent } from './intentionAnalyst'
import { DescriptionWriterAgent } from './descriptionWriter'
import { DrumPatternExpertAgent } from './drumPatternExpert'
import { MusicologistAgent } from './musicologist'
import { CulturalAnalystAgent } from './culturalAnalyst'
import { EmotionalPsychologistAgent } from './emotionalPsychologist'
import { GenreSpecialistAgent } from './genreSpecialist'
import { HarmonyAnalystAgent } from './harmonyAnalyst'

export class PipelineOrchestrator {
  private agents: Map<AgentType, BaseAgent>
  private cache: Map<string, AgentResult[]> = new Map()

  constructor() {
    // Initialize all agents
    this.agents = new Map([
      [AgentType.TECHNICAL_ANALYZER, new TechnicalAnalyzerAgent()],
      [AgentType.HARMONY_ANALYST, new HarmonyAnalystAgent()],
      [AgentType.INTENTION_ANALYST, new IntentionAnalystAgent()],
      [AgentType.DESCRIPTION_WRITER, new DescriptionWriterAgent()],
      [AgentType.DRUM_PATTERN_EXPERT, new DrumPatternExpertAgent()],
      [AgentType.GENRE_SPECIALIST, new GenreSpecialistAgent()],
      [AgentType.MUSICOLOGIST, new MusicologistAgent()],
      [AgentType.CULTURAL_ANALYST, new CulturalAnalystAgent()],
      [AgentType.EMOTIONAL_PSYCHOLOGIST, new EmotionalPsychologistAgent()],
    ])
  }

  /**
   * Process a track through the agent pipeline
   */
  async processTrack(context: AgentContext): Promise<Map<AgentType, AgentResult>> {
    const cacheKey = `${context.trackTitle}-${context.artistName}`
    
    // Check cache
    const cached = this.cache.get(cacheKey)
    if (cached) {
      const results = new Map<AgentType, AgentResult>()
      cached.forEach(result => {
        results.set(result.agentType, result)
      })
      return results
    }

    // Get agents sorted by priority (highest first)
    const agentsByPriority = Array.from(this.agents.entries())
      .sort((a, b) => b[1].capabilities.priority - a[1].capabilities.priority)

    const results = new Map<AgentType, AgentResult>()
    const previousResults: Record<string, any> = {}

    // Process agents in priority order, with parallel processing where possible
    const parallelGroups: BaseAgent[][] = []
    let currentGroup: BaseAgent[] = []

    for (const [type, agent] of agentsByPriority) {
      if (agent.capabilities.canProcessInParallel && currentGroup.length < 3) {
        currentGroup.push(agent)
      } else {
        if (currentGroup.length > 0) {
          parallelGroups.push([...currentGroup])
          currentGroup = []
        }
        currentGroup.push(agent)
      }
    }
    if (currentGroup.length > 0) {
      parallelGroups.push(currentGroup)
    }

    // Process each group
    for (const group of parallelGroups) {
      // Update context with previous results
      const updatedContext: AgentContext = {
        ...context,
        previousAgentResults: previousResults
      }

      // Process group in parallel
      const groupPromises = group.map(agent => {
        const validation = agent.validateContext(updatedContext)
        if (!validation.valid) {
          return Promise.resolve(agent.createFailure(`Missing: ${validation.missing.join(', ')}`, 0))
        }
        return agent.process(updatedContext)
      })

      const groupResults = await Promise.all(groupPromises)

      // Store results and update previous results
      groupResults.forEach((result, index) => {
        const agent = group[index]
        results.set(agent.type, result)
        
        if (result.success && result.data) {
          previousResults[agent.type] = result.data
        }
      })
    }

    // Cache results
    this.cache.set(cacheKey, Array.from(results.values()))

    return results
  }

  /**
   * Synthesize all agent results into final Sonic DNA
   */
  synthesizeResults(
    results: Map<AgentType, AgentResult>,
    comprehensiveAnalysis: any,
    musicbrainzData: any
  ): any {
    const technical = results.get(AgentType.TECHNICAL_ANALYZER)?.data || {}
    const harmony = results.get(AgentType.HARMONY_ANALYST)?.data
    const intention = results.get(AgentType.INTENTION_ANALYST)?.data?.intention
    const description = results.get(AgentType.DESCRIPTION_WRITER)?.data?.description
    const drums = results.get(AgentType.DRUM_PATTERN_EXPERT)?.data
    const genre = results.get(AgentType.GENRE_SPECIALIST)?.data
    const musicology = results.get(AgentType.MUSICOLOGIST)?.data
    const cultural = results.get(AgentType.CULTURAL_ANALYST)?.data
    const emotional = results.get(AgentType.EMOTIONAL_PSYCHOLOGIST)?.data

    // Build comprehensive Sonic DNA
    return {
      description,
      intention,
      technical: {
        ...technical,
        ...comprehensiveAnalysis?.technical,
        ...harmony,
        technicalDescription: harmony?.technicalDescription || technical.technicalDescription
      },
      harmony: harmony ? {
        ...comprehensiveAnalysis?.harmony,
        ...harmony
      } : comprehensiveAnalysis?.harmony,
      drums: drums ? {
        ...comprehensiveAnalysis?.drums,
        ...drums
      } : comprehensiveAnalysis?.drums,
      genres: genre ? {
        ...comprehensiveAnalysis?.genres,
        ...genre
      } : comprehensiveAnalysis?.genres,
      musicology: musicology ? {
        ...comprehensiveAnalysis?.musicology,
        ...musicology
      } : comprehensiveAnalysis?.musicology,
      cultural: cultural ? {
        ...comprehensiveAnalysis?.cultural,
        ...cultural
      } : comprehensiveAnalysis?.cultural,
      emotional: emotional || {},
      comprehensive: comprehensiveAnalysis,
      musicbrainz: musicbrainzData ? {
        ...comprehensiveAnalysis?.musicbrainz,
        fullData: musicbrainzData
      } : comprehensiveAnalysis?.musicbrainz
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

