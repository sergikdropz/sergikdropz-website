/**
 * Instrument Usage Analyst — technical bass/keys/percussion/synth detection.
 * Deterministic specialist (no LLM); merges onto blackboard.measured.instrumentUsage.
 */

import { BaseAgent } from './baseAgent'
import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'
import { peerAgentData } from '@/lib/audio/sonic-dna-v2/agent-blackboard'
import {
  inferInstrumentUsageFromMeasured,
  mergeInstrumentUsage,
  type InstrumentUsage,
} from '@/lib/audio/instrument-usage'

export class InstrumentUsageAnalystAgent extends BaseAgent {
  type = AgentType.INSTRUMENT_USAGE_ANALYST
  capabilities: AgentCapabilities = {
    canProcessInParallel: true,
    requiresAudioFile: false,
    requiresMusicBrainz: false,
    estimatedProcessingTime: 350,
    priority: 6,
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now()
    try {
      const measured = context.blackboard?.measured || {}
      const drums = peerAgentData(context.previousAgentResults, AgentType.DRUM_PATTERN_EXPERT)
      const bassPeer = peerAgentData(context.previousAgentResults, AgentType.BASS_POCKET_ANALYST)
      const harmony = peerAgentData(context.previousAgentResults, AgentType.HARMONY_ANALYST)

      const seed = {
        ...measured,
        bass: {
          ...(measured.bass || {}),
          lock: bassPeer?.lock || measured.bass?.lock,
          rootNote: bassPeer?.rootNote || measured.bass?.rootNote,
        },
        percussion: {
          ...(measured.percussion || {}),
          kickRole: measured.percussion?.kickRole,
          snareRole: measured.percussion?.snareRole,
          hatGrid: measured.percussion?.hatGrid,
        },
        drumFamily: measured.drumFamily || drums?.signatureMatch?.name || drums?.pattern?.patternType,
        key: measured.key || harmony?.keySignature || context.audioFeatures?.key,
      }

      const dspUsage = inferInstrumentUsageFromMeasured(seed)
      const agentEntries = this.agentRefinements(context, dspUsage)
      const merged = mergeInstrumentUsage(dspUsage, agentEntries)

      const avgConf =
        merged.entries.length > 0
          ? merged.entries.reduce((sum, e) => sum + e.confidence, 0) / merged.entries.length
          : 0.45

      return this.createSuccess(
        {
          instrumentUsage: merged,
          summary: merged.summary,
          lines: merged.lines,
          bassType: merged.bass?.type || null,
          categories: [...new Set(merged.entries.map((e) => e.category))],
        },
        Math.min(0.92, avgConf),
        Date.now() - startTime,
      )
    } catch (error: any) {
      return this.createFailure(error.message, Date.now() - startTime)
    }
  }

  /** Light agent layer — genre-informed labels only when DSP hints exist. */
  private agentRefinements(context: AgentContext, dsp: InstrumentUsage): InstrumentUsage | null {
    const genre = String(
      context.blackboard?.measured?.genre?.primary ||
        context.blackboard?.measured?.genre?.audioPrimary ||
        '',
    ).toLowerCase()
    const entries = [...(dsp.entries || [])]
    let changed = false

    const hasPercussionHint = entries.some((e) => e.category === 'percussion')
    if (/disco|house|funk|latin|afro/.test(genre) && hasPercussionHint) {
      if (!entries.some((e) => e.type === 'conga') && /disco|latin|afro/.test(genre)) {
        entries.push({
          type: 'conga',
          category: 'percussion',
          role: 'groove',
          confidence: 0.41,
          source: 'agent',
          evidence: `genre=${genre} + percussion present`,
          usage: 'Conga or hand-drum color inferred from groove class and percussion density.',
        })
        changed = true
      }
      if (!entries.some((e) => e.type === 'shaker') && /house|disco|funk/.test(genre)) {
        entries.push({
          type: 'shaker',
          category: 'percussion',
          role: 'texture',
          confidence: 0.4,
          source: 'agent',
          evidence: `genre=${genre}`,
          usage: 'Shaker layer likely supports the offbeat hat ride in this groove class.',
        })
        changed = true
      }
    }

    if (/reggae|dub|steppers/.test(genre) && dsp.bass?.type === 'synth-bass') {
      const idx = entries.findIndex((e) => e.category === 'bass')
      if (idx >= 0) {
        entries[idx] = {
          ...entries[idx],
          type: 'electric-bass',
          source: 'agent',
          confidence: Math.min(0.58, entries[idx].confidence + 0.06),
          usage: 'Electric bass or live bass guitar is typical for reggae/steppers even when sub-heavy.',
        }
        changed = true
      }
    }

    if (!changed) return null
    return mergeInstrumentUsage(dsp, { entries, analyzedAt: new Date().toISOString() })
  }
}
