/**
 * Enhanced Pipeline Orchestrator
 * Fortified with retry logic, quality checks, and performance optimization
 * 
 * Enhanced with:
 * - Advanced drum pattern analysis integration
 * - Extended subgenre classification
 * - Half-time/timing detection
 * - MusicBrainz tag integration
 */

import { AgentType, AgentContext, AgentResult } from './agentTypes'
import { BaseAgent } from './baseAgent'
import { WaveformGeneratorAgent } from './waveformGenerator'
import { TechnicalAnalyzerAgent } from './technicalAnalyzer'
import { IntentionAnalystAgent } from './intentionAnalyst'
import { DescriptionWriterAgent } from './descriptionWriter'
import { DrumPatternExpertAgent } from './drumPatternExpert'
import { MusicologistAgent } from './musicologist'
import { CulturalAnalystAgent } from './culturalAnalyst'
import { EmotionalPsychologistAgent } from './emotionalPsychologist'
import { PsychologyAnalystAgent } from './psychologyAnalyst'
import { PsychoacousticsAnalystAgent } from './psychoacousticsAnalyst'
import { BassPocketAnalystAgent } from './bassPocketAnalyst'
import { InstrumentUsageAnalystAgent } from './instrumentUsageAnalyst'
import { GenreSpecialistAgent } from './genreSpecialist'
import { HarmonyAnalystAgent } from './harmonyAnalyst'
import { mergeEnhancedIntoSonicDNA } from '../enhancedSonicDNAAnalysis'
import {
  AGENT_COLLAB_WAVES,
  markWaveComplete,
  type AgentBlackboard,
} from '@/lib/audio/sonic-dna-v2/agent-blackboard'
import { mergeAgentWaveOntoBlackboard } from '@/lib/audio/sonic-dna-v2/merge-agent-wave'

interface QualityCheck {
  passed: boolean
  issues: string[]
  score: number // 0-100
}

export class EnhancedPipelineOrchestrator {
  private agents: Map<AgentType, BaseAgent>
  private cache: Map<string, AgentResult[]> = new Map()
  private performanceMetrics: Map<AgentType, number[]> = new Map()
  /** Last blackboard after processTrack — stamped onto synthesized DNA. */
  lastBlackboard: AgentBlackboard | null = null

  constructor() {
    // Initialize all agents - WaveformGenerator first (The "Father")
    this.agents = new Map([
      [AgentType.WAVEFORM_GENERATOR, new WaveformGeneratorAgent()], // Highest priority - runs first
      [AgentType.TECHNICAL_ANALYZER, new TechnicalAnalyzerAgent()],
      [AgentType.HARMONY_ANALYST, new HarmonyAnalystAgent()],
      [AgentType.INTENTION_ANALYST, new IntentionAnalystAgent()],
      [AgentType.DESCRIPTION_WRITER, new DescriptionWriterAgent()],
      [AgentType.DRUM_PATTERN_EXPERT, new DrumPatternExpertAgent()],
      [AgentType.GENRE_SPECIALIST, new GenreSpecialistAgent()],
      [AgentType.MUSICOLOGIST, new MusicologistAgent()],
      [AgentType.CULTURAL_ANALYST, new CulturalAnalystAgent()],
      [AgentType.EMOTIONAL_PSYCHOLOGIST, new EmotionalPsychologistAgent()],
      [AgentType.PSYCHOLOGY_ANALYST, new PsychologyAnalystAgent()],
      [AgentType.PSYCHOACOUSTICS_ANALYST, new PsychoacousticsAnalystAgent()],
      [AgentType.BASS_POCKET_ANALYST, new BassPocketAnalystAgent()],
      [AgentType.INSTRUMENT_USAGE_ANALYST, new InstrumentUsageAnalystAgent()],
    ])
  }

  /** Skip LLM narrative waves when groove core is missing (save budget, avoid inventing). */
  private hasGrooveCoreForLlm(board: AgentBlackboard | null): boolean {
    const m = board?.measured
    if (!m?.bpm || Number(m.bpm) < 50) return false
    const drums = String(m.drumFamily || '')
    return Boolean(drums && drums !== 'unknown')
  }

  /**
   * Process a track through the intel v3 DAG:
   * waveform → technical → DSP measure (∥) → pocket → classify lock → polymath (∥) → intention → description
   * Polymath: culture ∥ musicology ∥ emotion ∥ psychology ∥ psychoacoustics
   */
  async processTrack(context: AgentContext, useRetry: boolean = true): Promise<Map<AgentType, AgentResult>> {
    const cacheKey = `${context.trackTitle}-${context.artistName}`
    
    // Check cache (but allow force refresh)
    if (!context.previousAgentResults && !context.blackboard) {
      const cached = this.cache.get(cacheKey)
      if (cached) {
        const results = new Map<AgentType, AgentResult>()
        cached.forEach(result => {
          results.set(result.agentType, result)
        })
        return results
      }
    }

    const results = new Map<AgentType, AgentResult>()
    const previousResults: Record<string, any> = { ...(context.previousAgentResults || {}) }
    let blackboard = context.blackboard || null
    let liveContext: AgentContext = { ...context, previousAgentResults: previousResults, blackboard: blackboard || undefined }

    for (const wave of AGENT_COLLAB_WAVES) {
      const llmWave =
        wave.id === 'polymath-specialists' || wave.id === 'intention' || wave.id === 'description'
      if (llmWave && !this.hasGrooveCoreForLlm(blackboard)) {
        if (blackboard) {
          blackboard = markWaveComplete(
            {
              ...blackboard,
              conflicts: [
                ...blackboard.conflicts,
                {
                  field: 'grooveCore',
                  a: blackboard.measured?.bpm,
                  b: blackboard.measured?.drumFamily,
                  note: `Skipped ${wave.id}: no BPM/drums groove core for LLM spend`,
                },
              ],
            },
            `${wave.id}:skipped`,
          )
        }
        continue
      }

      const group = wave.agents
        .map((type) => this.agents.get(type as AgentType))
        .filter((agent): agent is BaseAgent => Boolean(agent))
      if (!group.length) continue

      liveContext = {
        ...liveContext,
        previousAgentResults: previousResults,
        blackboard: blackboard || undefined,
      }

      const runOne = async (agent: BaseAgent): Promise<AgentResult> => {
        const validation = agent.validateContext(liveContext)
        if (!validation.valid) {
          return agent.createFailure(`Missing: ${validation.missing.join(', ')}`, 0)
        }
        const startTime = Date.now()
        const result =
          useRetry && agent instanceof BaseAgent
            ? await agent.processWithRetry(liveContext, 2)
            : await agent.process(liveContext)
        const processingTime = Date.now() - startTime
        const metrics = this.performanceMetrics.get(agent.type) || []
        metrics.push(processingTime)
        if (metrics.length > 100) metrics.shift()
        this.performanceMetrics.set(agent.type, metrics)
        return result
      }

      const groupResults = wave.parallel
        ? await Promise.all(group.map((agent) => runOne(agent)))
        : await (async () => {
            const out: AgentResult[] = []
            for (const agent of group) {
              // Serial within wave — refresh peers between agents
              liveContext = {
                ...liveContext,
                previousAgentResults: previousResults,
                blackboard: blackboard || undefined,
              }
              out.push(await runOne(agent))
              const last = out[out.length - 1]
              if (last.success && last.data) {
                previousResults[agent.type] = last.data
                results.set(agent.type, last)
                if (agent.type === AgentType.WAVEFORM_GENERATOR && last.data.waveformData) {
                  liveContext.waveformData = {
                    data: last.data.waveformData,
                    samples: last.data.waveformSamples || last.data.waveformData.length,
                    sampleRate: last.data.sampleRate || 44100,
                  }
                }
              } else {
                results.set(agent.type, last)
              }
            }
            return out
          })()

      if (wave.parallel) {
        groupResults.forEach((result, index) => {
          const agent = group[index]
          results.set(agent.type, result)
          if (result.success && result.data) {
            previousResults[agent.type] = result.data
            if (agent.type === AgentType.WAVEFORM_GENERATOR && result.data.waveformData) {
              liveContext.waveformData = {
                data: result.data.waveformData,
                samples: result.data.waveformSamples || result.data.waveformData.length,
                sampleRate: result.data.sampleRate || 44100,
              }
            }
          }
        })
      }

      if (blackboard) {
        blackboard = mergeAgentWaveOntoBlackboard(
          blackboard,
          wave.id,
          group.map((agent, index) => ({
            type: agent.type,
            result: results.get(agent.type) || groupResults[index],
          })),
        )
        liveContext.blackboard = blackboard
      }
    }

    this.lastBlackboard = blackboard
    this.cache.set(cacheKey, Array.from(results.values()))
    return results
  }

  /**
   * Quality check on results
   */
  qualityCheck(results: Map<AgentType, AgentResult>, context: AgentContext): QualityCheck {
    const issues: string[] = []
    let score = 100
    let criticalCount = 0
    let successCount = 0

    // Check each critical agent (including the "Father" - WaveformGenerator)
    const criticalAgents = [
      AgentType.WAVEFORM_GENERATOR, // The "Father" - most important
      AgentType.TECHNICAL_ANALYZER,
      AgentType.DESCRIPTION_WRITER,
      AgentType.INTENTION_ANALYST
    ]

    criticalAgents.forEach(type => {
      const result = results.get(type)
      if (!result || !result.success) {
        issues.push(`Critical agent ${type} failed`)
        score -= 20
        criticalCount++
      } else {
        successCount++
        // Check confidence
        if (result.confidence < 0.7) {
          issues.push(`Low confidence (${result.confidence}) for ${type}`)
          score -= 5
        }
      }
    })

    // Check other agents
    const otherAgents = Array.from(results.keys()).filter(
      type => !criticalAgents.includes(type)
    )

    otherAgents.forEach(type => {
      const result = results.get(type)
      if (!result || !result.success) {
        issues.push(`Agent ${type} failed (non-critical)`)
        score -= 5
      } else {
        successCount++
      }
    })

    // Check minimum success rate
    const successRate = successCount / results.size
    if (successRate < 0.7) {
      issues.push(`Low success rate: ${(successRate * 100).toFixed(1)}%`)
      score -= 10
    }

    return {
      passed: criticalCount === 0 && score >= 70,
      issues,
      score: Math.max(0, score)
    }
  }

  /**
   * Synthesize all agent results into final Sonic DNA
   * Enhanced with advanced drum/genre analysis integration
   * INCLUDES: emotional, musical, historical, regional sections for full UI display
   */
  synthesizeResults(
    results: Map<AgentType, AgentResult>,
    comprehensiveAnalysis: any,
    musicbrainzData: any
  ): any {
    const waveform = results.get(AgentType.WAVEFORM_GENERATOR)?.data
    const technical = results.get(AgentType.TECHNICAL_ANALYZER)?.data || {}
    const harmony = results.get(AgentType.HARMONY_ANALYST)?.data
    const intention = results.get(AgentType.INTENTION_ANALYST)?.data?.intention
    const description = results.get(AgentType.DESCRIPTION_WRITER)?.data?.description
    const drums = results.get(AgentType.DRUM_PATTERN_EXPERT)?.data
    const genre = results.get(AgentType.GENRE_SPECIALIST)?.data
    const musicology = results.get(AgentType.MUSICOLOGIST)?.data
    const cultural = results.get(AgentType.CULTURAL_ANALYST)?.data
    const emotionalData = results.get(AgentType.EMOTIONAL_PSYCHOLOGIST)?.data
    const psychologyData = results.get(AgentType.PSYCHOLOGY_ANALYST)?.data
    const psychoacousticsData = results.get(AgentType.PSYCHOACOUSTICS_ANALYST)?.data
    const bassPocket = results.get(AgentType.BASS_POCKET_ANALYST)?.data

    // Extract advanced analysis from drum pattern expert (if available)
    const advancedDrumAnalysis = drums?.advancedAnalysis
    const subgenreAnalysis = drums?.subgenreAnalysis || genre?.subgenreClassification
    const timingAnalysis = advancedDrumAnalysis?.timing || genre?.timingContext

    // Build comprehensive drum section with advanced analysis
    const drumsSection = this.buildDrumsSection(drums, comprehensiveAnalysis?.drums, advancedDrumAnalysis)
    
    // Build comprehensive genres section with extended subgenre classification
    const genresSection = this.buildGenresSection(genre, comprehensiveAnalysis?.genres, subgenreAnalysis)
    
    // Build comprehensive emotional section (with fallbacks); prefer dedicated psychology agent profile
    const emotionalSection = this.buildEmotionalSection(
      {
        ...(emotionalData || {}),
        psychologicalProfile:
          psychologyData?.psychologicalProfile || emotionalData?.psychologicalProfile,
      },
      comprehensiveAnalysis?.emotional,
      comprehensiveAnalysis,
    )

    const psychologySection = this.buildPsychologySection(psychologyData, emotionalSection)
    const psychoacousticsSection = this.buildPsychoacousticsSection(psychoacousticsData)
    
    // Build comprehensive musical section (with fallbacks)
    const musicalSection = this.buildMusicalSection(harmony, technical, comprehensiveAnalysis, musicology)
    
    // Build comprehensive historical section (with fallbacks)
    const historicalSection = this.buildHistoricalSection(musicology, comprehensiveAnalysis?.historical, comprehensiveAnalysis)
    
    // Build comprehensive regional section (with fallbacks)
    const regionalSection = this.buildRegionalSection(cultural, comprehensiveAnalysis?.cultural, comprehensiveAnalysis)
    
    // Generate description if missing
    const finalDescription = description || this.generateFallbackDescription(comprehensiveAnalysis, genresSection, emotionalSection, drumsSection)
    
    // Build summary
    const summary = this.buildSummary(finalDescription, intention, emotionalSection, genresSection, musicalSection)

    // Build comprehensive Sonic DNA
    const sonicDNA = {
      // Core narrative sections (displayed at top)
      description: finalDescription,
      intention,
      summary,
      
      // Emotional intelligence section
      emotional: emotionalSection,

      // Dedicated psychology + psychoacoustics (polymath wave)
      psychology: psychologySection,
      psychoacoustics: psychoacousticsSection,
      
      // Musical intelligence section
      musical: musicalSection,
      
      // Historical context section
      historical: historicalSection,
      
      // Regional & cultural section
      regional: regionalSection,
      
      // Waveform data from the "Father" agent
      waveform: waveform ? {
        data: waveform.waveformData,
        samples: waveform.waveformSamples,
        sampleRate: waveform.sampleRate,
        version: waveform.version || 2,
        generatedAt: waveform.generatedAt
      } : null,
      
      // Technical analysis section
      technical: {
        ...technical,
        ...comprehensiveAnalysis?.technical,
        ...harmony,
        technicalDescription: harmony?.technicalDescription || technical.technicalDescription,
        // Add timing analysis to technical section
        timingFeel: timingAnalysis?.type || 'full-time',
        effectiveBpm: timingAnalysis?.effectiveBpm || technical?.bpm || comprehensiveAnalysis?.technical?.bpm,
        timingConfidence: timingAnalysis?.confidence || 0
      },
      
      // Harmony section
      harmony: harmony ? {
        ...comprehensiveAnalysis?.harmony,
        ...harmony
      } : comprehensiveAnalysis?.harmony,
      
      // Drums section with enhanced analysis
      drums: drumsSection,

      // Bass / pocket from measure-pocket wave
      bass: bassPocket
        ? {
            lock: bassPocket.lock,
            rootNote: bassPocket.rootNote,
            slidesLikely: bassPocket.slidesLikely,
            character: bassPocket.character,
            reason: bassPocket.reason,
          }
        : comprehensiveAnalysis?.bass || null,
      
      // Genres section with enhanced classification
      genres: genresSection,
      
      // Musicology section
      musicology: musicology ? {
        ...comprehensiveAnalysis?.musicology,
        ...musicology
      } : comprehensiveAnalysis?.musicology,
      
      // Cultural section
      cultural: cultural ? {
        ...comprehensiveAnalysis?.cultural,
        ...cultural,
        // Add origins and era from subgenre analysis
        origins: subgenreAnalysis?.origins || cultural?.regions || [],
        era: subgenreAnalysis?.era || cultural?.era
      } : comprehensiveAnalysis?.cultural,
      
      // Raw comprehensive analysis
      comprehensive: comprehensiveAnalysis,
      
      // MusicBrainz data
      musicbrainz: musicbrainzData ? {
        ...comprehensiveAnalysis?.musicbrainz,
        fullData: musicbrainzData
      } : comprehensiveAnalysis?.musicbrainz,
      
      // Add timing section for easy access
      timing: timingAnalysis ? {
        feel: timingAnalysis.type,
        confidence: timingAnalysis.confidence,
        indicators: timingAnalysis.indicators,
        effectiveBpm: timingAnalysis.effectiveBpm,
        description: advancedDrumAnalysis?.description || null
      } : null,
      
      // Add quality metadata
      _metadata: {
        processedAt: new Date().toISOString(),
        agentVersion: '3.0-polymath-blackboard',
        qualityScore: this.calculateQualityScore(results),
        collaboration: {
          waves: this.lastBlackboard?.wavesCompleted || [],
          kbPrimary: this.lastBlackboard?.kb?.primary || null,
          evidenceCount: this.lastBlackboard?.evidence?.length || 0,
          conflicts: this.lastBlackboard?.conflicts?.length || 0,
        },
        enhancedAnalysis: {
          hasDrumPatternAnalysis: !!advancedDrumAnalysis,
          hasSubgenreClassification: !!subgenreAnalysis,
          hasTimingAnalysis: !!timingAnalysis,
          hasEmotionalAnalysis: !!emotionalSection?.primaryEmotions?.length,
          hasPsychologyAnalysis: !!psychologySection?.psychologicalProfile,
          hasPsychoacousticsAnalysis: !!psychoacousticsSection?.report,
          hasMusicalAnalysis: !!musicalSection?.keySignature,
          hasHistoricalAnalysis: !!historicalSection?.eraInfluences?.length,
          hasRegionalAnalysis: !!regionalSection?.primaryRegions?.length
        }
      },
      // Shared intelligence bus snapshot for enrich / UI
      pipelineIntelligence: this.lastBlackboard
        ? {
            version: this.lastBlackboard.version,
            kb: this.lastBlackboard.kb,
            measuredSeed: this.lastBlackboard.measured,
            evidence: this.lastBlackboard.evidence,
            conflicts: this.lastBlackboard.conflicts,
            wavesCompleted: this.lastBlackboard.wavesCompleted,
            updatedAt: this.lastBlackboard.updatedAt,
          }
        : null,
    }

    // Stamp polymath layers onto measured so encyclopedia compose prefers agent depth
    let stamped = this.stampMeasuredPolymathLayers(sonicDNA, psychologySection, psychoacousticsSection)
    if (bassPocket?.lock) {
      const measured = { ...(stamped.measured || {}) }
      measured.bass = {
        ...(measured.bass || {}),
        lock: bassPocket.lock,
        rootNote: bassPocket.rootNote || measured.bass?.rootNote || null,
        slidesLikely: Boolean(bassPocket.slidesLikely),
      }
      if (bassPocket.timingFeel && !measured.timingFeel) measured.timingFeel = bassPocket.timingFeel
      if (bassPocket.swingPercent != null && measured.swingPercent == null) {
        measured.swingPercent = bassPocket.swingPercent
      }
      stamped = { ...stamped, measured, bass: stamped.bass || measured.bass }
    }
    return stamped
  }

  private buildPsychologySection(psychologyData: any, emotional: any): any {
    const profile =
      String(psychologyData?.psychologicalProfile || emotional?.psychologicalProfile || '').trim()
    return {
      psychologicalProfile: profile,
      cognitiveEffects: Array.isArray(psychologyData?.cognitiveEffects)
        ? psychologyData.cognitiveEffects
        : [],
      regulationNotes: String(psychologyData?.regulationNotes || '').trim(),
    }
  }

  private buildPsychoacousticsSection(psycho: any): any {
    if (!psycho || typeof psycho !== 'object') {
      return {
        report: '',
        activationFormula: '',
        socialUsage: '',
        sonicIntent: '',
        listenerEffects: [],
      }
    }
    const effects = Array.isArray(psycho.listenerEffects) ? psycho.listenerEffects : []
    const report =
      String(psycho.report || '').trim() ||
      [psycho.socialUsage, psycho.sonicIntent, psycho.activationFormula, effects.join(', ')]
        .filter(Boolean)
        .join(' ')
        .trim()
    return {
      report,
      activationFormula: String(psycho.activationFormula || '').trim(),
      socialUsage: String(psycho.socialUsage || '').trim(),
      sonicIntent: String(psycho.sonicIntent || '').trim(),
      listenerEffects: effects,
    }
  }

  private stampMeasuredPolymathLayers(
    sonicDNA: any,
    psychology: any,
    psychoacoustics: any,
  ): any {
    const profile = String(psychology?.psychologicalProfile || '').trim()
    const psychoReport = String(psychoacoustics?.report || '').trim()
    if (!profile && !psychoReport) return sonicDNA

    const measured = sonicDNA.measured && typeof sonicDNA.measured === 'object' ? { ...sonicDNA.measured } : {}
    const intel = { ...(measured.intelligence || {}) }
    const emotional = { ...(intel.emotional || {}), ...(sonicDNA.emotional || {}) }
    if (profile) emotional.psychologicalProfile = profile
    intel.emotional = emotional
    if (psychoReport) {
      intel.psychoacoustics = {
        ...(intel.psychoacoustics || {}),
        ...psychoacoustics,
        report: psychoReport,
      }
    }
    const report = { ...(measured.report || {}) }
    const layers = { ...(report.layers || {}) }
    if (profile) layers.psychological = profile
    if (psychoReport) layers.psychoacoustics = psychoReport
    report.layers = layers
    measured.intelligence = intel
    measured.report = report

    return {
      ...sonicDNA,
      measured,
      emotional: {
        ...(sonicDNA.emotional || {}),
        psychologicalProfile: profile || sonicDNA.emotional?.psychologicalProfile,
      },
      psychoacoustics: psychoReport
        ? { ...(sonicDNA.psychoacoustics || {}), ...psychoacoustics, report: psychoReport }
        : sonicDNA.psychoacoustics,
    }
  }
  
  /**
   * Build comprehensive emotional section
   * Enhanced with fallback generation based on musical characteristics
   */
  private buildEmotionalSection(emotionalData: any, comprehensiveEmotional: any, comprehensiveAnalysis?: any): any {
    // Handle both nested and flat emotional data
    let primary = emotionalData?.primaryEmotions || comprehensiveEmotional?.primaryEmotions || []
    let journey = emotionalData?.emotionalJourney || comprehensiveEmotional?.emotionalJourney || ''
    let psychological = emotionalData?.psychologicalProfile || comprehensiveEmotional?.psychologicalProfile || ''
    const moodTransitions = emotionalData?.moodTransitions || comprehensiveEmotional?.moodTransitions || []
    
    // Generate fallback emotions based on musical characteristics if missing
    if (!primary || primary.length === 0) {
      primary = this.inferEmotionsFromMusic(comprehensiveAnalysis)
    }
    
    // Generate fallback journey if missing
    if (!journey || journey === 'Analysis pending') {
      journey = this.inferEmotionalJourney(comprehensiveAnalysis, primary)
    }
    
    // Generate fallback psychological profile if missing
    if (!psychological || psychological === 'Analysis pending') {
      psychological = this.inferPsychologicalProfile(comprehensiveAnalysis, primary)
    }
    
    return {
      primaryEmotions: Array.isArray(primary) ? primary : [primary].filter(Boolean),
      emotionalJourney: journey,
      psychologicalProfile: psychological,
      moodTransitions: moodTransitions,
      // Additional emotional data if available
      mood: emotionalData?.mood || comprehensiveEmotional?.mood,
      intensity: emotionalData?.intensity || comprehensiveEmotional?.intensity,
      valence: emotionalData?.valence || comprehensiveEmotional?.valence,
      arousal: emotionalData?.arousal || comprehensiveEmotional?.arousal
    }
  }
  
  /**
   * Infer emotions from musical characteristics
   */
  private inferEmotionsFromMusic(comprehensive: any): string[] {
    const emotions: string[] = []
    const bpm = comprehensive?.technical?.bpm || 0
    const energy = comprehensive?.technical?.energy?.level || 0
    const key = comprehensive?.harmony?.keySignature || ''
    const genres = comprehensive?.genres?.primary || []
    
    // BPM-based emotions
    if (bpm < 80) {
      emotions.push('Contemplative', 'Relaxed')
    } else if (bpm < 110) {
      emotions.push('Groovy', 'Chill')
    } else if (bpm < 130) {
      emotions.push('Uplifting', 'Energetic')
    } else if (bpm < 150) {
      emotions.push('Euphoric', 'Driving')
    } else {
      emotions.push('Intense', 'Exhilarating')
    }
    
    // Energy-based emotions
    if (energy > 0.7) {
      emotions.push('Powerful')
    } else if (energy < 0.3) {
      emotions.push('Introspective')
    }
    
    // Key-based emotions (minor keys tend to be more melancholic)
    if (key.toLowerCase().includes('minor')) {
      emotions.push('Melancholic', 'Deep')
    }
    
    // Genre-based emotions
    const genreStr = genres.join(' ').toLowerCase()
    if (genreStr.includes('dub') || genreStr.includes('reggae')) {
      emotions.push('Meditative', 'Spiritual')
    }
    if (genreStr.includes('house') || genreStr.includes('disco')) {
      emotions.push('Joyful')
    }
    if (genreStr.includes('techno')) {
      emotions.push('Hypnotic')
    }
    
    return Array.from(new Set(emotions)).slice(0, 5)
  }
  
  /**
   * Infer emotional journey from music
   */
  private inferEmotionalJourney(comprehensive: any, emotions: string[]): string {
    const bpm = comprehensive?.technical?.bpm || 0
    const genres = comprehensive?.genres?.primary || []
    const emotionStr = emotions.slice(0, 3).join(', ')
    
    if (bpm < 100) {
      return `This track takes the listener on a slow-building journey through ${emotionStr} emotions. The deliberate tempo creates space for reflection and deep emotional connection, allowing each musical element to resonate fully before evolving.`
    } else if (bpm < 130) {
      return `A dynamic emotional arc unfolds as the track progresses through ${emotionStr} states. The mid-tempo groove provides a perfect foundation for emotional exploration, building intensity gradually while maintaining a grounded energy.`
    } else {
      return `The track delivers an intense emotional experience marked by ${emotionStr} energy. The driving tempo creates a relentless forward momentum, pushing through emotional peaks and valleys with kinetic force.`
    }
  }
  
  /**
   * Infer psychological profile from music
   */
  private inferPsychologicalProfile(comprehensive: any, emotions: string[]): string {
    const bpm = comprehensive?.technical?.bpm || 0
    const genres = comprehensive?.genres?.primary || []
    
    const profiles: string[] = []
    
    if (bpm > 120) {
      profiles.push('energizing effect on the listener')
      profiles.push('promotes movement and physical engagement')
    } else {
      profiles.push('calming influence on the mind')
      profiles.push('supports introspection and mindfulness')
    }
    
    const genreStr = genres.join(' ').toLowerCase()
    if (genreStr.includes('dub') || genreStr.includes('ambient')) {
      profiles.push('induces meditative states')
      profiles.push('reduces anxiety and stress')
    }
    if (genreStr.includes('techno') || genreStr.includes('house')) {
      profiles.push('triggers dopamine release through repetitive patterns')
      profiles.push('creates feelings of communal connection')
    }
    
    return `This track has a ${profiles.slice(0, 2).join(' and ')}. The musical elements work together to ${profiles.slice(2, 4).join(' and ')}. Overall, it ${emotions[0]?.toLowerCase() || 'engaging'} qualities make it suitable for both focused listening and ambient enjoyment.`
  }
  
  /**
   * Build comprehensive musical section (with fallbacks)
   */
  private buildMusicalSection(harmony: any, technical: any, comprehensive: any, musicology: any): any {
    let instrumentation = [
      ...(harmony?.instrumentation || []),
      ...(comprehensive?.musical?.instrumentation || []),
      ...(musicology?.instrumentation || [])
    ].filter((v, i, a) => a.indexOf(v) === i)
    
    // Generate fallback instrumentation if missing
    if (instrumentation.length === 0) {
      instrumentation = this.inferInstrumentation(comprehensive)
    }
    
    let productionTechniques = [
      ...(musicology?.production?.techniques || []),
      ...(comprehensive?.musicology?.production?.techniques || []),
      ...(harmony?.productionTechniques || [])
    ].filter((v, i, a) => a.indexOf(v) === i)
    
    // Generate fallback production techniques if missing
    if (productionTechniques.length === 0) {
      productionTechniques = this.inferProductionTechniques(comprehensive)
    }
    
    return {
      keySignature: harmony?.keySignature || technical?.key?.key || comprehensive?.harmony?.keySignature || 'Unknown',
      timeSignature: technical?.timeSignature || comprehensive?.technical?.timeSignature || '4/4',
      scale: harmony?.scale || technical?.key?.scale || comprehensive?.harmony?.scale || '',
      harmonicComplexity: harmony?.harmonicComplexity || comprehensive?.harmony?.harmonicComplexity || 'Moderate',
      rhythmicPatterns: harmony?.rhythmicPatterns || comprehensive?.drums?.pattern?.description || this.inferRhythmicPatterns(comprehensive),
      instrumentation: instrumentation.slice(0, 8),
      productionTechniques: productionTechniques.slice(0, 8),
      musicalInfluences: [
        ...(musicology?.style?.stylisticInfluences || []),
        ...(comprehensive?.musical?.influences || []),
        ...(harmony?.influences || [])
      ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6)
    }
  }
  
  /**
   * Infer instrumentation from genres
   */
  private inferInstrumentation(comprehensive: any): string[] {
    const genres = comprehensive?.genres?.primary || []
    const genreStr = genres.join(' ').toLowerCase()
    const instruments: string[] = ['Synthesizers', 'Drum Machine']
    
    if (genreStr.includes('house') || genreStr.includes('disco')) {
      instruments.push('Bass Synthesizer', 'Hi-hats', 'Claps', 'Piano Stabs')
    }
    if (genreStr.includes('techno')) {
      instruments.push('Modular Synths', '303 Bass', 'Industrial Percussion', 'Pads')
    }
    if (genreStr.includes('dub') || genreStr.includes('reggae')) {
      instruments.push('Sub Bass', 'Delay FX', 'Reverb', 'Melodica', 'Organ')
    }
    if (genreStr.includes('dnb') || genreStr.includes('drum')) {
      instruments.push('Reese Bass', 'Amen Break', 'Pads', 'Sub Bass')
    }
    if (genreStr.includes('trance')) {
      instruments.push('Supersaw', 'Pads', 'Plucks', 'Arpeggios')
    }
    
    return Array.from(new Set(instruments)).slice(0, 6)
  }
  
  /**
   * Infer production techniques from genres
   */
  private inferProductionTechniques(comprehensive: any): string[] {
    const genres = comprehensive?.genres?.primary || []
    const genreStr = genres.join(' ').toLowerCase()
    const techniques: string[] = ['Synthesis', 'Sequencing']
    
    if (genreStr.includes('dub') || genreStr.includes('reggae')) {
      techniques.push('Heavy Reverb', 'Tape Delay', 'Dub Mixing', 'Echo FX')
    }
    if (genreStr.includes('techno') || genreStr.includes('house')) {
      techniques.push('Sidechain Compression', 'Filter Automation', 'Layering')
    }
    if (genreStr.includes('dnb')) {
      techniques.push('Break Chopping', 'Resampling', 'Bass Processing')
    }
    
    techniques.push('EQ Sculpting', 'Compression')
    
    return Array.from(new Set(techniques)).slice(0, 6)
  }
  
  /**
   * Infer rhythmic patterns description
   */
  private inferRhythmicPatterns(comprehensive: any): string {
    const bpm = comprehensive?.technical?.bpm || 0
    const genres = comprehensive?.genres?.primary || []
    const genreStr = genres.join(' ').toLowerCase()
    
    if (genreStr.includes('dub') || genreStr.includes('reggae')) {
      return 'One-drop rhythms with heavy emphasis on the snare on beats 2 and 4, supported by deep sub-bass movements'
    }
    if (genreStr.includes('techno') || genreStr.includes('house')) {
      return 'Four-on-the-floor kick pattern with syncopated hi-hats and claps on the off-beats'
    }
    if (genreStr.includes('dnb')) {
      return 'Complex breakbeat patterns with rapid hi-hat work and heavy sub-bass movements'
    }
    if (bpm > 140) {
      return 'High-energy rhythmic patterns with driving percussion and syncopated elements'
    }
    return 'Structured rhythmic patterns with balanced kick, snare, and hi-hat interplay'
  }
  
  /**
   * Build comprehensive historical section (with fallbacks)
   */
  private buildHistoricalSection(musicology: any, comprehensiveHistorical: any, comprehensiveAnalysis?: any): any {
    let eraInfluences = [
      ...(musicology?.era?.eraInfluences || []),
      ...(comprehensiveHistorical?.eraInfluences || [])
    ].filter((v, i, a) => a.indexOf(v) === i)
    
    // Generate fallback era influences if missing
    if (eraInfluences.length === 0) {
      eraInfluences = this.inferEraInfluences(comprehensiveAnalysis)
    }
    
    return {
      eraInfluences: eraInfluences.slice(0, 5),
      historicalContext: musicology?.era?.historicalPeriod || 
                         comprehensiveHistorical?.historicalContext || 
                         this.inferHistoricalContext(comprehensiveAnalysis, eraInfluences),
      evolutionFrom: comprehensiveHistorical?.evolutionFrom || [],
      innovationPoints: comprehensiveHistorical?.innovationPoints || [],
      era: musicology?.era?.decade || comprehensiveHistorical?.era || '2020s'
    }
  }
  
  /**
   * Build comprehensive regional section (with fallbacks)
   */
  private buildRegionalSection(cultural: any, comprehensiveCultural: any, comprehensiveAnalysis?: any): any {
    let primaryRegions = [
      ...(cultural?.regions || []),
      ...(comprehensiveCultural?.primaryRegions || [])
    ].filter((v, i, a) => a.indexOf(v) === i)
    
    // Generate fallback regions if missing
    if (primaryRegions.length === 0) {
      primaryRegions = this.inferRegions(comprehensiveAnalysis)
    }
    
    let culturalInfluences = [
      ...(cultural?.culturalInfluences || []),
      ...(comprehensiveCultural?.culturalInfluences || [])
    ].filter((v, i, a) => a.indexOf(v) === i)
    
    // Generate fallback cultural influences if missing
    if (culturalInfluences.length === 0) {
      culturalInfluences = this.inferCulturalInfluences(comprehensiveAnalysis)
    }
    
    return {
      primaryRegions: primaryRegions.slice(0, 5),
      culturalInfluences: culturalInfluences.slice(0, 6),
      regionalCharacteristics: cultural?.regionalCharacteristics || 
                               comprehensiveCultural?.regionalCharacteristics || 
                               this.inferRegionalCharacteristics(primaryRegions, comprehensiveAnalysis),
      crossCulturalElements: [
        ...(cultural?.crossCulturalElements || []),
        ...(comprehensiveCultural?.crossCulturalElements || [])
      ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5)
    }
  }
  
  /**
   * Generate fallback description from available data
   */
  private generateFallbackDescription(comprehensive: any, genres: any, emotional: any, drums: any): string {
    const bpm = comprehensive?.technical?.bpm || 0
    const primaryGenres = genres?.primaryGenres?.slice(0, 2).join('/') || 'Electronic'
    const emotions = emotional?.primaryEmotions?.slice(0, 2) || ['energetic']
    const drumPattern = drums?.pattern?.patternType || 'rhythmic'
    const energy = comprehensive?.technical?.energy?.level || 0.5
    
    const energyDesc = energy > 0.7 ? 'high-energy' : energy > 0.4 ? 'moderate-energy' : 'laid-back'
    const tempoDesc = bpm > 140 ? 'fast-paced' : bpm > 120 ? 'driving' : bpm > 90 ? 'groovy' : 'downtempo'
    
    return `A ${energyDesc} ${primaryGenres} track featuring ${tempoDesc} ${drumPattern} rhythms at ${bpm || 'variable'} BPM. The production delivers ${emotions[0]?.toLowerCase() || 'engaging'} vibes with carefully crafted sonic textures and dynamic arrangement. Perfect for ${energy > 0.6 ? 'the dance floor' : 'deep listening'} with its blend of modern production techniques and genre-defining elements.`
  }
  
  /**
   * Infer era influences from genres
   */
  private inferEraInfluences(comprehensive: any): string[] {
    const genres = comprehensive?.genres?.primary || []
    const genreStr = genres.join(' ').toLowerCase()
    const influences: string[] = []
    
    if (genreStr.includes('house') || genreStr.includes('techno')) {
      influences.push('Late 80s Detroit', '90s Chicago', 'Berlin minimal')
    }
    if (genreStr.includes('dub') || genreStr.includes('reggae')) {
      influences.push('70s Jamaica', 'UK Dub', 'Digital Reggae')
    }
    if (genreStr.includes('dnb') || genreStr.includes('drum')) {
      influences.push('90s UK Jungle', 'Bristol Sound', 'Amen Break Era')
    }
    if (genreStr.includes('trap') || genreStr.includes('hip')) {
      influences.push('2010s Atlanta', 'Southern Hip-Hop', 'Memphis Sound')
    }
    
    return influences.length > 0 ? influences.slice(0, 3) : ['Modern Electronic', 'Digital Production']
  }
  
  /**
   * Infer historical context
   */
  private inferHistoricalContext(comprehensive: any, eraInfluences: string[]): string {
    const genres = comprehensive?.genres?.primary || []
    if (eraInfluences.length > 0) {
      return `Drawing from ${eraInfluences.slice(0, 2).join(' and ')} traditions while incorporating contemporary production techniques.`
    }
    return `A modern electronic production that builds on established genre conventions while pushing sonic boundaries.`
  }
  
  /**
   * Infer regions from genres
   */
  private inferRegions(comprehensive: any): string[] {
    const genres = comprehensive?.genres?.primary || []
    const genreStr = genres.join(' ').toLowerCase()
    const regions: string[] = []
    
    if (genreStr.includes('house')) regions.push('Chicago', 'New York')
    if (genreStr.includes('techno')) regions.push('Detroit', 'Berlin')
    if (genreStr.includes('dub') || genreStr.includes('reggae')) regions.push('Jamaica', 'UK')
    if (genreStr.includes('dnb')) regions.push('UK', 'Bristol')
    if (genreStr.includes('trance')) regions.push('Germany', 'Netherlands')
    
    return regions.length > 0 ? regions.slice(0, 3) : ['Global']
  }
  
  /**
   * Infer cultural influences
   */
  private inferCulturalInfluences(comprehensive: any): string[] {
    const genres = comprehensive?.genres?.primary || []
    const genreStr = genres.join(' ').toLowerCase()
    const influences: string[] = []
    
    if (genreStr.includes('house')) influences.push('Disco', 'Funk', 'Soul')
    if (genreStr.includes('techno')) influences.push('Industrial', 'Funk', 'Electro')
    if (genreStr.includes('dub') || genreStr.includes('reggae')) influences.push('Rastafarian', 'African Diaspora', 'Sound System Culture')
    if (genreStr.includes('dnb')) influences.push('Jungle', 'Rave Culture', 'UK Bass')
    
    return influences.length > 0 ? influences : ['Electronic Music Culture']
  }
  
  /**
   * Infer regional characteristics
   */
  private inferRegionalCharacteristics(regions: string[], comprehensive: any): string {
    if (regions.includes('Jamaica') || regions.includes('UK')) {
      return 'Heavy bass emphasis with spacious production and dub-influenced processing techniques.'
    }
    if (regions.includes('Detroit') || regions.includes('Berlin')) {
      return 'Minimalist approach with emphasis on hypnotic rhythms and industrial textures.'
    }
    if (regions.includes('Chicago')) {
      return 'Soulful elements combined with driving four-on-the-floor rhythms.'
    }
    return 'Modern production blending multiple regional influences into a cohesive sound.'
  }
  
  /**
   * Build summary from all sections
   */
  private buildSummary(description: string | null, intention: string | null, emotional: any, genres: any, musical: any): string {
    if (description && description.length > 50) {
      return description
    }
    
    // Build summary from available data
    const parts: string[] = []
    
    if (genres?.primaryGenres?.length) {
      parts.push(`A ${genres.primaryGenres.slice(0, 2).join('/')} track`)
    }
    
    if (emotional?.primaryEmotions?.length && emotional.primaryEmotions[0] !== 'Unknown') {
      parts.push(`evoking ${emotional.primaryEmotions.slice(0, 2).join(' and ')}`)
    }
    
    if (musical?.keySignature && musical.keySignature !== 'Unknown') {
      parts.push(`in ${musical.keySignature}`)
    }
    
    if (intention) {
      parts.push(`— ${intention.substring(0, 100)}`)
    }
    
    return parts.length > 0 ? parts.join(' ') : 'Analysis pending'
  }

  /**
   * Build comprehensive drums section with advanced analysis
   */
  private buildDrumsSection(drums: any, comprehensiveDrums: any, advancedAnalysis: any): any {
    // Base drums data
    const base = {
      ...comprehensiveDrums,
      ...drums,
    }

    // If we have advanced analysis, enhance the section
    if (advancedAnalysis) {
      return {
        ...base,
        // Pattern info
        pattern: {
          patternType: advancedAnalysis.signatureMatch?.name || drums?.patternType || base?.pattern?.patternType,
          kickPattern: drums?.kickPattern || base?.pattern?.kickPattern,
          snarePattern: drums?.snarePattern || base?.pattern?.snarePattern,
          hihatPattern: drums?.hihatPattern || base?.pattern?.hihatPattern,
          complexity: base?.pattern?.complexity || (advancedAnalysis.cadence?.complexity <= 3 ? 'simple' : 
                      advancedAnalysis.cadence?.complexity <= 6 ? 'moderate' : 'complex')
        },
        // Genre styles enhanced
        genreStyles: {
          primary: drums?.drumGenre?.subgenres || drums?.genreStyles || base?.genreStyles?.primary || [],
          secondary: drums?.drumGenre?.secondary || base?.genreStyles?.secondary || [],
          characteristics: advancedAnalysis.characteristics || base?.genreStyles?.characteristics || [],
          confidence: drums?.drumGenre?.confidence || base?.genreStyles?.confidence || 0
        },
        // Advanced kick analysis
        kickAnalysis: advancedAnalysis.kick ? {
          type: advancedAnalysis.kick.type,
          positions: advancedAnalysis.kick.positions,
          character: advancedAnalysis.kick.character,
          subBass: advancedAnalysis.kick.subBass,
          sidechain: advancedAnalysis.kick.sidechain
        } : null,
        // Advanced snare analysis
        snareAnalysis: advancedAnalysis.snare ? {
          type: advancedAnalysis.snare.type,
          positions: advancedAnalysis.snare.positions,
          ghostNotes: advancedAnalysis.snare.ghostNotes,
          rolls: advancedAnalysis.snare.rolls,
          character: advancedAnalysis.snare.character
        } : null,
        // Advanced hi-hat analysis
        hihatAnalysis: advancedAnalysis.hihat ? {
          type: advancedAnalysis.hihat.type,
          rhythm: advancedAnalysis.hihat.rhythm,
          velocity: advancedAnalysis.hihat.velocity,
          openPositions: advancedAnalysis.hihat.openPositions,
          character: advancedAnalysis.hihat.character
        } : null,
        // Cadence analysis
        cadence: advancedAnalysis.cadence ? {
          density: advancedAnalysis.cadence.density,
          complexity: advancedAnalysis.cadence.complexity,
          syncopation: advancedAnalysis.cadence.syncopation,
          groove: advancedAnalysis.cadence.groove,
          polyrhythm: advancedAnalysis.cadence.polyrhythm,
          layers: advancedAnalysis.cadence.layers
        } : null,
        // Timing analysis
        timing: advancedAnalysis.timing ? {
          type: advancedAnalysis.timing.type,
          confidence: advancedAnalysis.timing.confidence,
          indicators: advancedAnalysis.timing.indicators,
          effectiveBpm: advancedAnalysis.timing.effectiveBpm
        } : null,
        // Bassline analysis
        bassline: advancedAnalysis.bassline ? {
          type: advancedAnalysis.bassline.type,
          character: advancedAnalysis.bassline.character,
          slides: advancedAnalysis.bassline.slides,
          subHarmonics: advancedAnalysis.bassline.subHarmonics
        } : null,
        // Signature match
        signatureMatch: advancedAnalysis.signatureMatch || null,
        // Pattern recognition description
        patternRecognition: drums?.patternRecognition || advancedAnalysis.description || null
      }
    }

    return base
  }

  /**
   * Build comprehensive genres section with extended subgenre classification
   */
  private buildGenresSection(genre: any, comprehensiveGenres: any, subgenreAnalysis: any): any {
    // Base genres data
    const base = {
      ...comprehensiveGenres,
      ...genre,
    }

    // If we have subgenre analysis, enhance the section
    if (subgenreAnalysis) {
      return {
        ...base,
        // Primary genres
        primaryGenres: genre?.primaryGenres || base?.primary || [],
        // Extended subgenres from classifier
        subgenres: [
          ...(subgenreAnalysis.primary ? [subgenreAnalysis.primary.name] : []),
          ...(subgenreAnalysis.secondary?.map((s: any) => s.name) || []),
          ...(genre?.subgenres || base?.subgenres || [])
        ].filter((v, i, a) => a.indexOf(v) === i), // Remove duplicates
        // Microgenres
        microgenres: subgenreAnalysis.microgenres || genre?.microgenres || [],
        // Genre tags (MusicBrainz compatible)
        genreTags: [
          ...(genre?.genreTags || []),
          ...(genre?.musicbrainzCompatibleTags || []),
          ...(base?.genreTags || [])
        ].filter((v, i, a) => a.indexOf(v) === i),
        // Subgenre classification details
        subgenreClassification: subgenreAnalysis.primary ? {
          primary: {
            name: subgenreAnalysis.primary.name,
            parent: subgenreAnalysis.primary.parent,
            confidence: subgenreAnalysis.primary.confidence,
            matchedFeatures: subgenreAnalysis.primary.matchedFeatures
          },
          secondary: subgenreAnalysis.secondary || [],
          confidence: subgenreAnalysis.primary.confidence
        } : null,
        // Fusion description
        genreFusion: genre?.genreFusion || subgenreAnalysis.fusion || base?.fusion,
        // Genre evolution (AI-generated)
        genreEvolution: genre?.genreEvolution || null,
        // Genre characteristics
        genreCharacteristics: genre?.genreCharacteristics || subgenreAnalysis.characteristics || [],
        // Genre influences
        genreInfluences: genre?.genreInfluences || [],
        // Era and origins
        era: subgenreAnalysis.era || genre?.era,
        origins: subgenreAnalysis.origins || genre?.origins || [],
        // Timing context
        timingContext: genre?.timingContext || null,
        // Production style (AI-generated)
        productionStyle: genre?.productionStyle || null,
        // Confidence
        confidence: subgenreAnalysis.primary?.confidence || genre?.confidence || base?.confidence || 0
      }
    }

    return base
  }

  /**
   * Calculate overall quality score
   */
  private calculateQualityScore(results: Map<AgentType, AgentResult>): number {
    let totalScore = 0
    let count = 0

    results.forEach(result => {
      if (result.success) {
        totalScore += result.confidence * 100
        count++
      }
    })

    return count > 0 ? Math.round(totalScore / count) : 0
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): Record<string, { avg: number; min: number; max: number }> {
    const stats: Record<string, { avg: number; min: number; max: number }> = {}

    this.performanceMetrics.forEach((times, type) => {
      if (times.length > 0) {
        const sum = times.reduce((a, b) => a + b, 0)
        stats[type] = {
          avg: Math.round(sum / times.length),
          min: Math.min(...times),
          max: Math.max(...times)
        }
      }
    })

    return stats
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

