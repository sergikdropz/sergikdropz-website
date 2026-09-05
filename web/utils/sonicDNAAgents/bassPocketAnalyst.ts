/**
 * Bass Pocket Analyst — DSP measure specialist.
 * Locks bass lock / timing feel / swing onto the blackboard from drums + spectral hints.
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import { peerAgentData } from '@/lib/audio/sonic-dna-v2/agent-blackboard'
import { bassHintsFromPeers, inferBassPocket } from '@/lib/audio/bass-pocket'
import { analyzeBassline } from '../advancedDrumAnalyzer'

export class BassPocketAnalystAgent extends BaseAgent {
  type = AgentType.BASS_POCKET_ANALYST
  capabilities: AgentCapabilities = {
    canProcessInParallel: true,
    requiresAudioFile: false,
    requiresMusicBrainz: false,
    estimatedProcessingTime: 400,
    priority: 6,
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()
    try {
      const drums = peerAgentData(context.previousAgentResults, AgentType.DRUM_PATTERN_EXPERT)
      const measured = context.blackboard?.measured
      const hints = bassHintsFromPeers({
        drums,
        comprehensive: context.comprehensiveAnalysis,
        measured,
      })

      const bpm = measured?.bpm ?? context.audioFeatures?.bpm ?? context.comprehensiveAnalysis?.technical?.bpm ?? null
      const drumFamily =
        measured?.drumFamily ||
        drums?.signatureMatch?.name ||
        drums?.pattern?.patternType ||
        drums?.advancedAnalysis?.signatureMatch?.name ||
        null

      let bassline = hints.bassline
      if (!bassline) {
        const low =
          hints.lowFreq ??
          Number(context.comprehensiveAnalysis?.technical?.frequencyBands?.lowFreq) ??
          0.55
        bassline = analyzeBassline(Number.isFinite(low) ? low : 0.55, bpm, [
          String(drumFamily || ''),
          String(measured?.genre?.audioPrimary || measured?.genre?.primary || ''),
        ].filter(Boolean))
      }

      const pocket = inferBassPocket({
        bpm,
        drumFamily,
        timingFeel: hints.timingFeel || measured?.timingFeel || null,
        swingPercent: hints.swingPercent ?? measured?.swingPercent ?? null,
        key: measured?.key || context.audioFeatures?.key || null,
        existingLock: hints.existingLock,
        bassline,
        lowFreqEnergy: hints.lowFreq,
        kickSteps: measured?.kickSteps || drums?.kickAnalysis?.positions || drums?.advancedAnalysis?.kick?.positions,
        snareSteps: measured?.snareSteps || drums?.snareAnalysis?.positions || drums?.advancedAnalysis?.snare?.positions,
      })

      return this.createSuccess(
        {
          lock: pocket.lock,
          rootNote: pocket.rootNote,
          slidesLikely: pocket.slidesLikely,
          timingFeel: pocket.timingFeel,
          swingPercent: pocket.swingPercent,
          confidence: pocket.confidence,
          reason: pocket.reason,
          character: pocket.character,
          bassline,
          summary: `${pocket.lock}${pocket.timingFeel ? ` · ${pocket.timingFeel}` : ''}`,
        },
        pocket.confidence,
        Date.now() - startTime,
      )
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }
}
