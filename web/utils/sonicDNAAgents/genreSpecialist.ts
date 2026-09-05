/**
 * Genre Specialist Agent
 * Specializes in: Genre analysis, characteristics, influences, fusion
 * 
 * Enhanced with:
 * - Extended subgenre classification (150+ subgenres)
 * - MusicBrainz tag integration
 * - Advanced timing-aware classification
 * - SERGIK AI genre mapping knowledge base
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import { extractInstrumentTypes, inferInstrumentUsageFromMeasured } from '@/lib/audio/instrument-usage'
import { 
  classifySubgenres, 
  getSubgenresForParent, 
  searchByMusicBrainzTag,
  getSubgenreDescription,
  SUBGENRE_PROFILES
} from '../extendedSubgenreClassifier'
import { detectTimingFeel, analyzeBassline } from '../advancedDrumAnalyzer'
import { formatBlackboardPrompt } from '@/lib/audio/sonic-dna-v2/agent-blackboard'

export class GenreSpecialistAgent extends BaseAgent {
  type = AgentType.GENRE_SPECIALIST
  capabilities: AgentCapabilities = {
    canProcessInParallel: true,
    requiresAudioFile: false,
    requiresMusicBrainz: false,
    estimatedProcessingTime: 4000, // AI call
    priority: 6
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const { comprehensiveAnalysis, musicbrainzData, audioFeatures } = context
      const measured = context.blackboard?.measured
      const hasGrooveCore = Boolean(
        measured?.bpm &&
          measured?.drumFamily &&
          String(measured.drumFamily) !== 'unknown',
      )

      const genres = comprehensiveAnalysis?.genres
      const drums = comprehensiveAnalysis?.drums
      const bpm = measured?.bpm || audioFeatures?.bpm || comprehensiveAnalysis?.technical?.bpm || null
      const energy = audioFeatures?.energyLevel || null

      // Collect genre hints — DSP-first: no title/folder keyword leakage once groove core exists
      const genreHints = this.collectGenreHints(context, { allowTitleKeywords: !hasGrooveCore })
      
      // Get MusicBrainz tags (secondary only when groove is already measured)
      const musicbrainzTags = hasGrooveCore
        ? []
        : [
            ...(musicbrainzData?.artistInfo?.tags || []),
            ...(musicbrainzData?.artistInfo?.genres || []),
          ]

      // Detect timing feel using available data
      const timing = this.detectTimingFromContext(context, bpm)

      // Prefer blackboard measured audio class when present
      const measuredPrimary = measured?.genre?.audioPrimary || measured?.genre?.primary
      const measuredSub = measured?.genre?.audioSubgenre || measured?.genre?.subgenre

      // Perform extended subgenre classification (title keywords only before DSP)
      const subgenreResult = classifySubgenres(
        bpm,
        timing,
        null, // drum analysis will be handled by drum pattern expert
        energy,
        musicbrainzTags,
        measuredPrimary ? [String(measuredPrimary), ...(measuredSub ? [String(measuredSub)] : []), ...genreHints] : genreHints,
        hasGrooveCore ? '' : context.trackTitle,
        extractInstrumentTypes(inferInstrumentUsageFromMeasured(measured || {})),
      )

      if (hasGrooveCore && measuredPrimary) {
        subgenreResult.primarySubgenre = {
          ...subgenreResult.primarySubgenre,
          name: String(measuredSub || measuredPrimary),
          parent: String(measuredPrimary),
          confidence: Math.max(subgenreResult.primarySubgenre.confidence || 0, measured?.genre?.confidence || 0.75),
        }
      }

      // Build comprehensive genre data
      const genreData = {
        // Primary genres from multiple sources
        primaryGenres: this.mergePrimaryGenres(
          genres?.primary || [],
          [subgenreResult.primarySubgenre.parent],
          genreHints
        ),
        
        // Enhanced subgenres from classifier
        subgenres: [
          subgenreResult.primarySubgenre.name,
          ...subgenreResult.secondarySubgenres.map(s => s.name)
        ],
        
        // Microgenres (more specific)
        microgenres: subgenreResult.microgenres,
        
        // MusicBrainz compatible tags
        genreTags: this.mergeGenreTags(
          genres?.genreTags || [],
          subgenreResult.musicbrainzCompatibleTags,
          musicbrainzTags
        ),
        
        // Subgenre classification details
        subgenreClassification: {
          primary: subgenreResult.primarySubgenre,
          secondary: subgenreResult.secondarySubgenres,
          confidence: subgenreResult.primarySubgenre.confidence
        },
        
        // Era and origins
        era: subgenreResult.era,
        origins: subgenreResult.origins,
        
        // Fusion description
        fusion: subgenreResult.fusionDescription,
        
        // Characteristics from subgenre profile
        characteristics: subgenreResult.characteristics
      }

      // Generate enhanced AI analysis
      const enhanced = await this.generateEnhancedAnalysis(genreData, subgenreResult, timing, context)

      const result = {
        ...genreData,
        ...enhanced,
        
        // Add timing context
        timingContext: {
          type: timing.type,
          confidence: timing.confidence,
          indicators: timing.indicators,
          effectiveBpm: timing.effectiveBpm
        }
      }

      const processingTime = Date.now() - startTime
      return this.createSuccess(result, subgenreResult.primarySubgenre.confidence, processingTime)
    } catch (error: any) {
      console.error('GenreSpecialistAgent error:', error)
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }

  /**
   * Collect genre hints from all available sources
   */
  private collectGenreHints(
    context: AgentContext,
    opts?: { allowTitleKeywords?: boolean },
  ): string[] {
    const hints: string[] = []
    const allowTitleKeywords = opts?.allowTitleKeywords !== false
    
    // From comprehensive analysis
    const genres = context.comprehensiveAnalysis?.genres
    if (genres) {
      if (genres.primary) hints.push(...genres.primary)
      if (genres.secondary) hints.push(...genres.secondary)
      if (genres.subgenres) hints.push(...genres.subgenres)
    }
    
    // From drum analysis
    const drums = context.comprehensiveAnalysis?.drums
    if (drums?.genreStyles) {
      if (drums.genreStyles.primary) hints.push(...drums.genreStyles.primary)
      if (drums.genreStyles.secondary) hints.push(...drums.genreStyles.secondary)
    }

    // Measured audio class from unified genre engine / DSP
    const measuredGenre = context.blackboard?.measured?.genre
    if (measuredGenre?.audioPrimary) hints.push(String(measuredGenre.audioPrimary))
    if (measuredGenre?.primary) hints.push(String(measuredGenre.primary))
    if (measuredGenre?.subgenre) hints.push(String(measuredGenre.subgenre))
    
    // From MusicBrainz (only when title keywords allowed — pre-DSP)
    if (allowTitleKeywords && context.musicbrainzData?.artistInfo) {
      const mb = context.musicbrainzData.artistInfo
      if (mb.genres) hints.push(...mb.genres)
      if (mb.tags) hints.push(...mb.tags)
    }
    
    // Extract from title keywords — disabled once groove core exists
    if (allowTitleKeywords) {
      const titleKeywords = this.extractGenreKeywords(context.trackTitle || '')
      hints.push(...titleKeywords)
    }
    
    // Remove duplicates and return
    return Array.from(new Set(hints.filter(h => h && h.length > 0)))
  }

  /**
   * Extract genre-related keywords from text
   */
  private extractGenreKeywords(text: string): string[] {
    const keywords: string[] = []
    const textLower = text.toLowerCase()
    
    const genreKeywordMap: Record<string, string[]> = {
      'trap': ['Trap'],
      'drill': ['Drill'],
      'dnb': ['Drum & Bass'],
      'd&b': ['Drum & Bass'],
      'drum and bass': ['Drum & Bass'],
      'house': ['House'],
      'techno': ['Techno'],
      'hip hop': ['Hip-Hop'],
      'hiphop': ['Hip-Hop'],
      'hip-hop': ['Hip-Hop'],
      'boom bap': ['Boom Bap'],
      'lofi': ['Lo-Fi'],
      'lo-fi': ['Lo-Fi'],
      'chillhop': ['Lo-Fi', 'Chillhop'],
      'funk': ['Funk'],
      'soul': ['Soul'],
      'disco': ['Disco'],
      'garage': ['UK Garage'],
      'dubstep': ['Dubstep'],
      'jungle': ['Jungle'],
      'trance': ['Trance'],
      'ambient': ['Ambient'],
      'phonk': ['Phonk'],
      'reggaeton': ['Reggaeton'],
      'amapiano': ['Amapiano']
    }
    
    for (const [keyword, genres] of Object.entries(genreKeywordMap)) {
      if (textLower.includes(keyword)) {
        keywords.push(...genres)
      }
    }
    
    return keywords
  }

  /**
   * Detect timing feel from context
   */
  private detectTimingFromContext(context: AgentContext, bpm: number | null): {
    type: 'full-time' | 'half-time' | 'double-time' | 'variable'
    confidence: number
    indicators: string[]
    effectiveBpm: number
  } {
    const indicators: string[] = []
    let type: 'full-time' | 'half-time' | 'double-time' | 'variable' = 'full-time'
    let confidence = 50
    let effectiveBpm = bpm || 120

    // Get drum pattern info
    const drums = context.comprehensiveAnalysis?.drums
    const patternType = drums?.pattern?.patternType?.toLowerCase() || ''
    
    // Get genre context
    const genres = context.comprehensiveAnalysis?.genres?.primary || []
    const genresLower = genres.map((g: string) => g.toLowerCase())

    // Half-time indicators
    const halfTimeGenres = ['hip hop', 'hip-hop', 'trap', 'dubstep', 'phonk', 'drill', 'lo-fi', 'lofi', 'boom bap']
    const halfTimePatterns = ['808', 'trap', 'half', 'boom-bap', 'dubstep']

    // Check BPM
    if (bpm) {
      if (bpm < 90) {
        indicators.push('very low BPM')
        confidence += 30
      } else if (bpm < 100) {
        indicators.push('low BPM range')
        confidence += 20
      } else if (bpm >= 130 && bpm <= 170) {
        // Check if it's trap (fast BPM but half-time feel)
        if (genresLower.some((g: string) => halfTimeGenres.includes(g))) {
          indicators.push('trap tempo with half-time feel')
          confidence += 25
        }
      } else if (bpm >= 138 && bpm <= 145) {
        // Dubstep range
        if (genresLower.includes('dubstep')) {
          indicators.push('dubstep tempo')
          confidence += 25
        }
      }
    }

    // Check genre context
    const matchedHalfTimeGenres = genresLower.filter((g: string) => 
      halfTimeGenres.some((htg: string) => g.includes(htg))
    )
    if (matchedHalfTimeGenres.length > 0) {
      indicators.push(`genre context: ${matchedHalfTimeGenres.join(', ')}`)
      confidence += matchedHalfTimeGenres.length * 10
    }

    // Check pattern type
    if (halfTimePatterns.some(p => patternType.includes(p))) {
      indicators.push(`pattern: ${patternType}`)
      confidence += 15
    }

    // Determine final timing
    confidence = Math.min(100, confidence)
    if (confidence >= 60) {
      type = 'half-time'
      effectiveBpm = bpm ? Math.round(bpm / 2) : 70
    }

    return { type, confidence, indicators, effectiveBpm }
  }

  /**
   * Merge primary genres from multiple sources
   */
  private mergePrimaryGenres(
    existing: string[],
    fromClassifier: string[],
    hints: string[]
  ): string[] {
    const all = [...existing, ...fromClassifier]
    
    // Add strong hint matches
    const strongHints = hints.filter(h => 
      ['House', 'Techno', 'Hip-Hop', 'Trap', 'Drum & Bass', 'Dubstep', 'Funk', 'Soul'].includes(h)
    )
    all.push(...strongHints)
    
    // Remove duplicates and limit to 5
    return Array.from(new Set(all)).slice(0, 5)
  }

  /**
   * Merge genre tags from multiple sources
   */
  private mergeGenreTags(
    existing: string[],
    fromClassifier: string[],
    musicbrainz: string[]
  ): string[] {
    const all = [...existing, ...fromClassifier, ...musicbrainz]
    return Array.from(new Set(all)).slice(0, 20)
  }

  /**
   * Generate enhanced AI analysis with subgenre context
   */
  private async generateEnhancedAnalysis(
    genreData: any,
    subgenreResult: any,
    timing: any,
    context: AgentContext
  ): Promise<any> {
    const bpm = context.audioFeatures?.bpm || 'Unknown'
    const energyLevel = context.audioFeatures?.energyLevel || 'Unknown'
    
    // Build rich context for AI
    const primarySubgenre = subgenreResult.primarySubgenre
    const subgenreDesc = getSubgenreDescription(primarySubgenre.name)
    
    const timingContext = timing.type === 'half-time' 
      ? `HALF-TIME feel (effective BPM: ${timing.effectiveBpm}, ${timing.indicators.slice(0, 2).join(', ')})`
      : `FULL-TIME feel (standard tempo)`
    
    const secondaryDesc = subgenreResult.secondarySubgenres.length > 0
      ? `Secondary influences: ${subgenreResult.secondarySubgenres.map((s: any) => `${s.name} (${Math.round(s.confidence * 100)}%)`).join(', ')}`
      : 'No strong secondary influences'

    const prompt = `You are an expert genre specialist grounded in the shared Sonic DNA encyclopedia blackboard.

${formatBlackboardPrompt(context.blackboard)}

TRACK: "${context.trackTitle}" by ${context.artistName}
BPM: ${bpm}
ENERGY: ${energyLevel}
TIMING: ${timingContext}

SUBGENRE CLASSIFICATION:
- PRIMARY: ${primarySubgenre.name} (${primarySubgenre.parent}) - ${Math.round(primarySubgenre.confidence * 100)}% confidence
- MATCHED FEATURES: ${primarySubgenre.matchedFeatures.join(', ')}
- ${secondaryDesc}
${subgenreResult.microgenres.length > 0 ? `- MICROGENRES: ${subgenreResult.microgenres.join(', ')}` : ''}
${subgenreResult.fusionDescription ? `- FUSION: ${subgenreResult.fusionDescription}` : ''}
${subgenreResult.era ? `- ERA: ${subgenreResult.era}` : ''}
${subgenreResult.origins.length > 0 ? `- ORIGINS: ${subgenreResult.origins.join(', ')}` : ''}

SUBGENRE PROFILE: ${subgenreDesc || 'No detailed profile available'}

GENRE TAGS: ${genreData.genreTags.slice(0, 10).join(', ') || 'None'}

ANALYSIS GUIDELINES:
1. Prefer measured drums/BPM + encyclopedia primary over playlist/folder/title leakage
2. Consider the timing feel (half-time vs full-time) in your genre assessment
3. Reference specific subgenre characteristics that match this track
4. Identify production techniques typical of the classified subgenre
5. Note any genre fusion or hybrid elements — adjacent traditions are context, not extra crate labels

Provide DETAILED genre analysis in JSON. Be specific and musically informed:
{
  "genreCharacteristics": ["5-7 specific characteristics that define this track's genre placement"],
  "genreInfluences": ["4-6 specific musical influences (artists, movements, eras)"],
  "genreFusion": "DETAILED description (100-150 words) of how different genre elements blend in this track. Reference specific production techniques, rhythmic patterns, and sonic textures.",
  "genreEvolution": "DETAILED analysis (100-150 words) of how this track relates to genre evolution. Reference the subgenre's history, modern interpretations, and this track's place in the genre landscape.",
  "productionStyle": "CONCISE description (50-80 words) of production techniques characteristic of this subgenre",
  "eraContext": "Brief note on era/decade influences if applicable"
}

Ensure ALL fields are filled with specific, informed content.`

    const result = await this.callAI(this.withUserDirective(prompt, context), 2500)
    return result || {}
  }
}
