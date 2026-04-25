/**
 * Sonic DNA Agent System - Agent Type Definitions
 * Specialized agents for different aspects of musical analysis
 */

export enum AgentType {
  WAVEFORM_GENERATOR = 'waveform_generator', // The "Father" - highest priority
  TECHNICAL_ANALYZER = 'technical_analyzer',
  MUSICOLOGIST = 'musicologist',
  CULTURAL_ANALYST = 'cultural_analyst',
  EMOTIONAL_PSYCHOLOGIST = 'emotional_psychologist',
  GENRE_SPECIALIST = 'genre_specialist',
  DRUM_PATTERN_EXPERT = 'drum_pattern_expert',
  HARMONY_ANALYST = 'harmony_analyst',
  INTENTION_ANALYST = 'intention_analyst',
  DESCRIPTION_WRITER = 'description_writer',
  SYNTHESIZER = 'synthesizer' // Final synthesis agent
}

export interface AgentContext {
  trackTitle: string
  artistName: string
  userDirective?: string
  audioFeatures: {
    bpm?: number
    energyLevel?: number
    duration: number
    key?: string
    timeSignature?: string
    audioFileUrl?: string // Audio file URL for waveform generation
  }
  comprehensiveAnalysis?: any
  musicbrainzData?: any
  previousAgentResults?: Record<string, any>
  waveformData?: {
    data: number[]
    samples: number
    sampleRate: number
  } // Waveform data from WaveformGenerator agent
}

export interface AgentResult {
  agentType: AgentType
  success: boolean
  data: any
  confidence: number // 0-1
  processingTime: number // milliseconds
  error?: string
}

export interface AgentCapabilities {
  canProcessInParallel: boolean
  requiresAudioFile: boolean
  requiresMusicBrainz: boolean
  estimatedProcessingTime: number // milliseconds
  priority: number // Higher = more important, processed first
}
