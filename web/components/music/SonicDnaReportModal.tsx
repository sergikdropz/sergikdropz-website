'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaBolt, FaQuestionCircle, FaRedo, FaSave, FaSearch, FaTimes } from 'react-icons/fa'
import type { Track } from '@/utils/musicLibraryApi'
import { fetchTracksByIds, updateTrack } from '@/utils/musicLibraryApi'
import { applySonicDnaAnalysisToTrack } from '@/lib/audio/track-display'
import DnaReadableCopy from '@/components/music/DnaReadableCopy'
import { AdminAssistantRichText } from '@/components/AdminChatMessageContent'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import {
  applySonicDnaSectionText,
  getSonicDnaReportView,
  listSonicDnaReportSections,
  localSonicDnaAccuracyWarnings,
  ensureSonicDnaReportSectionsFilled,
  type SonicDnaReportSectionId,
} from '@/lib/audio/sonic-dna-report-sections'
import { assessSonicDnaPipeline } from '@/lib/audio/sonic-dna-pipeline'
import { ensureMeasuredOnDna } from '@/lib/audio/normalize-agent-to-measured'
import { measuredGrooveFacts } from '@/lib/audio/sonic-dna-prose'
import { appendSonicDnaLookupParams } from '@/lib/audio/sonic-dna-query'
import {
  extractMeasured,
  sonicDnaCompletenessBreakdown,
  sonicDnaStatusLabel,
  parseSonicDna,
  type SonicDnaMeasured,
} from '@/lib/audio/sonic-dna-quality'
import { unwrapSonicDnaReviewReply } from '@/lib/audio/sonic-dna-review-format'
import {
  advanceAudioRerunPercent,
  estimateAudioRerunProgress,
  type AudioRerunPhase,
} from '@/lib/audio/audio-rerun-progress'
import { buildPublishChecklist } from '@/lib/audio/sonic-dna-v2/publish-checklist'
import { runAccuracyChallenge } from '@/lib/audio/sonic-dna-v2/accuracy-challenge'
import {
  buildAudioRerunRewriteMessage,
  collectSonicDnaAdminGuidance,
} from '@/lib/audio/sonic-dna-admin-guidance'

type ReviewMode = 'question' | 'challenge' | 'regenerate'
type SectionPatch = { sectionId: SonicDnaReportSectionId; text: string }
type ThreadEntry = {
  role: 'user' | 'assistant'
  content: string
  warnings?: string[]
  patchCount?: number
}

export type SonicDnaWaveformActions = {
  /** Align beat grid to waveform using DNA pocket priors. */
  onAlignGrid?: () => void
  onSetBeatHere?: () => void
  onSnapPlayhead?: (mode: 'kick' | 'beat' | 'phrase') => void
  onResetGrid?: () => void
  onApplyEqBias?: () => void
  /** Disable actions when BPM / waveform unavailable. */
  gridReady?: boolean
  hasWaveform?: boolean
}

/** Browser → player bridge when DNA report is opened outside MusicPlayer. */
export const SONIC_DNA_WAVEFORM_EVENT = 'sergik:sonic-dna-waveform'

export type SonicDnaWaveformEventDetail =
  | { action: 'align-grid' }
  | { action: 'set-beat-here' }
  | { action: 'snap'; mode: 'kick' | 'beat' | 'phrase' }
  | { action: 'reset-grid' }
  | { action: 'apply-eq' }

function dispatchWaveformBridge(detail: SonicDnaWaveformEventDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SONIC_DNA_WAVEFORM_EVENT, { detail }))
}

type Props = {
  track: Track
  dialogRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  onSaved?: (track: Track) => void
  onQueueAnalysis?: (
    track: Track,
    directive?: string,
  ) => Promise<{ jobId?: string | null; jobIds?: string[] } | void>
  /** Player-backed beat-grid / EQ actions (waveform right-click counterparts). */
  waveformActions?: SonicDnaWaveformActions | null
  /** Admin library tools (question/challenge/regenerate panel, section edit). Default: inferred from onQueueAnalysis/onSaved. */
  adminMode?: boolean
}

export default function SonicDnaReportModal({
  track,
  dialogRef,
  onClose,
  onSaved,
  onQueueAnalysis,
  waveformActions,
  adminMode,
}: Props) {
  const [dna, setDna] = useState<any>(track.sonic_dna || null)
  const [status, setStatus] = useState(track.sonic_dna_status || 'pending')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [editingId, setEditingId] = useState<SonicDnaReportSectionId | null>(null)
  const [mode, setMode] = useState<ReviewMode>('question')
  const [focusSection, setFocusSection] = useState<SonicDnaReportSectionId | 'all'>('all')
  const [prompt, setPrompt] = useState('')
  const [thread, setThread] = useState<ThreadEntry[]>([])
  const [pendingPatches, setPendingPatches] = useState<SectionPatch[]>([])
  const [allowMeasurementFix, setAllowMeasurementFix] = useState(false)
  const [polling, setPolling] = useState(false)
  const [audioRerunProgress, setAudioRerunProgress] = useState(0)
  const [audioRerunLabel, setAudioRerunLabel] = useState('Re-run audio')
  const [audioRerunPhase, setAudioRerunPhase] = useState<AudioRerunPhase>('idle')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dirtyRef = useRef(false)
  const autoPipelineRef = useRef(false)
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useLockBodyScroll(true)
  const showAdminTools = adminMode ?? Boolean(onQueueAnalysis || onSaved)
  const rerunStartedAtRef = useRef(0)
  const rerunPhaseRef = useRef<AudioRerunPhase>('idle')
  const sawProcessingRef = useRef(false)

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    rerunPhaseRef.current = audioRerunPhase
  }, [audioRerunPhase])

  // Keep left-panel DNA in sync when parent track updates (e.g. after job publish) unless local edits are dirty.
  useEffect(() => {
    if (dirtyRef.current) return
    const next = parseSonicDna(track.sonic_dna)
    if (!next) return
    setDna(ensureSonicDnaReportSectionsFilled(next))
    setStatus(track.sonic_dna_status || 'pending')
  }, [track.sonic_dna, track.sonic_dna_status])

  /**
   * After challenge / regenerate / section edits: normalize, fill encyclopedia, run deterministic
   * accuracy patches so left-panel warnings + checklist refresh from the same DNA the right panel wrote.
   */
  const refreshReportDna = useCallback((source: unknown, opts?: { challenge?: boolean }) => {
    if (!source) return null
    let next = ensureMeasuredOnDna(source)
    next = ensureSonicDnaReportSectionsFilled(next)
    if (opts?.challenge !== false) {
      const challenged = runAccuracyChallenge(next)
      next = {
        ...challenged.dna,
        pipelineV2: {
          ...(challenged.dna.pipelineV2 || {}),
          accuracyWarnings: challenged.warnings,
          challengePatches: challenged.patches,
          conflictsResolved: challenged.conflictsResolved,
          groundedSections: challenged.groundedSections,
          challengedAt: new Date().toISOString(),
        },
      }
      return { dna: next, challenge: challenged }
    }
    return { dna: next, challenge: null }
  }, [])

  const sections = useMemo(() => listSonicDnaReportSections(dna), [dna])
  const reportView = useMemo(() => getSonicDnaReportView(dna), [dna])
  const pipeline = useMemo(() => assessSonicDnaPipeline(dna), [dna])
  const warnings = useMemo(() => localSonicDnaAccuracyWarnings(dna), [dna])
  const completeness = useMemo(() => sonicDnaCompletenessBreakdown(status, dna), [status, dna])
  const percent = completeness.percent
  const statusLabel = sonicDnaStatusLabel(completeness.status)
  const measured = useMemo(() => extractMeasured(dna), [dna])
  const grooveFactRows = useMemo(() => measuredGrooveFacts(measured), [measured])
  const publishChecklist = useMemo(
    () => buildPublishChecklist(dna, { hasWaveform: Boolean((dna as any)?.pipelineV2 || (track as any)?.waveform) }),
    [dna, track],
  )
  const pipelineV2 = (dna as any)?.pipelineV2
  /** Button fill — job progress only (never DSP gate 33/45%). */
  const rerunFillPercent = audioRerunPhase === 'idle' ? 0 : audioRerunProgress

  const sectionTone: Record<SonicDnaReportSectionId, string> = {
    groove: 'border-gray-600/40 bg-slate-900/40',
    usage: 'border-orange-500/25 bg-orange-950/20',
    instrumentation: 'border-lime-500/25 bg-lime-950/20',
    description: 'border-blue-500/25 bg-blue-950/20',
    benefits: 'border-emerald-500/25 bg-emerald-950/20',
    intention: 'border-pink-500/25 bg-pink-950/20',
    dsp: 'border-cyan-500/25 bg-cyan-950/20',
    related: 'border-fuchsia-500/25 bg-fuchsia-950/20',
    history: 'border-amber-500/25 bg-amber-950/20',
    culture: 'border-teal-500/25 bg-teal-950/20',
    psychology: 'border-rose-500/25 bg-rose-950/20',
    psychoacoustics: 'border-indigo-500/25 bg-indigo-950/20',
    musicology: 'border-violet-500/25 bg-violet-950/20',
  }

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    setPolling(false)
  }, [])

  const applyRerunEstimate = useCallback((phase: AudioRerunPhase, statusHint?: string | null) => {
    const estimate = estimateAudioRerunProgress({
      phase,
      startedAtMs: rerunStartedAtRef.current || Date.now(),
      nowMs: Date.now(),
      status: statusHint,
    })
    setAudioRerunPhase(estimate.phase)
    setAudioRerunLabel(estimate.label)
    setAudioRerunProgress((prev) => advanceAudioRerunPercent(prev, estimate.percent))
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) {
      setLoading(true)
      setError(null)
    }
    try {
      const params = new URLSearchParams()
      appendSonicDnaLookupParams(params, {
        libraryTrackId: track.id,
        audioFileId: track.audioFileId,
        file: track.file,
        title: track.title,
      })
      const res = await fetch(`/api/audio/sonic-dna?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 404) throw new Error(data.error || 'Failed to load Sonic DNA')
      const nextDna = parseSonicDna(data.sonicDNA || track.sonic_dna)
      const filled = nextDna ? ensureSonicDnaReportSectionsFilled(nextDna) : null
      const nextStatus = typeof data.status === 'string' ? data.status : track.sonic_dna_status || 'pending'
      const nextPercent =
        typeof data.percent === 'number'
          ? data.percent
          : sonicDnaCompletenessBreakdown(nextStatus, filled).percent
      if (!dirtyRef.current && filled) {
        setDna(filled)
        setDirty(false)
      }
      setStatus(nextStatus)
      return { status: nextStatus, dna: filled, percent: nextPercent }
    } catch (err: any) {
      if (!opts?.quiet) setError(err?.message || 'Failed to load Sonic DNA')
      return null
    } finally {
      if (!opts?.quiet) setLoading(false)
    }
  }, [track])

  useEffect(() => {
    void load()
  }, [load])

  const applyLocalSection = (sectionId: SonicDnaReportSectionId, text: string) => {
    setDna((prev: unknown) => {
      const patched = applySonicDnaSectionText(prev, sectionId, text)
      return refreshReportDna(patched, { challenge: true })?.dna || patched
    })
    setDirty(true)
    setEditingId(null)
  }

  const applyPatches = useCallback(
    (patches: SectionPatch[], opts?: { auto?: boolean; forceWholeReport?: boolean; runChallenge?: boolean }) => {
      const usable =
        allowMeasurementFix ? patches : patches.filter((patch) => patch.sectionId !== 'groove')
      const whole = opts?.forceWholeReport || focusSection === 'all' || mode === 'challenge'
      const scoped =
        whole
          ? usable
          : usable.filter((patch) => patch.sectionId === focusSection).length
            ? usable.filter((patch) => patch.sectionId === focusSection)
            : usable

      if (!scoped.length) {
        setPendingPatches([])
        if (patches.some((patch) => patch.sectionId === 'groove') && !allowMeasurementFix) {
          setNotice('Groove patches were dropped because measurement is locked. Enable “Measurement is wrong” to apply BPM/drums/key.')
        } else {
          setNotice('No usable section patches returned.')
        }
        return { count: 0, dna: null as unknown }
      }

      let nextDna: unknown = null
      setDna((prev: unknown) => {
        const patched = scoped.reduce(
          (acc, patch) => applySonicDnaSectionText(acc, patch.sectionId, patch.text),
          prev || {},
        )
        nextDna = refreshReportDna(patched, { challenge: opts?.runChallenge !== false })?.dna || patched
        return nextDna
      })
      setDirty(true)
      setPendingPatches([])
      setEditingId(null)
      const names = scoped.map((patch) => patch.sectionId).join(', ')
      setNotice(
        opts?.auto
          ? `Updated ${scoped.length} section${scoped.length === 1 ? '' : 's'} (${names}). Save to persist.`
          : `Applied ${scoped.length} section update${scoped.length === 1 ? '' : 's'} (${names}). Save to persist.`,
      )
      return { count: scoped.length, dna: nextDna }
    },
    [allowMeasurementFix, focusSection, mode, refreshReportDna],
  )

  const persistDna = useCallback(
    async (nextDna: unknown, opts?: { notice?: string }) => {
      if (!nextDna) return null
      setSaving(true)
      setError(null)
      try {
        const measuredNow = extractMeasured(nextDna)
        const updates: Record<string, unknown> = {
          sonic_dna: nextDna,
          sonic_dna_status: 'completed',
        }
        if (measuredNow?.bpm != null && Number.isFinite(Number(measuredNow.bpm))) {
          updates.bpm = Math.round(Number(measuredNow.bpm))
        }
        if (measuredNow?.key) updates.key_signature = measuredNow.key
        if (measuredNow?.genre?.primary) updates.genre = measuredNow.genre.primary
        if (measuredNow?.genre?.subgenre) updates.subgenre = measuredNow.genre.subgenre

        const saved = await updateTrack(track.id, updates)
        setDna(nextDna)
        setDirty(false)
        dirtyRef.current = false
        setNotice(opts?.notice || 'Saved Sonic DNA report')
        let published = applySonicDnaAnalysisToTrack(
          { ...track, ...(saved || {}) },
          {
            sonicDna: nextDna,
            status: 'completed',
            metadata: (saved as Track | null)?.metadata ?? track.metadata,
          },
        )
        try {
          const fresh = (await fetchTracksByIds([track.id]))[0]
          if (fresh) {
            published = applySonicDnaAnalysisToTrack(fresh, {
              sonicDna: nextDna || fresh.sonic_dna,
              status: fresh.sonic_dna_status || 'completed',
              metadata: fresh.metadata,
            })
          }
        } catch {
          /* keep local publish */
        }
        try {
          onSaved?.(published)
        } catch (callbackErr) {
          console.error('[SonicDnaReportModal] onSaved failed after persist', callbackErr)
        }
        return nextDna
      } catch (err: any) {
        setError(err?.message || 'Failed to save')
        return null
      } finally {
        setSaving(false)
      }
    },
    [onSaved, track],
  )

  const save = async () => {
    await persistDna(dna)
  }

  const rewriteWholeReport = useCallback(
    async (
      sourceDna: unknown,
      opts?: {
        autoSave?: boolean
        quietUserLine?: boolean
        manageBusy?: boolean
        adminGuidance?: string
        allowMeasurementFix?: boolean
      },
    ) => {
      if (!sourceDna) return { ok: false, dna: null as unknown }
      // Agent runs often omit `measured` — normalize so BPM + drum grid unlock rewrite.
      const workingDna = ensureMeasuredOnDna(sourceDna)
      const gate = assessSonicDnaPipeline(workingDna)
      // Regenerate needs BPM + drum family. audioPrimary is classify-lock, not a rewrite blocker.
      if (!gate.hasGrooveCore) {
        const why = gate.blockers.length ? gate.blockers.join(' ') : gate.instruction
        setNotice(`Audio updated, but encyclopedia rewrite is still gated — ${why}`)
        setDna(workingDna)
        return { ok: false, dna: workingDna }
      }
      setDna(workingDna)

      const guidance = opts?.adminGuidance?.trim() || ''
      const unlockMeasurement = opts?.allowMeasurementFix === true
      const rewriteMessage = buildAudioRerunRewriteMessage(guidance)

      const manageBusy = opts?.manageBusy !== false
      if (manageBusy) setBusy(true)
      setError(null)
      if (!opts?.quietUserLine) {
        setThread((prev) => [
          ...prev,
          {
            role: 'user',
            content: guidance
              ? `Rewrite whole report from measured groove using admin guidance:\n${guidance}`
              : 'Rewrite whole report and all sections from measured groove.',
          },
        ])
      }
      try {
        const res = await fetch('/api/audio/sonic-dna-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackId: track.audioFileId || track.id,
            libraryTrackId: track.id,
            mode: 'regenerate',
            message: rewriteMessage,
            sonicDna: workingDna,
            lockMeasured: true,
            allowMeasurementFix: unlockMeasurement,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.details || data.error || 'Whole-report rewrite failed')
        const unwrapped = unwrapSonicDnaReviewReply(String(data.answer || data.raw || ''))
        const answer = unwrapped.answer || String(data.answer || 'No reply')
        const replyWarnings = [
          ...(Array.isArray(data.warnings) ? data.warnings.filter((w: unknown) => typeof w === 'string') : []),
          ...unwrapped.warnings,
        ].filter((item, index, all) => all.indexOf(item) === index)
        const patches = Array.isArray(data.patches) && data.patches.length
          ? (data.patches as SectionPatch[])
          : unwrapped.patches
        setThread((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: answer,
            warnings: replyWarnings,
            patchCount: patches.length,
          },
        ])

        if (!patches.length) {
          // Deterministic fill when AI returns no patches but groove core is ready.
          const refreshed = refreshReportDna(workingDna, { challenge: true })
          const filled = refreshed?.dna || ensureSonicDnaReportSectionsFilled(workingDna)
          setDna(filled)
          if (opts?.autoSave) {
            await persistDna(filled, { notice: 'Saved measured Sonic DNA with composed sections (no AI patches).' })
          } else {
            setNotice('No AI section rewrites — composed encyclopedia from measured groove. Save to persist.')
          }
          return { ok: true, dna: filled }
        }

        const applied = applyPatches(patches, { auto: true, forceWholeReport: true })
        const nextDna = applied.dna || workingDna
        if (opts?.autoSave && applied.count > 0) {
          await persistDna(nextDna, {
            notice: guidance
              ? `Audio complete — rewrote and saved ${applied.count} section${applied.count === 1 ? '' : 's'} using chat/challenge guidance.`
              : `Audio complete — rewrote and saved ${applied.count} section${applied.count === 1 ? '' : 's'}.`,
          })
        } else if (applied.count > 0) {
          setNotice(
            guidance
              ? `Rewrote ${applied.count} sections from fresh audio + admin guidance. Save to persist.`
              : `Rewrote ${applied.count} sections from fresh audio. Save to persist.`,
          )
        }
        return { ok: applied.count > 0, dna: nextDna }
      } catch (err: any) {
        setError(err?.message || 'Whole-report rewrite failed')
        if (opts?.autoSave) {
          const filled = ensureSonicDnaReportSectionsFilled(workingDna)
          await persistDna(filled, { notice: 'Saved measured Sonic DNA with composed sections; AI rewrite failed — retry Rewrite report.' })
        }
        return { ok: false, dna: workingDna }
      } finally {
        if (manageBusy) setBusy(false)
      }
    },
    [applyPatches, persistDna, refreshReportDna, track.audioFileId, track.id],
  )

  const submitReview = async () => {
    if (!dna) {
      setError('Run Sonic DNA analysis first')
      return
    }
    const text = prompt.trim()
    if (mode === 'question' && !text) return
    // Whole-report regenerate is allowed with focus "all" and empty notes.
    if (mode === 'regenerate' && focusSection === 'all' && !text) {
      setPrompt('')
      await rewriteWholeReport(dna, {
        autoSave: false,
        adminGuidance: collectSonicDnaAdminGuidance('', thread),
        allowMeasurementFix,
      })
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    const guidance =
      mode === 'regenerate' || mode === 'challenge'
        ? collectSonicDnaAdminGuidance(text, thread)
        : text
    const userLine =
      mode === 'challenge' && !text
        ? pipeline.canRunAccuracyChallenge
          ? 'Challenge this report for accuracy against the measured groove.'
          : 'Accuracy Challenge — check pipeline gate (DSP required first).'
        : mode === 'regenerate' && !text
          ? `Rewrite “${focusSection}” against the measured groove.`
          : text
    setThread((prev) => [...prev, { role: 'user', content: userLine }])
    setPrompt('')
    try {
      const res = await fetch('/api/audio/sonic-dna-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackId: track.audioFileId || track.id,
          libraryTrackId: track.id,
          mode,
          message:
            mode === 'regenerate'
              ? focusSection === 'all'
                ? buildAudioRerunRewriteMessage(guidance)
                : guidance || text
              : text,
          sectionId: focusSection === 'all' ? undefined : focusSection,
          sonicDna: dna,
          lockMeasured: true,
          allowMeasurementFix,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.details || data.error || 'Review failed')
      const unwrapped = unwrapSonicDnaReviewReply(String(data.answer || data.raw || ''))
      const answer = unwrapped.answer || String(data.answer || 'No reply')
      const replyWarnings = [
        ...(Array.isArray(data.warnings) ? data.warnings.filter((w: unknown) => typeof w === 'string') : []),
        ...unwrapped.warnings,
      ].filter((item, index, all) => all.indexOf(item) === index)
      const patches = Array.isArray(data.patches) && data.patches.length
        ? (data.patches as SectionPatch[])
        : unwrapped.patches
      setThread((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: answer,
          warnings: replyWarnings,
          patchCount: patches.length,
        },
      ])
      if (data.nextAction === 'run_audio') {
        setNotice('Pipeline gate: re-run audio analysis before Accuracy Challenge or encyclopedia regenerate.')
      }
      if (patches.length) {
        if (mode === 'regenerate' || mode === 'challenge') {
          applyPatches(patches, { auto: true, forceWholeReport: focusSection === 'all' || mode === 'challenge' })
        } else {
          setPendingPatches(patches)
        }
      } else if (mode === 'challenge') {
        // LLM returned no patches — still run deterministic accuracy sync so left panel updates.
        const refreshed = refreshReportDna(dna, { challenge: true })
        if (refreshed?.dna) {
          setDna(refreshed.dna)
          setDirty(true)
          const n = refreshed.challenge?.patches.length || 0
          setNotice(
            n > 0
              ? `Accuracy challenge applied ${n} local fix${n === 1 ? '' : 'es'} (crate leak / groundedness / bass). Save to persist.`
              : 'Accuracy challenge found no section patches; warnings refreshed against measured groove.',
          )
        }
      } else if (mode === 'regenerate' && data.nextAction !== 'run_audio') {
        const refreshed = refreshReportDna(dna, { challenge: true })
        if (refreshed?.dna) {
          setDna(refreshed.dna)
          setDirty(true)
          setNotice('No AI section rewrites — refreshed encyclopedia + accuracy from measured groove. Save to persist.')
        } else {
          setNotice('No section rewrites returned. Try more specific notes or a different focus section.')
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Review failed')
    } finally {
      setBusy(false)
    }
  }

  const queueRegen = async () => {
    if (!onQueueAnalysis) return
    const guidance = collectSonicDnaAdminGuidance(prompt, thread)
    const ok =
      typeof window === 'undefined' ||
      window.confirm(
        guidance
          ? `Re-run audio Sonic DNA for “${track.title}” using your chat/challenge notes?`
          : `Re-run audio Sonic DNA for “${track.title}”?`,
      )
    if (!ok) return
    setBusy(true)
    setError(null)
    autoPipelineRef.current = false
    sawProcessingRef.current = false
    rerunStartedAtRef.current = Date.now()
    setAudioRerunProgress(2)
    setAudioRerunPhase('queued')
    setAudioRerunLabel('Queued')
    if (guidance) {
      setThread((prev) => [
        ...prev,
        {
          role: 'user',
          content: `Re-run audio with admin guidance:\n${guidance}`,
        },
      ])
      setPrompt('')
    }
    try {
      const queued = await onQueueAnalysis(track, guidance || undefined)
      const jobId =
        (queued && typeof queued === 'object' && (queued.jobId || queued.jobIds?.[0])) || null
      setStatus('processing')
      setAudioRerunPhase('analyzing')
      setAudioRerunLabel('Pipeline running')
      setAudioRerunProgress(8)
      setNotice(
        jobId
          ? guidance
            ? 'Sonic DNA v2 job running with your challenge/chat notes — live stage progress on the button.'
            : 'Sonic DNA v2 job running — live stage progress on the button.'
          : guidance
            ? 'Audio analysis queued with your notes — watching DNA status…'
            : 'Audio analysis queued — watching DNA status…',
      )
      stopPolling()
      setPolling(true)

      let ticks = 0
      pollRef.current = setInterval(() => {
        ticks += 1
        void (async () => {
          if (jobId) {
            try {
              const res = await fetch(`/api/admin/ai/jobs?id=${encodeURIComponent(String(jobId))}`, {
                cache: 'no-store',
              })
              const data = await res.json().catch(() => ({}))
              const job = data.job
              if (job?.progress) {
                const pct = Number(job.progress.percent) || 0
                const label = String(job.progress.label || job.progress.stage || 'Running')
                setAudioRerunProgress((prev) => Math.max(prev, pct))
                setAudioRerunLabel(label)
                if (job.status === 'failed') {
                  stopPolling()
                  setError(job.lastError || 'Sonic DNA job failed')
                  setNotice(null)
                  setAudioRerunPhase('idle')
                  setAudioRerunProgress(0)
                  setAudioRerunLabel('Re-run audio')
                  return
                }
                if (job.status === 'running' || job.status === 'queued') {
                  sawProcessingRef.current = true
                  return
                }
                if (job.status === 'completed') {
                  sawProcessingRef.current = true
                }
              }
            } catch {
              // fall through to DNA poll
            }
          }

          const result = await load({ quiet: true })
          if (!result) return
          if (result.status === 'processing') sawProcessingRef.current = true
          const grooveReady = assessSonicDnaPipeline(ensureMeasuredOnDna(result.dna)).hasGrooveCore
          if (
            !sawProcessingRef.current &&
            ticks >= 2 &&
            (result.status === 'completed' || result.status === 'partial') &&
            grooveReady
          ) {
            sawProcessingRef.current = true
          }

          const analysisFinished =
            sawProcessingRef.current &&
            result.status !== 'processing' &&
            (result.status === 'completed' || (result.status === 'partial' && grooveReady))

          if (!analysisFinished) {
            if (ticks === 40) {
              setNotice('Still running (agents can take several minutes). Progress continues…')
              setAudioRerunLabel('Still working…')
            }
            if (ticks >= 120) {
              stopPolling()
              setNotice('Timed out waiting for job. Hit Reload, then Rewrite report if DSP is ready.')
            }
            return
          }
          if (autoPipelineRef.current) return
          autoPipelineRef.current = true
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
          setPolling(false)
          setBusy(true)
          dirtyRef.current = false
          setDirty(false)
          setDna(result.dna)
          setStatus(result.status)
          setFocusSection('all')
          if (result.dna) {
            try {
              onSaved?.(
                applySonicDnaAnalysisToTrack(track, {
                  sonicDna: result.dna,
                  status: result.status,
                }),
              )
            } catch (callbackErr) {
              console.error('[SonicDnaReportModal] onSaved failed after analysis', callbackErr)
            }
          }

          try {
            setAudioRerunPhase('saving')
            setAudioRerunProgress(92)
            setAudioRerunLabel('Saving measured DNA')
            setNotice('Audio analysis finished — saving measured DNA…')
            const normalized = ensureMeasuredOnDna(result.dna)
            await persistDna(normalized, { notice: 'Measured Sonic DNA saved — rewriting all sections…' })

            setAudioRerunPhase('rewriting')
            setAudioRerunProgress(96)
            setAudioRerunLabel('Rewriting sections')
            await rewriteWholeReport(normalized, {
              autoSave: true,
              quietUserLine: false,
              manageBusy: false,
              adminGuidance: guidance,
              allowMeasurementFix,
            })

            setAudioRerunPhase('done')
            setAudioRerunProgress(100)
            setAudioRerunLabel('Complete')
            window.setTimeout(() => {
              setAudioRerunPhase('idle')
              setAudioRerunProgress(0)
              setAudioRerunLabel('Re-run audio')
            }, 1800)
          } finally {
            setBusy(false)
          }
        })()
      }, 1500)
    } catch (err: any) {
      setError(err?.message || 'Failed to queue analysis')
      stopPolling()
      setAudioRerunPhase('idle')
      setAudioRerunProgress(0)
      setAudioRerunLabel('Re-run audio')
    } finally {
      setBusy(false)
    }
  }

  if (!portalReady) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef as React.Ref<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sonic-dna-report-title"
        data-allow-scroll-when-locked=""
        className="flex max-h-[min(90vh,calc(100dvh-1.5rem))] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
          <div className="min-w-0">
            <h2 id="sonic-dna-report-title" className="truncate text-lg font-semibold text-white">
              Sonic DNA report
            </h2>
            <p className="truncate text-sm text-gray-400">
              {track.artist} — {track.title} · DSP {statusLabel} · {percent}%
              {audioRerunPhase !== 'idle' ? ` · job ${audioRerunLabel} ${Math.round(rerunFillPercent)}%` : ''}
              {dirty ? ' · unsaved' : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
              disabled={loading || busy}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
              aria-label="Close report"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        <div
          className={`grid min-h-0 flex-1 gap-0 ${
            showAdminTools ? 'md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]' : ''
          }`}
        >
          <div
            className={`min-h-0 overflow-y-auto p-4 ${
              showAdminTools ? 'border-b border-gray-800 md:border-b-0 md:border-r' : ''
            }`}
          >
            {loading && <p className="text-sm text-gray-400">Loading report…</p>}
            {!loading && !dna && (
              <p className="text-sm text-gray-400">No report yet. Run Sonic DNA analysis first.</p>
            )}
            {!loading && warnings.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
                {warnings.map((warning) => (
                  <p key={warning}>• {warning}</p>
                ))}
              </div>
            )}
            {!loading && dna && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">DSP completeness</p>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className={`h-full ${percent >= 100 ? 'bg-emerald-500' : percent >= 60 ? 'bg-amber-400' : 'bg-gray-500'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {completeness.gates.map((gate) => (
                    <span
                      key={gate.id}
                      className={`rounded-md border px-2 py-0.5 text-[11px] ${
                        gate.ok
                          ? 'border-emerald-800 bg-emerald-950/50 text-emerald-200'
                          : 'border-gray-700 bg-gray-900 text-gray-500'
                      }`}
                    >
                      {gate.label} {gate.ok ? 'ready' : 'missing'}
                      {gate.weight > 0 ? ` · ${gate.weight}%` : ''}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-sky-800/50 bg-sky-950/30 p-3">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-sky-300/80">Accuracy pipeline</p>
                <div className="mb-2 flex flex-wrap gap-1">
                  {pipeline.stages.map((stage) => (
                    <span
                      key={stage.id}
                      className={`rounded-md border px-2 py-0.5 text-[10px] ${
                        stage.current
                          ? 'border-sky-500 bg-sky-900/60 text-sky-100'
                          : stage.done
                            ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-200/80'
                            : 'border-gray-700 bg-gray-900/80 text-gray-500'
                      }`}
                    >
                      {stage.label}
                    </span>
                  ))}
                </div>
                <p className="text-xs leading-relaxed text-sky-100/90">{pipeline.instruction}</p>
                {!pipeline.canRunAccuracyChallenge && onQueueAnalysis ? (
                  <button
                    type="button"
                    disabled={busy || polling || audioRerunPhase !== 'idle'}
                    onClick={() => void queueRegen()}
                    className="relative mt-2 inline-flex overflow-hidden items-center gap-1.5 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-900/50 disabled:opacity-50"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-emerald-500/80 transition-[width] duration-500 ease-out"
                      style={{ width: `${Math.min(100, Math.max(0, rerunFillPercent))}%` }}
                    />
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      <FaBolt />
                      {audioRerunPhase !== 'idle'
                        ? `${audioRerunLabel} ${Math.round(rerunFillPercent)}%`
                        : 'Re-run audio (required next)'}
                    </span>
                  </button>
                ) : null}
              </div>

              {(reportView.groovePrimary || reportView.bpm || reportView.key) && (
                <div className="rounded-lg border border-purple-500/25 bg-gradient-to-br from-purple-900/30 to-indigo-900/20 p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-purple-300">Groove class</p>
                  <p className="text-base font-semibold text-purple-50">
                    {reportView.groovePrimary || 'Unclassified'}
                    {reportView.grooveSub ? ` / ${reportView.grooveSub}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reportView.bpm ? (
                      <span className="rounded-md border border-purple-700/40 bg-purple-900/40 px-2 py-0.5 text-[11px] text-purple-100">
                        {Math.round(Number(reportView.bpm))} BPM
                      </span>
                    ) : null}
                    {reportView.timingFeel ? (
                      <span className="rounded-md border border-purple-700/40 bg-purple-900/40 px-2 py-0.5 text-[11px] text-purple-100">
                        {reportView.timingFeel}
                      </span>
                    ) : null}
                    {reportView.key && reportView.key !== 'Unknown' ? (
                      <span className="rounded-md border border-indigo-700/40 bg-indigo-900/40 px-2 py-0.5 text-[11px] text-indigo-100">
                        {reportView.key}
                      </span>
                    ) : null}
                    {reportView.camelot ? (
                      <span className="rounded-md border border-indigo-700/40 bg-indigo-900/40 px-2 py-0.5 text-[11px] text-indigo-100">
                        Camelot {reportView.camelot}
                      </span>
                    ) : null}
                  </div>
                </div>
              )}

              <DrumStepGrid measured={measured} />
              <DrumPhraseGrid measured={measured} />

              <div className="rounded-lg border border-cyan-800/40 bg-cyan-950/20 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-300">
                  Waveform · DNA pocket
                </p>
                <p className="mb-2 text-[11px] text-cyan-100/70">
                  Same actions as the waveform right-click menu — 16 steps/bar × 8-bar phrase.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={waveformActions ? !waveformActions.gridReady || !waveformActions.hasWaveform : false}
                    onClick={() => {
                      if (waveformActions?.onAlignGrid) waveformActions.onAlignGrid()
                      else dispatchWaveformBridge({ action: 'align-grid' })
                    }}
                    className="rounded-md border border-cyan-700/50 bg-cyan-900/40 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-800/50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Align to waveform
                  </button>
                  <button
                    type="button"
                    disabled={waveformActions ? !waveformActions.gridReady : false}
                    onClick={() => {
                      if (waveformActions?.onSetBeatHere) waveformActions.onSetBeatHere()
                      else dispatchWaveformBridge({ action: 'set-beat-here' })
                    }}
                    className="rounded-md border border-cyan-700/50 bg-cyan-900/40 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-800/50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Set beat here
                  </button>
                  <button
                    type="button"
                    disabled={waveformActions ? !waveformActions.gridReady : false}
                    onClick={() => {
                      if (waveformActions?.onSnapPlayhead) waveformActions.onSnapPlayhead('kick')
                      else dispatchWaveformBridge({ action: 'snap', mode: 'kick' })
                    }}
                    className="rounded-md border border-emerald-700/50 bg-emerald-900/30 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-800/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Snap to kick
                  </button>
                  <button
                    type="button"
                    disabled={waveformActions ? !waveformActions.gridReady : false}
                    onClick={() => {
                      if (waveformActions?.onSnapPlayhead) waveformActions.onSnapPlayhead('beat')
                      else dispatchWaveformBridge({ action: 'snap', mode: 'beat' })
                    }}
                    className="rounded-md border border-amber-700/50 bg-amber-900/30 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-800/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Snap to beat
                  </button>
                  <button
                    type="button"
                    disabled={waveformActions ? !waveformActions.gridReady : false}
                    onClick={() => {
                      if (waveformActions?.onSnapPlayhead) waveformActions.onSnapPlayhead('phrase')
                      else dispatchWaveformBridge({ action: 'snap', mode: 'phrase' })
                    }}
                    className="rounded-md border border-violet-700/50 bg-violet-900/30 px-2 py-1 text-[11px] text-violet-100 hover:bg-violet-800/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Snap to phrase
                  </button>
                  <button
                    type="button"
                    disabled={waveformActions ? !waveformActions.gridReady : false}
                    onClick={() => {
                      if (waveformActions?.onResetGrid) waveformActions.onResetGrid()
                      else dispatchWaveformBridge({ action: 'reset-grid' })
                    }}
                    className="rounded-md border border-gray-600 bg-gray-900/50 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Reset beat grid
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (waveformActions?.onApplyEqBias) waveformActions.onApplyEqBias()
                      else dispatchWaveformBridge({ action: 'apply-eq' })
                    }}
                    className="rounded-md border border-orange-700/50 bg-orange-900/30 px-2 py-1 text-[11px] text-orange-100 hover:bg-orange-800/40"
                  >
                    Apply DNA EQ pocket
                  </button>
                </div>
              </div>

              {grooveFactRows.length > 0 && (
                <div className="rounded-lg border border-gray-600/30 bg-slate-900/40 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Measured facts</p>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 text-sm text-gray-200">
                    {grooveFactRows.map((row) => (
                      <div key={row.label}>
                        <dt className="text-[10px] uppercase tracking-wide text-gray-500">{row.label}</dt>
                        <dd className="leading-relaxed">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {pipelineV2?.insights && (
                <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                    Creative insights
                  </p>
                  <p className="text-sm text-emerald-50">
                    Floor: {pipelineV2.insights.floor?.label || 'unknown'}
                    {pipelineV2.insights.floor?.reason ? ` — ${pipelineV2.insights.floor.reason}` : ''}
                  </p>
                  {pipelineV2.insights.mixNotes ? (
                    <p className="mt-1 text-xs text-emerald-200/80">{pipelineV2.insights.mixNotes}</p>
                  ) : null}
                  {pipelineV2.lastDiff?.narrative ? (
                    <p className="mt-2 text-[11px] text-gray-400">Diff: {pipelineV2.lastDiff.narrative}</p>
                  ) : null}
                </div>
              )}

              <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Publish checklist {publishChecklist.ready ? '· ready' : ''}
                </p>
                <ul className="space-y-1">
                  {publishChecklist.items.map((item) => (
                    <li
                      key={item.id}
                      className={`text-xs ${item.ok ? 'text-emerald-300' : 'text-gray-500'}`}
                    >
                      {item.ok ? '✓' : '○'} {item.label}
                    </li>
                  ))}
                </ul>
                {pipelineV2?.evidence?.claims?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {pipelineV2.evidence.claims.slice(0, 8).map((claim: any) => (
                      <span
                        key={claim.sectionId}
                        className={`rounded border px-1.5 py-0.5 text-[10px] ${
                          claim.confidence === 'green'
                            ? 'border-emerald-700 text-emerald-300'
                            : claim.confidence === 'amber'
                              ? 'border-amber-700 text-amber-300'
                              : 'border-red-800 text-red-300'
                        }`}
                        title={claim.claim}
                      >
                        {claim.sectionId}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {sections.map((section) => (
                <section
                  key={section.id}
                  className={`rounded-lg border p-3 ${
                    showAdminTools && focusSection === section.id
                      ? 'border-purple-600/70 bg-purple-950/20'
                      : sectionTone[section.id] || 'border-gray-800 bg-gray-900/50'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                    {showAdminTools ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-xs text-gray-400 hover:text-gray-200"
                          onClick={() => setFocusSection(section.id)}
                        >
                          Focus
                        </button>
                        <button
                          type="button"
                          className="text-xs text-purple-300 hover:text-purple-200"
                          onClick={() => {
                            setEditingId((id) => (id === section.id ? null : section.id))
                            setFocusSection(section.id)
                          }}
                        >
                          {editingId === section.id ? 'Done' : 'Edit'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <p className="mb-2 text-[11px] text-gray-500">{section.hint}</p>
                  {editingId === section.id ? (
                    <textarea
                      key={`${section.id}-${section.text.slice(0, 24)}`}
                      defaultValue={section.text}
                      rows={section.id === 'description' || section.id === 'benefits' ? 10 : 6}
                      className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-purple-500"
                      onBlur={(e) => applyLocalSection(section.id, e.target.value)}
                    />
                  ) : (
                    <DnaReadableCopy text={section.text || '—'} className="text-sm text-gray-200" />
                  )}
                </section>
              ))}
            </div>
            )}
          </div>

          {showAdminTools ? (
          <div className="flex min-h-0 flex-col p-4">
            <div className="mb-3 flex flex-wrap gap-1">
              {(['question', 'challenge', 'regenerate'] as ReviewMode[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className={`rounded-full px-3 py-1 text-xs capitalize ${
                    mode === item ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {item === 'question' ? 'Question' : item === 'challenge' ? 'Accuracy challenge' : 'Regenerate'}
                </button>
              ))}
            </div>
            <label className="mb-2 flex items-start gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={allowMeasurementFix}
                onChange={(e) => setAllowMeasurementFix(e.target.checked)}
              />
              <span>Measurement is wrong — allow challenge/regenerate to rewrite BPM, drums, and key.</span>
            </label>
            <label className="mb-2 block text-[11px] uppercase tracking-wide text-gray-500">
              Focus section
              <select
                value={focusSection}
                onChange={(e) => setFocusSection(e.target.value as SonicDnaReportSectionId | 'all')}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-200"
              >
                <option value="all">Whole report</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="mb-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-800 bg-black/30 p-2">
              {thread.length === 0 && (
                <p className="text-xs leading-relaxed text-gray-500">
                  Sequential pipeline: measure audio → blend preference → fill encyclopedia → Accuracy Challenge →
                  save. Re-run audio uses your chat + Accuracy Challenge notes as an Admin Override for analysis and
                  the automatic whole-report rewrite. Focus “Whole report” + Rewrite report also honors that thread.
                </p>
              )}
              <div className="space-y-3">
                {thread.map((entry, index) =>
                  entry.role === 'user' ? (
                    <div key={`user-${index}`} className="flex justify-end">
                      <div className="max-w-[92%] rounded-2xl rounded-br-md bg-gray-800 px-3 py-2 text-[13px] leading-relaxed text-gray-100">
                        {entry.content}
                      </div>
                    </div>
                  ) : (
                    <div key={`assistant-${index}`} className="space-y-2">
                      <div className="rounded-xl border border-purple-900/50 bg-purple-950/30 px-3 py-2.5">
                        <AdminAssistantRichText content={entry.content} compact />
                      </div>
                      {entry.warnings && entry.warnings.length > 0 && (
                        <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
                          <p className="mb-1 font-semibold uppercase tracking-wide text-amber-200/80">Warnings</p>
                          <ul className="list-disc space-y-1 pl-4">
                            {entry.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {entry.patchCount ? (
                        <p className="text-[11px] text-emerald-300/90">
                          {entry.patchCount} section rewrite{entry.patchCount === 1 ? '' : 's'} ready
                        </p>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            </div>
            {pendingPatches.length > 0 && (
              <button
                type="button"
                onClick={() => applyPatches(pendingPatches)}
                className="mb-2 rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-2 text-left text-xs text-amber-100 hover:bg-amber-900/40"
              >
                Apply {pendingPatches.length} proposed rewrite{pendingPatches.length === 1 ? '' : 's'}
              </button>
            )}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={
                mode === 'question'
                  ? 'Why is this Funky House and not reggae?'
                  : mode === 'challenge'
                    ? 'Optional: what feels wrong? Leave blank to run a full accuracy pass.'
                    : focusSection === 'all'
                      ? 'Optional notes for a whole-report rewrite (leave blank to rewrite every section).'
                      : `Rewrite “${sections.find((s) => s.id === focusSection)?.title || focusSection}” — or leave blank for an accuracy rewrite.`
              }
              className="mb-2 w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-purple-500"
            />
            {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
            {notice && <p className="mb-2 text-xs text-amber-300">{notice}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !dna}
                onClick={() => void submitReview()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {mode === 'question' ? <FaQuestionCircle /> : mode === 'challenge' ? <FaSearch /> : <FaRedo />}
                {busy ? 'Working…' : mode === 'question' ? 'Ask' : mode === 'challenge' ? (pipeline.canRunAccuracyChallenge ? 'Challenge' : 'Check gate') : focusSection === 'all' ? 'Rewrite report' : 'Rewrite section'}
              </button>
              {onQueueAnalysis && (
                <button
                  type="button"
                  disabled={busy || polling || audioRerunPhase !== 'idle'}
                  onClick={() => void queueRegen()}
                  className="relative inline-flex overflow-hidden items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-100 hover:bg-gray-800 disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-emerald-600/85 transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.min(100, Math.max(0, rerunFillPercent))}%` }}
                  />
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <FaBolt className={rerunFillPercent > 0 ? 'text-emerald-100' : 'text-amber-400'} />
                    {audioRerunPhase !== 'idle'
                      ? `${audioRerunLabel} ${Math.round(rerunFillPercent)}%`
                      : 'Re-run audio'}
                  </span>
                </button>
              )}
              <button
                type="button"
                disabled={saving || !dirty || !dna}
                onClick={() => void save()}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                <FaSave />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  )
}

function DrumStepGrid({ measured }: { measured: SonicDnaMeasured | null }) {
  if (!measured) return null
  const rows = [
    { label: 'K', title: 'Kick', steps: Array.isArray(measured.kickSteps) ? measured.kickSteps : [] },
    { label: 'S', title: 'Snare', steps: Array.isArray(measured.snareSteps) ? measured.snareSteps : [] },
    { label: 'H', title: 'Hat', steps: Array.isArray(measured.hatSteps) ? measured.hatSteps : [] },
  ]
  if (!rows.some((row) => row.steps.length)) return null
  return (
    <div className="rounded-lg border border-gray-800 bg-black/30 p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">16-step drum grid</p>
      <div className="space-y-1">
        {rows.map((row) => {
          const active = new Set(row.steps)
          return (
            <div key={row.label} className="flex items-center gap-2">
              <span className="w-4 text-[11px] font-semibold text-gray-400" title={row.title}>
                {row.label}
              </span>
              <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
                {Array.from({ length: 16 }, (_, step) => (
                  <span
                    key={step}
                    title={`${row.title} ${step + 1}`}
                    className={`h-4 rounded-[2px] ${
                      active.has(step)
                        ? row.label === 'K'
                          ? 'bg-emerald-400'
                          : row.label === 'S'
                            ? 'bg-amber-400'
                            : 'bg-sky-400'
                        : step % 4 === 0
                          ? 'bg-gray-800'
                          : 'bg-gray-900'
                    }`}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 8-bar phrase strip (16 steps/bar × 8) — same pocket model as DSP align. */
function DrumPhraseGrid({ measured }: { measured: SonicDnaMeasured | null }) {
  if (!measured) return null
  const stepsPerBar = measured.stepsPerBar && measured.stepsPerBar > 0 ? measured.stepsPerBar : 16
  const phraseBars = measured.phraseBars && measured.phraseBars > 0 ? measured.phraseBars : 8
  const expand = (barSteps: number[] | undefined, phraseSteps: number[] | undefined) => {
    if (Array.isArray(phraseSteps) && phraseSteps.length) return phraseSteps
    if (!Array.isArray(barSteps) || !barSteps.length) return []
    const out: number[] = []
    for (let b = 0; b < phraseBars; b++) {
      for (const s of barSteps) out.push(b * stepsPerBar + (((s % stepsPerBar) + stepsPerBar) % stepsPerBar))
    }
    return out
  }
  const rows = [
    {
      label: 'K',
      title: 'Kick',
      steps: expand(measured.kickSteps, measured.kickPhraseSteps),
      on: 'bg-emerald-400',
    },
    {
      label: 'S',
      title: 'Snare',
      steps: expand(measured.snareSteps, measured.snarePhraseSteps),
      on: 'bg-amber-400',
    },
    {
      label: 'H',
      title: 'Hat',
      steps: expand(measured.hatSteps, measured.hatPhraseSteps),
      on: 'bg-sky-400',
    },
  ]
  if (!rows.some((row) => row.steps.length)) return null
  const total = stepsPerBar * phraseBars
  return (
    <div className="rounded-lg border border-gray-800 bg-black/30 p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">
        {phraseBars}-bar phrase grid · {stepsPerBar} steps/bar
        {!measured.kickPhraseSteps?.length ? ' · tiled from bar pocket' : ''}
      </p>
      <div className="space-y-1 overflow-x-auto">
        {rows.map((row) => {
          const active = new Set(row.steps)
          return (
            <div key={`phrase-${row.label}`} className="flex min-w-[28rem] items-center gap-2">
              <span className="w-4 shrink-0 text-[11px] font-semibold text-gray-400" title={row.title}>
                {row.label}
              </span>
              <div
                className="grid flex-1 gap-px"
                style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: total }, (_, step) => {
                  const barStart = step % stepsPerBar === 0
                  const phraseMid = step === stepsPerBar * Math.floor(phraseBars / 2)
                  return (
                    <span
                      key={step}
                      title={`${row.title} bar ${Math.floor(step / stepsPerBar) + 1} step ${(step % stepsPerBar) + 1}`}
                      className={`h-3 rounded-[1px] ${
                        active.has(step)
                          ? row.on
                          : barStart
                            ? phraseMid
                              ? 'bg-gray-700'
                              : 'bg-gray-800'
                            : 'bg-gray-950'
                      }`}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
