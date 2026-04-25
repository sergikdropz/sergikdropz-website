/**
 * Drum Pattern Expert Agent
 * Specializes in: Drum patterns, genre styles, pattern recognition
 * 
 * Enhanced with:
 * - Advanced kick/snare/hi-hat pattern analysis
 * - Half-time detection using bassline + drum data
 * - Percussion cadence and rhythm complexity analysis
 * - Extended subgenre classification
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import {
  analyzeAdvancedDrumPattern,
  DrumAnalysisResult,
  detectTimingFeel,
  DRUM_PATTERN_SIGNATURES
} from '../advancedDrumAnalyzer'
import { classifySubgenres, getSubgenreDescription } from '../extendedSubgenreClassifier'

export class DrumPatternExpertAgent extends BaseAgent {
  type = AgentType.DRUM_PATTERN_EXPERT
  capabilities: AgentCapabilities = {
    canProcessInParallel: true,
    requiresAudioFile: false,
    requiresMusicBrainz: false,
    estimatedProcessingTime: 3000, // AI call
    priority: 6
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      const { comprehensiveAnalysis, audioFeatures, musicbrainzData } = context

      // Get drum data from comprehensive analysis
      const drums = comprehensiveAnalysis?.drums
      const bpm = audioFeatures?.bpm || comprehensiveAnalysis?.technical?.bpm || null
      const energy = audioFeatures?.energyLevel || null
      
      // Get genre hints from various sources
      const genreHints = this.collectGenreHints(context)
      
      // Get MusicBrainz tags if available
      const musicbrainzTags = musicbrainzData?.artistInfo?.tags || []

      // Build frequency bands from existing data or defaults
      const frequencyBands = {
        kicks: drums?.frequency?.kickFrequency ? drums.frequency.kickFrequency / 100 : 0.6,
        snares: drums?.frequency?.snareFrequency ? drums.frequency.snareFrequency / 500 : 0.5,
        hihats: drums?.frequency?.hihatFrequency ? drums.frequency.hihatFrequency / 10000 : 0.5,
        cymbals: 0.3,
        lowFreq: drums?.pattern?.patternType?.includes('808') || drums?.pattern?.patternType?.includes('trap') ? 0.8 : 0.5
      }

      // Perform advanced drum pattern analysis
      const advancedAnalysis = analyzeAdvancedDrumPattern(
        frequencyBands,
        bpm,
        genreHints,
        []  // onset times - would come from actual audio analysis
      )

      // Classify subgenres using the analysis (with title-based detection)
      const subgenreResult = classifySubgenres(
        bpm,
        advancedAnalysis.timing,
        advancedAnalysis,
        energy,
        musicbrainzTags,
        genreHints,
        context.trackTitle // Pass track title for title-based genre detection
      )

      // Build legacy pattern data for compatibility
      const patternData = {
        patternType: advancedAnalysis.signatureMatch?.name || advancedAnalysis.drumGenre.primary,
        kickPattern: this.formatKickPattern(advancedAnalysis.kickPattern),
        snarePattern: this.formatSnarePattern(advancedAnalysis.snarePattern),
        hihatPattern: this.formatHihatPattern(advancedAnalysis.hihatPattern),
        genreStyles: advancedAnalysis.drumGenre.subgenres.length > 0 
          ? advancedAnalysis.drumGenre.subgenres 
          : [advancedAnalysis.drumGenre.primary, ...advancedAnalysis.drumGenre.secondary],
        complexity: advancedAnalysis.cadence.complexity <= 3 ? 'simple' : 
                    advancedAnalysis.cadence.complexity <= 6 ? 'moderate' : 'complex'
      }

      // Generate enhanced pattern recognition with AI
      const patternRecognition = await this.generateEnhancedPatternRecognition(
        advancedAnalysis,
        subgenreResult,
        context
      )

      // Build comprehensive result
      const result = {
        // Legacy fields for compatibility
        ...patternData,
        patternRecognition,
        
        // New advanced analysis fields
        advancedAnalysis: {
          // Kick analysis
          kick: {
            type: advancedAnalysis.kickPattern.type,
            positions: advancedAnalysis.kickPattern.positions,
            character: advancedAnalysis.kickPattern.character,
            subBass: advancedAnalysis.kickPattern.subBass,
            sidechain: advancedAnalysis.kickPattern.sidechain
          },
          // Snare analysis
          snare: {
            type: advancedAnalysis.snarePattern.type,
            positions: advancedAnalysis.snarePattern.positions,
            ghostNotes: advancedAnalysis.snarePattern.ghostNotes,
            rolls: advancedAnalysis.snarePattern.rolls,
            character: advancedAnalysis.snarePattern.character
          },
          // Hi-hat analysis
          hihat: {
            type: advancedAnalysis.hihatPattern.type,
            rhythm: advancedAnalysis.hihatPattern.rhythm,
            velocity: advancedAnalysis.hihatPattern.velocity,
            openPositions: advancedAnalysis.hihatPattern.openPositions,
            character: advancedAnalysis.hihatPattern.character
          },
          // Cadence analysis
          cadence: {
            density: advancedAnalysis.cadence.density,
            complexity: advancedAnalysis.cadence.complexity,
            syncopation: advancedAnalysis.cadence.syncopation,
            polyrhythm: advancedAnalysis.cadence.polyrhythm,
            layers: advancedAnalysis.cadence.layers,
            groove: advancedAnalysis.cadence.groove
          },
          // Timing analysis
          timing: {
            type: advancedAnalysis.timing.type,
            confidence: advancedAnalysis.timing.confidence,
            indicators: advancedAnalysis.timing.indicators,
            effectiveBpm: advancedAnalysis.timing.effectiveBpm
          },
          // Bassline analysis
          bassline: advancedAnalysis.bassline ? {
            type: advancedAnalysis.bassline.type,
            character: advancedAnalysis.bassline.character,
            slides: advancedAnalysis.bassline.slides,
            subHarmonics: advancedAnalysis.bassline.subHarmonics
          } : null,
          // Pattern signature match
          signatureMatch: advancedAnalysis.signatureMatch,
          // Characteristics
          characteristics: advancedAnalysis.characteristics,
          // Description
          description: advancedAnalysis.description
        },
        
        // Subgenre classification
        subgenreAnalysis: {
          primary: subgenreResult.primarySubgenre,
          secondary: subgenreResult.secondarySubgenres,
          microgenres: subgenreResult.microgenres,
          fusion: subgenreResult.fusionDescription,
          era: subgenreResult.era,
          origins: subgenreResult.origins
        },
        
        // Genre styles (enhanced)
        drumGenre: {
          primary: advancedAnalysis.drumGenre.primary,
          secondary: advancedAnalysis.drumGenre.secondary,
          subgenres: advancedAnalysis.drumGenre.subgenres,
          confidence: advancedAnalysis.drumGenre.confidence
        }
      }

      const processingTime = Date.now() - startTime
      return this.createSuccess(result, advancedAnalysis.drumGenre.confidence, processingTime)
    } catch (error: any) {
      console.error('DrumPatternExpertAgent error:', error)
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }

  /**
   * Collect genre hints from various sources
   */
  private collectGenreHints(context: AgentContext): string[] {
    const hints: string[] = []
    
    // From comprehensive analysis
    const genres = context.comprehensiveAnalysis?.genres
    if (genres) {
      if (genres.primary) hints.push(...genres.primary)
      if (genres.secondary) hints.push(...genres.secondary)
      if (genres.subgenres) hints.push(...genres.subgenres)
    }
    
    // From drum analysis
    const drums = context.comprehensiveAnalysis?.drums
    if (drums?.genreStyles?.primary) {
      hints.push(...drums.genreStyles.primary)
    }
    
    // From MusicBrainz
    const mbGenres = context.musicbrainzData?.artistInfo?.genres
    if (mbGenres) hints.push(...mbGenres)
    
    // From track title/artist (basic keyword detection)
    const title = context.trackTitle?.toLowerCase() || ''
    const artist = context.artistName?.toLowerCase() || ''
    
    const keywordGenres: Record<string, string[]> = {
      'trap': ['Trap'],
      'drill': ['Drill'],
      'dnb': ['Drum & Bass'],
      'house': ['House'],
      'techno': ['Techno'],
      'hip hop': ['Hip-Hop'],
      'hiphop': ['Hip-Hop'],
      'funk': ['Funk'],
      'soul': ['Soul'],
      'lofi': ['Lo-Fi'],
      'lo-fi': ['Lo-Fi']
    }
    
    for (const [keyword, genres] of Object.entries(keywordGenres)) {
      if (title.includes(keyword) || artist.includes(keyword)) {
        hints.push(...genres)
      }
    }
    
    // Remove duplicates
    return Array.from(new Set(hints))
  }

  /**
   * Format kick pattern for display
   */
  private formatKickPattern(kick: DrumAnalysisResult['kickPattern']): string {
    const parts: string[] = [kick.type.replace(/-/g, ' ')]
    if (kick.subBass) parts.push('with 808 sub')
    if (kick.sidechain) parts.push('sidechained')
    parts.push(`(${kick.character.slice(0, 2).join(', ')})`)
    return parts.join(' ')
  }

  /**
   * Format snare pattern for display
   */
  private formatSnarePattern(snare: DrumAnalysisResult['snarePattern']): string {
    const parts: string[] = [snare.type.replace(/-/g, ' ')]
    if (snare.ghostNotes.length > 0) parts.push('with ghost notes')
    if (snare.rolls.some(r => r !== 'none')) {
      parts.push(`(${snare.rolls.filter(r => r !== 'none').join('/')})`)
    }
    parts.push(`[${snare.character.slice(0, 2).join(', ')}]`)
    return parts.join(' ')
  }

  /**
   * Format hi-hat pattern for display
   */
  private formatHihatPattern(hihat: DrumAnalysisResult['hihatPattern']): string {
    const parts: string[] = [hihat.type.replace(/-/g, ' ')]
    parts.push(`${hihat.rhythm} rhythm`)
    if (hihat.openPositions.length > 0) parts.push('with opens')
    parts.push(`[${hihat.character.slice(0, 2).join(', ')}]`)
    return parts.join(' ')
  }

  /**
   * Generate enhanced pattern recognition with advanced analysis data
   */
  private async generateEnhancedPatternRecognition(
    advancedAnalysis: DrumAnalysisResult,
    subgenreResult: any,
    context: AgentContext
  ): Promise<string | null> {
    const bpm = context.audioFeatures?.bpm || 'Unknown'
    
    // Build comprehensive context for AI
    const timingDesc = advancedAnalysis.timing.type === 'half-time' 
      ? `HALF-TIME feel (effective BPM: ${advancedAnalysis.timing.effectiveBpm}, ${advancedAnalysis.timing.indicators.slice(0, 2).join(', ')})`
      : `FULL-TIME feel (${advancedAnalysis.timing.indicators.slice(0, 2).join(', ')})`
    
    const kickDesc = `${advancedAnalysis.kickPattern.type} kick (${advancedAnalysis.kickPattern.character.join(', ')})${advancedAnalysis.kickPattern.subBass ? ' with 808 sub-bass' : ''}`
    const snareDesc = `${advancedAnalysis.snarePattern.type} snare${advancedAnalysis.snarePattern.ghostNotes.length > 0 ? ' with ghost notes' : ''}${advancedAnalysis.snarePattern.rolls.some(r => r !== 'none') ? ', ' + advancedAnalysis.snarePattern.rolls.filter(r => r !== 'none').join('/') + ' rolls' : ''}`
    const hihatDesc = `${advancedAnalysis.hihatPattern.type} hi-hats (${advancedAnalysis.hihatPattern.rhythm} rhythm, ${advancedAnalysis.hihatPattern.velocity} velocity)`
    
    const cadenceDesc = `${advancedAnalysis.cadence.density} density, ${advancedAnalysis.cadence.groove} groove, complexity ${advancedAnalysis.cadence.complexity}/10${advancedAnalysis.cadence.syncopation > 50 ? ', highly syncopated' : ''}${advancedAnalysis.cadence.polyrhythm ? ', polyrhythmic elements' : ''}`
    
    const basslineDesc = advancedAnalysis.bassline 
      ? `${advancedAnalysis.bassline.type} bassline (${advancedAnalysis.bassline.character.join(', ')})${advancedAnalysis.bassline.slides ? ', with slides' : ''}`
      : 'No distinct bassline detected'
    
    const subgenreDesc = subgenreResult.primarySubgenre 
      ? `${subgenreResult.primarySubgenre.name} (${subgenreResult.primarySubgenre.parent}, ${Math.round(subgenreResult.primarySubgenre.confidence * 100)}% confidence)`
      : 'Genre undetermined'

    const prompt = `You are an expert drum pattern analyst with deep knowledge of electronic music production, hip-hop beats, and music theory. Provide a COMPREHENSIVE, CONTEXT-AWARE analysis.

TRACK: "${context.trackTitle}" by ${context.artistName}
BPM: ${bpm}

ADVANCED DRUM ANALYSIS:
- TIMING: ${timingDesc}
- KICK: ${kickDesc}
- SNARE: ${snareDesc}
- HI-HATS: ${hihatDesc}
- CADENCE: ${cadenceDesc}
- BASSLINE: ${basslineDesc}
- SIGNATURE MATCH: ${advancedAnalysis.signatureMatch ? `${advancedAnalysis.signatureMatch.name} (${advancedAnalysis.signatureMatch.similarity}% similarity)` : 'No strong signature match'}
- SUBGENRE: ${subgenreDesc}
${subgenreResult.secondarySubgenres.length > 0 ? `- SECONDARY INFLUENCES: ${subgenreResult.secondarySubgenres.map((s: any) => s.name).join(', ')}` : ''}
${subgenreResult.fusionDescription ? `- FUSION: ${subgenreResult.fusionDescription}` : ''}

ANALYSIS RULES:
1. HALF-TIME: Snare typically on beat 3 (position 9), laid-back groove, common in hip-hop, trap, dubstep
2. FULL-TIME: Standard 4/4 feel with snare on 2 and 4, common in house, techno, DnB
3. Consider bassline type when classifying (808 slides = trap/hip-hop, reese = DnB, sub = dubstep)
4. Polyrhythmic elements and triplet hi-hats are strong trap/halftime indicators
5. Ghost notes and swing suggest boom bap or jazz-influenced production

Write a DETAILED pattern recognition description (100-150 words). Cover:
1. Accurate subgenre classification with reasoning
2. Timing feel (half-time/full-time) and why
3. Key rhythmic characteristics (kick placement, snare style, hi-hat patterns)
4. How the drums interact with the bassline
5. Overall groove and energy
6. Production style and influences

Return JSON:
{
  "patternRecognition": "Your detailed, musically-informed pattern analysis here (100-150 words)"
}`

    const result = await this.callAI(this.withUserDirective(prompt, context), 2000)
    return result?.patternRecognition || advancedAnalysis.description
  }
}
