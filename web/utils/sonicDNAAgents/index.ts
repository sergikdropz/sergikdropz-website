/**
 * Sonic DNA Agent System - Main Export
 * Specialized AI agents for efficient musical analysis
 * 
 * Enhanced with:
 * - Advanced drum pattern analysis
 * - Extended subgenre classification (150+ subgenres)
 * - Half-time/timing detection
 * - MusicBrainz integration
 */

export { PipelineOrchestrator } from './pipelineOrchestrator'
export { EnhancedPipelineOrchestrator } from './enhancedOrchestrator'
export { AgentType } from './agentTypes'
export type { AgentContext, AgentResult } from './agentTypes'
export { BaseAgent } from './baseAgent'

// Export individual agents
export { WaveformGeneratorAgent } from './waveformGenerator' // The "Father" - highest priority
export { TechnicalAnalyzerAgent } from './technicalAnalyzer'
export { HarmonyAnalystAgent } from './harmonyAnalyst'
export { IntentionAnalystAgent } from './intentionAnalyst'
export { DescriptionWriterAgent } from './descriptionWriter'
export { DrumPatternExpertAgent } from './drumPatternExpert' // Enhanced with advanced drum analysis
export { GenreSpecialistAgent } from './genreSpecialist' // Enhanced with extended subgenre classification
export { MusicologistAgent } from './musicologist'
export { CulturalAnalystAgent } from './culturalAnalyst'
export { EmotionalPsychologistAgent } from './emotionalPsychologist'

// Re-export enhanced analysis utilities for convenience
export { analyzeAdvancedDrumPattern, DRUM_PATTERN_SIGNATURES } from '../advancedDrumAnalyzer'
export { classifySubgenres, SUBGENRE_PROFILES } from '../extendedSubgenreClassifier'
export { analyzeEnhancedSonicDNA, mergeEnhancedIntoSonicDNA } from '../enhancedSonicDNAAnalysis'

