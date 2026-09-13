/**
 * Merge a parallel agent wave onto the blackboard.
 * Detects simple conflicts; prefers measured seed / DSP genre lock over contradictory LLM guesses.
 */

import type { AgentBlackboard } from './agent-blackboard'
import {
  appendBlackboardEvidence,
  lockGenreAndRefreshKb,
  markWaveComplete,
  recordAgentOutput,
} from './agent-blackboard'
import { AgentType, type AgentResult } from '@/utils/sonicDNAAgents/agentTypes'
import { resolveMeasuredGenreConflicts } from './accuracy-challenge'

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

export function mergeAgentWaveOntoBlackboard(
  board: AgentBlackboard,
  waveId: string,
  results: Array<{ type: AgentType; result: AgentResult }>,
): AgentBlackboard {
  let next = { ...board }
  const conflicts = [...board.conflicts]

  for (const { type, result } of results) {
    if (!result?.success || !result.data) continue
    next = recordAgentOutput(next, type, result.data)
    const data = asRecord(result.data)

    // Soft-merge genre / drums hints when measured seed is empty
    if (type === AgentType.GENRE_SPECIALIST) {
      const primary = data.primaryGenres?.[0] || data.primary?.[0]
      if (primary && !next.measured.genre?.primary && !next.measured.genre?.audioPrimary) {
        next = {
          ...next,
          measured: {
            ...next.measured,
            genre: {
              ...(next.measured.genre || {}),
              primary: String(primary),
              subgenre: data.subgenres?.[0] || next.measured.genre?.subgenre,
              source: 'audio-measured',
            },
          },
        }
      } else if (
        primary &&
        next.measured.genre?.audioPrimary &&
        String(primary) !== String(next.measured.genre.audioPrimary)
      ) {
        conflicts.push({
          field: 'genre.primary',
          a: next.measured.genre.audioPrimary,
          b: primary,
          note: 'Genre specialist disagreed with DSP-locked audioPrimary; DSP lock kept',
        })
      } else if (primary && next.measured.genre?.primary && String(primary) !== String(next.measured.genre.primary)) {
        conflicts.push({
          field: 'genre.primary',
          a: next.measured.genre.primary,
          b: primary,
          note: 'Genre specialist disagreed with seed; seed kept until encyclopedia blend',
        })
      }
    }

    if (type === AgentType.DRUM_PATTERN_EXPERT) {
      const family =
        data.signatureMatch?.name ||
        data.pattern?.patternType ||
        data.patternType ||
        data.advancedAnalysis?.signatureMatch?.name
      if (family && !next.measured.drumFamily) {
        next = { ...next, measured: { ...next.measured, drumFamily: String(family) } }
      } else if (family && next.measured.drumFamily && String(family) !== String(next.measured.drumFamily)) {
        conflicts.push({
          field: 'drumFamily',
          a: next.measured.drumFamily,
          b: family,
          note: 'Drum agent disagreed with seed; seed kept',
        })
      }
      const kicks = data.kickAnalysis?.positions || data.advancedAnalysis?.kick?.positions
      const snares = data.snareAnalysis?.positions || data.advancedAnalysis?.snare?.positions
      if (Array.isArray(kicks) && kicks.length && !(next.measured.kickSteps || []).length) {
        next = { ...next, measured: { ...next.measured, kickSteps: kicks } }
      }
      if (Array.isArray(snares) && snares.length && !(next.measured.snareSteps || []).length) {
        next = { ...next, measured: { ...next.measured, snareSteps: snares } }
      }
      const timing = data.timing?.type || data.advancedAnalysis?.timing?.type
      if (timing && !next.measured.timingFeel) {
        next = { ...next, measured: { ...next.measured, timingFeel: String(timing) } }
      }
    }

    if (type === AgentType.BASS_POCKET_ANALYST) {
      const lock = String(data.lock || '').trim()
      const priorLock = String(next.measured.bass?.lock || '').trim()
      if (lock && lock !== 'unknown' && (!priorLock || priorLock === 'unknown')) {
        next = {
          ...next,
          measured: {
            ...next.measured,
            bass: {
              ...(next.measured.bass || {}),
              lock,
              rootNote: data.rootNote || next.measured.bass?.rootNote || null,
              slidesLikely: Boolean(data.slidesLikely),
            },
          },
        }
      } else if (lock && priorLock && lock !== priorLock && priorLock !== 'unknown') {
        conflicts.push({
          field: 'bass.lock',
          a: priorLock,
          b: lock,
          note: 'Bass pocket disagreed with seed; seed kept',
        })
      }
      if (data.timingFeel && !next.measured.timingFeel) {
        next = { ...next, measured: { ...next.measured, timingFeel: String(data.timingFeel) } }
      }
      if (Number.isFinite(Number(data.swingPercent)) && next.measured.swingPercent == null) {
        next = { ...next, measured: { ...next.measured, swingPercent: Number(data.swingPercent) } }
      }
    }

    if (type === AgentType.INSTRUMENT_USAGE_ANALYST) {
      const usage = data.instrumentUsage
      if (usage && Array.isArray(usage.entries) && usage.entries.length) {
        next = {
          ...next,
          measured: {
            ...next.measured,
            instrumentUsage: usage,
            intelligence: {
              ...(next.measured.intelligence || {}),
              instrumentationText: Array.isArray(usage.lines) ? usage.lines.join('\n\n') : usage.summary || '',
            },
          },
        }
        const musical = (next.measured.intelligence as Record<string, any>)?.musical || {}
        const instList = usage.entries
          .filter((e: { confidence?: number }) => (e.confidence || 0) >= 0.4)
          .map((e: { type?: string }) => String(e.type || '').replace(/-/g, ' '))
        if (instList.length) {
          next = {
            ...next,
            measured: {
              ...next.measured,
              intelligence: {
                ...(next.measured.intelligence || {}),
                musical: {
                  ...musical,
                  instrumentation: instList.slice(0, 10),
                },
              },
            },
          }
        }
      }
    }

    if (type === AgentType.HARMONY_ANALYST || type === AgentType.TECHNICAL_ANALYZER) {
      const key = data.keySignature || data.key?.key || data.key
      if (key && !next.measured.key) {
        next = {
          ...next,
          measured: {
            ...next.measured,
            key: String(key),
            keyConfidence: Math.max(Number(next.measured.keyConfidence) || 0, 0.55),
          },
        }
      }
      const bpm = data.bpm
      if (Number.isFinite(Number(bpm)) && !next.measured.bpm) {
        next = {
          ...next,
          measured: {
            ...next.measured,
            bpm: Number(bpm),
            bpmConfidence: Math.max(Number(next.measured.bpmConfidence) || 0, 0.7),
          },
        }
      }
    }

    // Soft-merge polymath psychology / psychoacoustics onto measured intelligence for compose
    if (type === AgentType.PSYCHOLOGY_ANALYST) {
      const profile = String(data.psychologicalProfile || '').trim()
      if (profile.length >= 40) {
        const intel = asRecord(next.measured.intelligence)
        const emotional = asRecord(intel.emotional)
        const layers = asRecord(asRecord(next.measured.report).layers)
        next = {
          ...next,
          measured: {
            ...next.measured,
            intelligence: {
              ...intel,
              emotional: { ...emotional, psychologicalProfile: profile },
            },
            report: {
              ...asRecord(next.measured.report),
              layers: { ...layers, psychological: profile },
            },
          },
        }
      }
    }

    if (type === AgentType.PSYCHOACOUSTICS_ANALYST) {
      const report = String(data.report || '').trim()
      if (report.length >= 40) {
        const intel = asRecord(next.measured.intelligence)
        const priorPsycho = asRecord(intel.psychoacoustics)
        const layers = asRecord(asRecord(next.measured.report).layers)
        next = {
          ...next,
          measured: {
            ...next.measured,
            intelligence: {
              ...intel,
              psychoacoustics: {
                ...priorPsycho,
                report,
                activationFormula: data.activationFormula || priorPsycho.activationFormula,
                socialUsage: data.socialUsage || priorPsycho.socialUsage,
                sonicIntent: data.sonicIntent || priorPsycho.sonicIntent,
                listenerEffects: data.listenerEffects || priorPsycho.listenerEffects,
              },
            },
            report: {
              ...asRecord(next.measured.report),
              layers: { ...layers, psychoacoustics: report },
            },
          },
        }
      }
    }

    next = appendBlackboardEvidence(next, {
      sectionId: String(type),
      claim: `${type} contributed wave ${waveId}`,
      evidenceFields: [
        'blackboard',
        ...(next.measured.bpm ? ['BPM'] : []),
        ...(next.measured.drumFamily ? ['Drums'] : []),
      ],
      confidence: result.confidence >= 0.7 ? 'green' : 'amber',
    })
  }

  next = { ...next, conflicts, updatedAt: new Date().toISOString() }
  next = markWaveComplete(next, waveId)

  // After DSP measure or classify-lock: lock genre engine + refresh encyclopedia slice for polymath peers
  if (
    waveId === 'measure-dsp' ||
    waveId === 'measure-pocket' ||
    waveId === 'classify-lock' ||
    waveId === 'measure-specialists'
  ) {
    next = lockGenreAndRefreshKb(next)
  }

  // After classify: soft-resolve primary vs audioPrimary conflicts (DSP wins on known mismatch patterns)
  if (waveId === 'classify-lock') {
    const resolved = resolveMeasuredGenreConflicts({ measured: next.measured })
    if (resolved.resolved > 0) {
      next = {
        ...next,
        measured: resolved.dna.measured,
        conflicts: [
          ...next.conflicts,
          ...resolved.notes.map((note) => ({
            field: 'genre.primary',
            a: next.measured.genre?.primary,
            b: resolved.dna.measured?.genre?.audioPrimary,
            note,
          })),
        ],
      }
    }
  }

  return next
}
