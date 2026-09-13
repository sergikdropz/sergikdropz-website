/**
 * Sonic DNA Agent System - Agent Type Definitions
 * Specialized agents for different aspects of musical analysis
 */

import type { AgentBlackboard } from '@/lib/audio/sonic-dna-v2/agent-blackboard'

export enum AgentType {
  WAVEFORM_GENERATOR = 'waveform_generator', // The "Father" - highest priority
  TECHNICAL_ANALYZER = 'technical_analyzer',
  MUSICOLOGIST = 'musicologist',
  CULTURAL_ANALYST = 'cultural_analyst',
  EMOTIONAL_PSYCHOLOGIST = 'emotional_psychologist',
  /** Listener psychology / tendencies bound to measured groove (not therapy claims). */
  PSYCHOLOGY_ANALYST = 'psychology_analyst',
  /** Activation, entrainment, spectral/temporal listener effects. */
  PSYCHOACOUSTICS_ANALYST = 'psychoacoustics_analyst',
  GENRE_SPECIALIST = 'genre_specialist',
  DRUM_PATTERN_EXPERT = 'drum_pattern_expert',
  /** Bass lock / pocket timing / swing — DSP measure specialist. */
  BASS_POCKET_ANALYST = 'bass_pocket_analyst',
  /** Bass type, keys, percussion families, synths — technical instrument usage. */
  INSTRUMENT_USAGE_ANALYST = 'instrument_usage_analyst',
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
  /** Peer outputs keyed by AgentType — bare `data` payloads (see peerAgentData helper). */
  previousAgentResults?: Record<string, any>
  waveformData?: {
    data: number[]
    samples: number
    sampleRate: number
  } // Waveform data from WaveformGenerator agent
  /** Shared measured + encyclopedia collaboration bus for polymath parallel agents. */
  blackboard?: AgentBlackboard
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
