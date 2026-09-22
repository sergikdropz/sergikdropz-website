'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import {
  DEFAULT_UGC_PACK,
  UGC_PACK_PLATFORMS,
  UGC_PACK_STATUSES,
  mergeUgcPack,
  ugcPackEligibility,
  ugcPackNextAction,
  ugcPackPlatformCount,
  ugcPackStatusSteps,
  type UgcPack,
} from '@/lib/studio/ugc-pack'
import {
  displayArtistLine,
  parseContributors,
} from '@/lib/studio/track-credits'
import { seedWriterLegalRows } from '@/lib/studio/songwriter'
import { dispatchAdminAiPrompt, openAdminAiAssistant } from '@/lib/admin-ai-client'
import {
  DEFAULT_INGEST_ATTESTATIONS,
  INGEST_ATTESTATION_FIELDS,
  attestationsComplete,
  type IngestAttestations,
} from '@/lib/studio/dsp-ingest'
import type { WorkflowStepId } from '@/lib/studio/constants'
import {
  resolveCopyrightActionTarget,
  type RightsActionFocus,
} from '@/lib/studio/rights-action-target'
import {
  buildProPacketText,
  coverPacketGaps,
  publisherApplyPatch,
  publisherFromAlbumArtist,
  proPacketStatus,
  resolveNextRightsMove,
  suggestedNoSamplesClearance,
  suggestedSergikPaperwork,
  summarizeSplits,
  tracksNeedingSplitSeed,
} from '@/lib/studio/rights-ops'
import {
  applyRightsPacketDrafts,
  buildRightsPackets,
  rightsPacketApprovePatch,
  rightsPacketPendingPatch,
  type RightsPacket,
  type RightsPacketKind,
} from '@/lib/studio/rights-packets'
import {
  setRightsPacketDraft,
} from '@/lib/studio/rights-packet-drafts'
import {
  contractSignatories,
  isValidPartyEmail,
  mergePartyContacts,
  type PartyContact,
  signatoriesReadyToSend,
} from '@/lib/studio/rights-contract-send'
import {
  FaArrowRight,
  FaBrain,
  FaCheck,
  FaCopy,
  FaFileContract,
  FaMagic,
  FaPaperPlane,
  FaRedo,
  FaSave,
  FaShareAlt,
  FaShieldAlt,
} from 'react-icons/fa'
import ReleaseReadinessRing from './ReleaseReadinessRing'

type RightsTrack = {
  id?: string
  title: string
  contributors?: unknown
  splits?: unknown
  iswc?: string | null
  isrc_full?: string | null
  publisher_name?: string | null
  publisher_ipi?: string | null
  origin?: string | null
  cover_original_title?: string | null
  cover_original_artist?: string | null
  writer_legal_names?: string | null
  mechanical_licensed?: boolean | null
  contains_samples?: boolean | null
}

type TrackRightsPatch = Record<string, string | boolean | null>

type Props = {
  readiness: CopyrightReadiness | null
  releaseId?: string
  releaseTitle?: string
  albumArtist?: string | null
  tracks?: RightsTrack[]
  saving?: boolean
  onToggle: (field: string, value: boolean) => void
  onOpsChange: (field: string, value: string) => void
  onUpdate?: (payload: Record<string, boolean | string | object>) => void
  onUgcChange: (pack: UgcPack) => void
  onTrackRightsChange?: (trackId: string, patch: TrackRightsPatch) => void
  onApplyPublisherToTracks?: (patch: { publisher_name: string; publisher_ipi: string | null }) => void
  onAssignMissingIsrcs?: () => void
  onSeedSplits?: () => void
  onNavigate?: (step: WorkflowStepId, focus?: RightsActionFocus) => void
  focusRequest?: RightsActionFocus | null
  onFocusHandled?: () => void
  attestations?: IngestAttestations
  onAttestationsChange?: (next: IngestAttestations) => void
}

const BOOL_FIELDS = [
  { key: 'rights_intake_complete', label: 'Rights intake' },
  { key: 'legal_locked', label: 'Legal lock' },
  { key: 'composition_registered', label: 'Composition registered' },
  { key: 'master_registered', label: 'Master registered' },
  { key: 'pro_registered', label: 'PRO registered' },
  { key: 'monitoring_enabled', label: 'Post-release monitoring' },
] as const

export default function CopyrightPanel({
  readiness,
  releaseId,
  releaseTitle,
  albumArtist,
  tracks = [],
  saving,
  onToggle,
  onOpsChange,
  onUpdate,
  onUgcChange,
  onTrackRightsChange,
  onApplyPublisherToTracks,
  onAssignMissingIsrcs,
  onSeedSplits,
  onNavigate,
  focusRequest = null,
  onFocusHandled,
  attestations = DEFAULT_INGEST_ATTESTATIONS,
  onAttestationsChange,
}: Props) {
  const attestationsRef = useRef<HTMLDivElement | null>(null)
  const coverRef = useRef<HTMLDivElement | null>(null)
  const proRef = useRef<HTMLDivElement | null>(null)
  const contractsRef = useRef<HTMLDivElement | null>(null)
  const publisherRef = useRef<HTMLDivElement | null>(null)
  const [expandedTrack, setExpandedTrack] = useState<string | null>(null)
  const [showOps, setShowOps] = useState(false)
  const [showPro, setShowPro] = useState(false)
  const [copiedPacket, setCopiedPacket] = useState(false)
  const [activePacket, setActivePacket] = useState<RightsPacketKind | null>('split_sheet')
  const [copiedContract, setCopiedContract] = useState<RightsPacketKind | null>(null)
  const [partyEmailDraft, setPartyEmailDraft] = useState<Record<string, string>>({})
  const [sendingContract, setSendingContract] = useState(false)
  const [sendNote, setSendNote] = useState<string | null>(null)
  const [packetDraftText, setPacketDraftText] = useState('')
  const [packetDirty, setPacketDirty] = useState(false)
  const [savingPacket, setSavingPacket] = useState(false)

  const move = useMemo(
    () => (readiness ? resolveNextRightsMove(readiness, tracks) : null),
    [readiness, tracks],
  )
  const paperwork = useMemo(
    () => (readiness ? suggestedSergikPaperwork(tracks, readiness.ops) : null),
    [readiness, tracks],
  )
  const noSamples = useMemo(
    () => (readiness ? suggestedNoSamplesClearance(tracks, readiness.ops) : null),
    [readiness, tracks],
  )
  const coverGaps = useMemo(() => coverPacketGaps(tracks), [tracks])
  const splitSeeds = useMemo(() => tracksNeedingSplitSeed(tracks), [tracks])
  const missingIsrcs = useMemo(
    () => tracks.filter((track) => track.id && !track.isrc_full),
    [tracks],
  )
  const publisherName = readiness?.rights?.publisher_name || publisherFromAlbumArtist(albumArtist)
  const attestationsDone = attestationsComplete(attestations)
  const ugcOn = Boolean(readiness?.ugc_pack?.opted_in)
  const proStatus = useMemo(
    () =>
      proPacketStatus(tracks, {
        publisher_name: readiness?.rights?.publisher_name || publisherName,
        writer_ipi: readiness?.rights?.writer_ipi || null,
      }),
    [tracks, readiness?.rights?.publisher_name, readiness?.rights?.writer_ipi, publisherName],
  )
  const proText = useMemo(
    () =>
      buildProPacketText({
        releaseTitle,
        albumArtist,
        publisherName: readiness?.rights?.publisher_name || publisherName,
        publisherIpi: readiness?.rights?.publisher_ipi,
        writerIpi: readiness?.rights?.writer_ipi,
        tracks,
      }),
    [releaseTitle, albumArtist, readiness?.rights, publisherName, tracks],
  )
  const generatedPackets = useMemo(
    () =>
      buildRightsPackets({
        releaseTitle,
        albumArtist,
        publisherName: readiness?.rights?.publisher_name || publisherName,
        tracks,
      }),
    [releaseTitle, albumArtist, readiness?.rights?.publisher_name, publisherName, tracks],
  )
  const contractPackets = useMemo(
    () => applyRightsPacketDrafts(generatedPackets, readiness?.rights_packets),
    [generatedPackets, readiness?.rights_packets],
  )
  const selectedPacket =
    contractPackets.find((packet) => packet.kind === activePacket) || contractPackets[0] || null
  const selectedGenerated =
    generatedPackets.find((packet) => packet.kind === selectedPacket?.kind) || null
  const packetIsEdited = Boolean(
    selectedPacket && readiness?.rights_packets?.[selectedPacket.kind]?.text,
  )
  const signatories = useMemo(() => {
    if (!selectedPacket) return []
    const contacts = mergePartyContacts(
      readiness?.party_contacts,
      Object.entries(partyEmailDraft).map(([stage, email]) => ({ stage, email })),
    )
    return contractSignatories(selectedPacket, tracks, contacts)
  }, [selectedPacket, tracks, readiness?.party_contacts, partyEmailDraft])
  const sendReady = useMemo(() => signatoriesReadyToSend(signatories), [signatories])

  useEffect(() => {
    setPartyEmailDraft((prev) => {
      const next = { ...prev }
      for (const row of readiness?.party_contacts || []) {
        if (!next[row.stage]?.trim()) next[row.stage] = row.email
      }
      return next
    })
  }, [readiness?.party_contacts])

  useEffect(() => {
    if (!selectedPacket) {
      setPacketDraftText('')
      setPacketDirty(false)
      return
    }
    setPacketDraftText(selectedPacket.text || '')
    setPacketDirty(false)
  }, [selectedPacket?.kind, selectedPacket?.text])

  useEffect(() => {
    function onApplyField(event: Event) {
      const detail = (event as CustomEvent<{ fieldId?: string; value?: string }>).detail
      const fieldId = String(detail?.fieldId || '')
      const value = typeof detail?.value === 'string' ? detail.value : ''
      if (!selectedPacket || !value.trim()) return
      if (
        fieldId === `rights-packet-${selectedPacket.kind}` ||
        fieldId.includes(`rights_packet_${selectedPacket.kind}`)
      ) {
        setPacketDraftText(value)
        setPacketDirty(true)
      }
    }
    window.addEventListener('admin-ai:apply-field', onApplyField as EventListener)
    return () => window.removeEventListener('admin-ai:apply-field', onApplyField as EventListener)
  }, [selectedPacket?.kind])

  useEffect(() => {
    if (move?.focus === 'pro' || move?.run === 'open_pro') setShowPro(true)
    if (move?.focus === 'contracts' || move?.run === 'open_contracts') {
      setActivePacket((current) => current || 'split_sheet')
    }
    if (move?.focus === 'cover' || move?.run === 'open_cover') {
      const gap = coverPacketGaps(tracks)[0]
      if (gap?.id) setExpandedTrack(gap.id)
    }
  }, [move?.focus, move?.run, tracks])

  function focusRightsSection(focus: Pick<RightsActionFocus, 'section' | 'trackId'>) {
    if (focus.section === 'cover') {
      if (focus.trackId) setExpandedTrack(focus.trackId)
      else {
        const gap = coverPacketGaps(tracks)[0]
        if (gap?.id) setExpandedTrack(gap.id)
      }
      coverRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (focus.section === 'pro') {
      setShowPro(true)
      proRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (focus.section === 'contracts') {
      const firstNeeded = contractPackets.find((packet) => packet.needed)
      if (firstNeeded) setActivePacket(firstNeeded.kind)
      contractsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (focus.section === 'publisher') {
      publisherRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (focus.section === 'attestations') {
      attestationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  useEffect(() => {
    if (!focusRequest || focusRequest.step !== 'rights') return
    focusRightsSection(focusRequest)
    onFocusHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest])

  if (!readiness) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-zinc-500 text-sm">
        Loading rights pipeline…
      </div>
    )
  }

  const checks = readiness.checks
  const actions = (readiness.actions || []).slice(0, 6)
  const lockDisabled = saving || (!checks.legal_lock_ready && !checks.legal_locked)

  function applyPatch(patch: Record<string, boolean | string | object>) {
    if (onUpdate) {
      onUpdate(patch)
      return
    }
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === 'boolean') onToggle(key, value)
      else if (typeof value === 'string') onOpsChange(key, value)
    }
  }

  async function copyContractPacket(packet: RightsPacket) {
    const text = packet.kind === selectedPacket?.kind ? packetDraftText : packet.text
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedContract(packet.kind)
      window.setTimeout(() => setCopiedContract(null), 1600)
      const pending = rightsPacketPendingPatch(packet)
      if (pending && packet.statusField && readiness?.ops[packet.statusField] === 'missing') {
        applyPatch(pending)
      }
    } catch {
      setCopiedContract(null)
    }
  }

  function approveContractPacket(packet: RightsPacket) {
    const patch = rightsPacketApprovePatch(packet)
    if (!patch) return
    applyPatch(patch)
  }

  function savePacketDraft(packet: RightsPacket) {
    setSavingPacket(true)
    try {
      const drafts = setRightsPacketDraft(
        readiness?.rights_packets,
        packet.kind,
        packetDraftText,
      )
      applyPatch({ rights_packets: drafts })
      setPacketDirty(false)
      setSendNote('Contract draft saved')
      window.setTimeout(() => setSendNote(null), 2000)
    } finally {
      setSavingPacket(false)
    }
  }

  function resetPacketDraft(packet: RightsPacket) {
    const generated = selectedGenerated?.text || ''
    applyPatch({
      rights_packets: {
        [packet.kind]: null,
      },
    })
    setPacketDraftText(generated)
    setPacketDirty(false)
    setSendNote('Reset to Catalog-generated packet')
    window.setTimeout(() => setSendNote(null), 2000)
  }

  function auditEnhancePacket(packet: RightsPacket) {
    if (!releaseId) return
    const text = packetDraftText || packet.text
    dispatchAdminAiPrompt({
      agentMode: 'studio_release',
      message: [
        `Audit and enhance the ${packet.label} for "${releaseTitle}" (${releaseId}).`,
        'This is first-party SERGIK Release Studio paperwork — not DistroKid.',
        '1) Audit findings: missing parties, incomplete legal names, ownership %, unclear terms, DistroKid-style gaps.',
        '2) Produce a tightened full contract packet ready to send.',
        'Keep the same parties and ownership numbers unless Catalog data clearly contradicts them — call those out in the audit.',
        `Focus the Rights packet field \`rights-packet-${packet.kind}\` and when the enhanced text is ready, end with an \`\`\`ai-apply {"value":"...full revised packet..."}\`\`\` block.`,
        `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
        '',
        'Current packet:',
        '```',
        text,
        '```',
      ].join('\n'),
    })
    openAdminAiAssistant()
  }

  function partyContactsFromDraft(): PartyContact[] {
    return Object.entries(partyEmailDraft)
      .map(([stage, email]) => ({ stage, email: email.trim() }))
      .filter((row) => row.stage && isValidPartyEmail(row.email))
  }

  function savePartyContacts() {
    applyPatch({ party_contacts: partyContactsFromDraft() })
    setSendNote('Collaborator emails saved')
    window.setTimeout(() => setSendNote(null), 2000)
  }

  async function sendContractForSigning(packet: RightsPacket) {
    if (!releaseId || !packet.needed) return
    const text = packet.kind === selectedPacket?.kind ? packetDraftText : packet.text
    if (!text.trim()) return
    if (packetDirty) {
      savePacketDraft(packet)
    }
    setSendingContract(true)
    setSendNote(null)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId)}/contracts/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: packet.kind,
            party_contacts: partyContactsFromDraft(),
          }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Send failed')
      setSendNote(`Sent to ${data.count || 0} collaborator${data.count === 1 ? '' : 's'}`)
      if (data.readiness && onUpdate) {
        applyPatch({
          ...(rightsPacketPendingPatch(packet) || {}),
          party_contacts: partyContactsFromDraft(),
        })
      }
      window.setTimeout(() => setSendNote(null), 3200)
    } catch (e: unknown) {
      setSendNote(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSendingContract(false)
    }
  }

  function runMove() {
    if (!move) return
    if (move.run === 'assign_isrcs') {
      onAssignMissingIsrcs?.()
      return
    }
    if (move.run === 'seed_splits') {
      onSeedSplits?.()
      return
    }
    if (move.run === 'declare_no_samples') {
      for (const track of tracks) {
        if (!track.id || String(track.origin || 'original').toLowerCase() === 'cover') continue
        onTrackRightsChange?.(track.id, { contains_samples: false })
      }
    }
    if (move.patch) {
      applyPatch(move.patch)
      return
    }
    if (move.step !== 'rights') {
      onNavigate?.(move.step, {
        step: move.step,
        section: move.focus || 'credits',
        trackId: move.trackId,
        party: move.party,
      })
      return
    }
    if (move.focus) {
      focusRightsSection({ section: move.focus, trackId: move.trackId })
    }
  }

  function followAction(action: {
    kind: string
    label: string
    field?: string | null
    issue_id?: string | null
  }) {
    if (action.kind === 'assign_isrc') {
      onAssignMissingIsrcs?.()
      return
    }
    if (action.kind === 'fix_splits') {
      onSeedSplits?.()
      return
    }
    if (action.field === 'legal_locked' && lockDisabled) return
    if (action.field) {
      applyPatch({ [action.field]: true })
      return
    }

    const target = resolveCopyrightActionTarget(action)
    if (target.section === 'isrc') {
      onAssignMissingIsrcs?.()
      coverRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (target.step !== 'rights') {
      onNavigate?.(target.step, target)
      return
    }
    focusRightsSection(target)
  }

  function fillPublisher() {
    applyPatch({ publisher_name: publisherName })
  }

  function applyPublisherDown() {
    const ipi = readiness?.rights.publisher_ipi || null
    if (!readiness?.rights.publisher_name) applyPatch({ publisher_name: publisherName })
    if (onApplyPublisherToTracks) {
      onApplyPublisherToTracks({ publisher_name: publisherName, publisher_ipi: ipi })
      return
    }
    for (const track of tracks) {
      if (!track.id || !onTrackRightsChange) continue
      const patch = publisherApplyPatch(track, { name: publisherName, ipi })
      if (patch) onTrackRightsChange(track.id, patch)
    }
  }

  async function copyProPacket() {
    try {
      await navigator.clipboard.writeText(proText)
      setCopiedPacket(true)
      window.setTimeout(() => setCopiedPacket(false), 1600)
    } catch {
      setCopiedPacket(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 overflow-hidden">
      <div className="p-5 border-b border-zinc-800 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <FaShieldAlt className="text-violet-400 text-xl mt-1 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white">Rights & copyright</h3>
            <p className="text-sm text-zinc-500 mt-1">
              Stage{' '}
              <span className="text-violet-300 capitalize">{readiness.stage.replace(/_/g, ' ')}</span>
              {readiness.stage_age_days ? (
                <span className="text-zinc-600"> · {readiness.stage_age_days}d here</span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ReleaseReadinessRing score={readiness.readiness_score} size={56} />
          {releaseId ? (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                dispatchAdminAiPrompt({
                  agentMode: 'studio_release',
                  message: [
                    `Update copyright checklist for "${releaseTitle || releaseId}" (${releaseId}).`,
                    `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
                    'Propose update_copyright_checklist for fields that clear blockers; preview before approve.',
                  ].join('\n'),
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 px-2.5 py-1 text-[10px] font-medium text-violet-200 hover:bg-violet-950/50 disabled:opacity-40"
            >
              <FaBrain className="text-[9px]" />
              AI
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-5 py-4 border-b border-zinc-800 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={runMove}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-40"
          >
            {move?.label || 'Rights ready'}
            <FaArrowRight className="text-xs" />
          </button>
          {missingIsrcs.length > 0 && move?.run !== 'assign_isrcs' ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => onAssignMissingIsrcs?.()}
              className="px-3 py-2 rounded-lg border border-zinc-700 text-zinc-200 text-sm hover:bg-zinc-800 disabled:opacity-40"
            >
              Assign {missingIsrcs.length} ISRC{missingIsrcs.length === 1 ? '' : 's'}
            </button>
          ) : null}
          {splitSeeds.length > 0 && move?.run !== 'seed_splits' ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => onSeedSplits?.()}
              className="px-3 py-2 rounded-lg border border-zinc-700 text-zinc-200 text-sm hover:bg-zinc-800 disabled:opacity-40"
            >
              Seed splits from credits
            </button>
          ) : null}
          {paperwork && !move?.patch?.split_sheet_status ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => applyPatch(paperwork)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-700/50 text-emerald-200 text-sm hover:bg-emerald-950/40 disabled:opacity-40"
            >
              <FaCheck className="text-[10px]" />
              Approve SERGIK paperwork
            </button>
          ) : null}
          {noSamples && !move?.patch?.sample_clearance_status ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => applyPatch(noSamples)}
              className="px-3 py-2 rounded-lg border border-emerald-700/50 text-emerald-200 text-sm hover:bg-emerald-950/40 disabled:opacity-40"
            >
              No uncleared samples
            </button>
          ) : null}
        </div>
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {actions.map((action) => (
              <button
                key={`${action.kind}-${action.issue_id || action.field || action.label}`}
                type="button"
                disabled={saving}
                onClick={() => followAction(action)}
                className="text-[11px] px-2 py-1 rounded-full border border-amber-900/50 bg-amber-950/30 text-amber-100 hover:border-amber-700 disabled:opacity-40"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-emerald-300">No blockers. This package can move to Launch.</p>
        )}
      </div>

      {tracks.length > 0 ? (
        <div ref={coverRef} className="px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Tracks</p>
            <p className="text-[11px] text-zinc-600">
              Credits stay on Catalog. ISRCs, splits, cover packet, and ISWC live here.
            </p>
          </div>
          {coverGaps.length > 0 ? (
            <p className="text-[11px] text-amber-200 mb-2">
              {coverGaps.length} cover{coverGaps.length === 1 ? '' : 's'} still need original title, artist, and a
              mechanical license.
            </p>
          ) : null}
          <ul className="space-y-2">
            {tracks.map((track) => {
              const credits = parseContributors(track.contributors)
              const splits = summarizeSplits(track.splits)
              const open = expandedTrack === track.id
              const isCover = String(track.origin || '').toLowerCase() === 'cover'
              return (
                <li key={track.id || track.title} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedTrack(open ? null : track.id || null)}
                      className="text-left min-w-0 flex-1"
                    >
                      <span className="text-sm text-white">{track.title}</span>
                      <span className="block text-[11px] text-zinc-500 truncate">
                        {displayArtistLine(credits)}
                        {(() => {
                          const writers = seedWriterLegalRows(track.contributors, track.writer_legal_names)
                            .map((row) => (row.legal ? `${row.stage} (${row.legal})` : row.stage))
                            .join(' · ')
                          return writers ? ` · ${writers}` : ''
                        })()}
                      </span>
                    </button>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        track.isrc_full ? 'bg-emerald-950/50 text-emerald-300' : 'bg-amber-950/40 text-amber-200'
                      }`}
                    >
                      {track.isrc_full || 'No ISRC'}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        splits.ok ? 'bg-emerald-950/50 text-emerald-300' : 'bg-amber-950/40 text-amber-200'
                      }`}
                    >
                      {splits.label}
                    </span>
                    {isCover ? (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          track.mechanical_licensed
                            ? 'bg-emerald-950/50 text-emerald-300'
                            : 'bg-amber-950/40 text-amber-200'
                        }`}
                      >
                        Cover
                      </span>
                    ) : null}
                    {onTrackRightsChange && track.id ? (
                      <input
                        type="text"
                        defaultValue={track.iswc || ''}
                        placeholder="ISWC"
                        onBlur={(e) =>
                          onTrackRightsChange(track.id as string, { iswc: e.target.value.trim() || null })
                        }
                        className="w-[9.5rem] bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-[11px] text-white font-mono"
                      />
                    ) : null}
                  </div>
                  {open && onTrackRightsChange && track.id ? (
                    <div className="grid sm:grid-cols-2 gap-2 mt-3">
                      <input
                        type="text"
                        defaultValue={track.publisher_name || ''}
                        placeholder={publisherName}
                        onBlur={(e) =>
                          onTrackRightsChange(track.id as string, {
                            publisher_name: e.target.value.trim() || null,
                          })
                        }
                        className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white"
                      />
                      <input
                        type="text"
                        defaultValue={track.publisher_ipi || ''}
                        placeholder="Publisher IPI"
                        onBlur={(e) =>
                          onTrackRightsChange(track.id as string, {
                            publisher_ipi: e.target.value.trim() || null,
                          })
                        }
                        className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white font-mono"
                      />
                      {isCover ? (
                        <>
                          <input
                            type="text"
                            defaultValue={track.cover_original_title || ''}
                            placeholder="Original title"
                            onBlur={(e) =>
                              onTrackRightsChange(track.id as string, {
                                cover_original_title: e.target.value.trim() || null,
                              })
                            }
                            className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white"
                          />
                          <input
                            type="text"
                            defaultValue={track.cover_original_artist || ''}
                            placeholder="Original artist"
                            onBlur={(e) =>
                              onTrackRightsChange(track.id as string, {
                                cover_original_artist: e.target.value.trim() || null,
                              })
                            }
                            className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white"
                          />
                          <label className="flex items-center gap-2 text-xs text-zinc-300 sm:col-span-2">
                            <input
                              type="checkbox"
                              checked={track.mechanical_licensed === true}
                              onChange={(e) =>
                                onTrackRightsChange(track.id as string, {
                                  mechanical_licensed: e.target.checked,
                                })
                              }
                              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-violet-600"
                            />
                            Mechanical license on file
                          </label>
                        </>
                      ) : (
                        <label className="flex items-center gap-2 text-xs text-zinc-300 sm:col-span-2">
                          <input
                            type="checkbox"
                            checked={Boolean(track.contains_samples)}
                            onChange={(e) =>
                              onTrackRightsChange(track.id as string, {
                                contains_samples: e.target.checked,
                              })
                            }
                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-violet-600"
                          />
                          Contains samples that need clearance
                        </label>
                      )}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div ref={publisherRef} className="px-5 py-4 border-b border-zinc-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Publisher</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={fillPublisher}
              className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-100 disabled:opacity-40"
            >
              <FaMagic className="text-[9px]" />
              Fill {publisherName}
            </button>
            <button
              type="button"
              disabled={saving || !tracks.length}
              onClick={applyPublisherDown}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            >
              Apply to tracks
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-xs text-zinc-500">
            Publisher
            <input
              type="text"
              defaultValue={readiness.rights?.publisher_name || ''}
              onBlur={(e) => onOpsChange('publisher_name', e.target.value)}
              placeholder={publisherName}
              className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Publisher IPI / CAE
            <input
              type="text"
              defaultValue={readiness.rights?.publisher_ipi || ''}
              onBlur={(e) => onOpsChange('publisher_ipi', e.target.value)}
              placeholder="00123456789"
              className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Writer IPI / CAE
            <input
              type="text"
              defaultValue={readiness.rights?.writer_ipi || ''}
              onBlur={(e) => onOpsChange('writer_ipi', e.target.value)}
              placeholder="00123456789"
              className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </label>
        </div>
      </div>

      <div ref={proRef} className="px-5 py-4 border-b border-zinc-800">
        <button
          type="button"
          onClick={() => setShowPro((open) => !open)}
          className="w-full text-left flex items-center justify-between gap-2"
        >
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            PRO / SoundExchange packet
          </span>
          <span className={`text-[11px] ${proStatus.ok ? 'text-emerald-300' : 'text-amber-200'}`}>
            {proStatus.ok ? 'Ready to register' : proStatus.missing.join(' · ')}
          </span>
        </button>
        {showPro ? (
          <div className="mt-3 space-y-3">
            <pre className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-[11px] text-zinc-300 font-mono">
              {proText}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyProPacket()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-200 text-sm hover:bg-zinc-800"
              >
                <FaCopy className="text-[10px]" />
                {copiedPacket ? 'Copied' : 'Copy packet'}
              </button>
              <button
                type="button"
                disabled={saving || !proStatus.ok}
                title={proStatus.ok ? undefined : proStatus.missing.join(', ')}
                onClick={() =>
                  applyPatch({
                    composition_registered: true,
                    master_registered: true,
                    pro_registered: true,
                  })
                }
                className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm disabled:opacity-40"
              >
                Mark composition, master, and PRO registered
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div ref={contractsRef} className="p-5 grid lg:grid-cols-[1.15fr_0.85fr] gap-6 border-b border-zinc-800">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider inline-flex items-center gap-2">
              <FaFileContract className="text-violet-400" />
              Contracts & clearance
            </p>
            <p className="text-[11px] text-zinc-600">
              First-party SERGIK packets from Catalog credits & splits
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-2">
            {contractPackets.map((packet) => {
              const status =
                packet.statusField && readiness
                  ? readiness.ops[packet.statusField] || 'missing'
                  : packet.needed
                    ? 'missing'
                    : 'n/a'
              const selected = selectedPacket?.kind === packet.kind
              return (
                <button
                  key={packet.kind}
                  type="button"
                  onClick={() => setActivePacket(packet.kind)}
                  className={`text-left rounded-xl border px-3 py-2.5 transition ${
                    selected
                      ? 'border-violet-500/50 bg-violet-950/30'
                      : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
                  }`}
                >
                  <p className="text-sm text-white">{packet.label}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{packet.summary}</p>
                  <p
                    className={`text-[10px] uppercase tracking-wide mt-2 ${
                      status === 'approved'
                        ? 'text-emerald-400'
                        : status === 'pending'
                          ? 'text-amber-400'
                          : status === 'n/a'
                            ? 'text-zinc-600'
                            : 'text-zinc-500'
                    }`}
                  >
                    {status === 'n/a' ? 'Not required' : status}
                  </p>
                </button>
              )
            })}
          </div>

          {selectedPacket ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-white">{selectedPacket.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{selectedPacket.summary}</p>
                  {selectedPacket.missing.length ? (
                    <p className="text-xs text-amber-400 mt-1">{selectedPacket.missing[0]}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedPacket.needed && (selectedPacket.text || packetDraftText) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => auditEnhancePacket(selectedPacket)}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-violet-500/40 text-violet-100 hover:bg-violet-950/40"
                        title="AI audit findings + enhanced packet draft"
                      >
                        <FaBrain className="text-[10px]" />
                        AI audit & enhance
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyContractPacket(selectedPacket)}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                      >
                        <FaCopy className="text-[10px]" />
                        {copiedContract === selectedPacket.kind ? 'Copied' : 'Copy contract'}
                      </button>
                      <button
                        type="button"
                        disabled={
                          saving ||
                          sendingContract ||
                          !selectedPacket.ready ||
                          !sendReady.ok
                        }
                        title={
                          !selectedPacket.ready
                            ? selectedPacket.missing[0] || 'Finish Catalog credits/splits first'
                            : !sendReady.ok
                              ? sendReady.missing.length
                                ? `Add email for: ${sendReady.missing.join(', ')}`
                                : 'No collaborator recipients'
                              : 'Email contract for signing via Resend'
                        }
                        onClick={() => void sendContractForSigning(selectedPacket)}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-cyan-600/40 text-cyan-100 hover:bg-cyan-950/40 disabled:opacity-40"
                      >
                        <FaPaperPlane className="text-[10px]" />
                        {sendingContract ? 'Sending…' : 'Email for signing'}
                      </button>
                      <button
                        type="button"
                        disabled={saving || !selectedPacket.ready}
                        title={
                          selectedPacket.ready
                            ? undefined
                            : selectedPacket.missing[0] || 'Finish Catalog credits/splits first'
                        }
                        onClick={() => approveContractPacket(selectedPacket)}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40"
                      >
                        <FaCheck className="text-[10px]" />
                        Mark approved
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-500 py-1.5">No collab packet needed on this release.</p>
                  )}
                </div>
              </div>
              {selectedPacket.needed && signatories.length > 0 ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                      Collaborator emails
                    </p>
                    <button
                      type="button"
                      onClick={savePartyContacts}
                      disabled={saving}
                      className="text-[11px] text-violet-300 hover:text-violet-200 disabled:opacity-40"
                    >
                      Save emails
                    </button>
                  </div>
                  {signatories.map((row) => (
                    <label
                      key={row.stage}
                      className="grid sm:grid-cols-[140px_1fr] gap-2 items-center text-xs"
                    >
                      <span className="text-zinc-300 truncate" title={row.stage}>
                        {row.stage}
                        {row.skip ? (
                          <span className="text-zinc-600"> · self</span>
                        ) : null}
                      </span>
                      <input
                        type="email"
                        value={partyEmailDraft[row.stage] || row.email || ''}
                        disabled={row.skip}
                        placeholder={row.skip ? 'Approve in Studio' : 'name@example.com'}
                        onChange={(e) =>
                          setPartyEmailDraft((prev) => ({
                            ...prev,
                            [row.stage]: e.target.value,
                          }))
                        }
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white disabled:opacity-40"
                      />
                    </label>
                  ))}
                  {sendNote ? <p className="text-xs text-cyan-300">{sendNote}</p> : null}
                  {!sendReady.ok && sendReady.missing.length ? (
                    <p className="text-xs text-amber-400">
                      Add email for: {sendReady.missing.join(', ')}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {selectedPacket.needed && (selectedPacket.text || packetDraftText) ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                      Contract packet
                      {packetIsEdited || packetDirty ? (
                        <span className="ml-2 text-amber-300 normal-case tracking-normal">
                          · {packetDirty ? 'unsaved edits' : 'manual / AI draft'}
                        </span>
                      ) : (
                        <span className="ml-2 text-zinc-600 normal-case tracking-normal">
                          · generated from Catalog
                        </span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving || savingPacket || !packetDirty}
                        onClick={() => savePacketDraft(selectedPacket)}
                        className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                      >
                        <FaSave className="text-[10px]" />
                        {savingPacket ? 'Saving…' : 'Save draft'}
                      </button>
                      <button
                        type="button"
                        disabled={saving || (!packetIsEdited && !packetDirty)}
                        onClick={() => resetPacketDraft(selectedPacket)}
                        className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
                      >
                        <FaRedo className="text-[10px]" />
                        Reset generated
                      </button>
                    </div>
                  </div>
                  <textarea
                    id={`rights-packet-${selectedPacket.kind}`}
                    data-ai-field-id={`rights-packet-${selectedPacket.kind}`}
                    data-ai-field={`rights_packet_${selectedPacket.kind}`}
                    aria-label={`${selectedPacket.label} packet`}
                    value={packetDraftText}
                    onChange={(e) => {
                      setPacketDraftText(e.target.value)
                      setPacketDirty(true)
                    }}
                    rows={12}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-violet-500/50"
                  />
                  <p className="text-[11px] text-zinc-600">
                    Edit freely, save the draft, then email/copy. AI audit & enhance opens Admin AI with findings + a revised packet you can apply back into this field.
                  </p>
                </div>
              ) : null}
              {selectedPacket.statusField ? (
                <label className="text-[11px] text-zinc-500 block max-w-xs">
                  Status
                  <select
                    value={readiness.ops[selectedPacket.statusField] || 'missing'}
                    onChange={(e) => onOpsChange(selectedPacket.statusField!, e.target.value)}
                    className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white"
                  >
                    <option value="missing">Missing</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="grid sm:grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-500">
              Sample clearance
              <select
                value={readiness.ops.sample_clearance_status || 'missing'}
                onChange={(e) => onOpsChange('sample_clearance_status', e.target.value)}
                className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white"
              >
                <option value="missing">Missing</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
              </select>
            </label>
            {noSamples ? (
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => applyPatch(noSamples)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-emerald-700/40 text-emerald-200 hover:bg-emerald-950/30 disabled:opacity-40"
                >
                  Approve — no uncleared samples
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid sm:grid-cols-2 gap-1">
            {BOOL_FIELDS.map(({ key, label }) => {
              const next = move?.patch && key in move.patch
              const lockedOut = key === 'legal_locked' && lockDisabled
              return (
                <label
                  key={key}
                  title={
                    lockedOut
                      ? 'Finish rights intake, contracts, and DSP attestations before legal lock.'
                      : undefined
                  }
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${
                    lockedOut ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  } ${next ? 'bg-violet-950/40 border border-violet-700/40' : 'hover:bg-zinc-800/50'}`}
                >
                  <input
                    type="checkbox"
                    disabled={saving || lockedOut}
                    checked={Boolean(checks[key as keyof typeof checks])}
                    onChange={(e) => onToggle(key, e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-violet-600"
                  />
                  <span className="text-sm text-zinc-300">{label}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowOps((open) => !open)}
            className="text-xs font-medium text-zinc-500 uppercase tracking-wider"
          >
            Ops {showOps ? '▾' : '▸'} {readiness.ops.owner_name || 'unassigned'} · {readiness.ops.role_queue || 'legal'}
          </button>
          {showOps ? (
            <div className="space-y-3">
              <label className="text-xs text-zinc-500 block">
                Owner
                <input
                  type="text"
                  defaultValue={readiness.ops.owner_name || ''}
                  onBlur={(e) => onOpsChange('owner_name', e.target.value)}
                  className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                  placeholder="SERGIK"
                />
              </label>
              <label className="text-xs text-zinc-500 block">
                Queue
                <select
                  value={readiness.ops.role_queue || 'legal'}
                  onChange={(e) => onOpsChange('role_queue', e.target.value)}
                  className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="a_and_r">A&R</option>
                  <option value="legal">Legal</option>
                  <option value="metadata">Metadata</option>
                  <option value="marketing">Marketing</option>
                </select>
              </label>
              <label className="text-xs text-zinc-500 block">
                Due date
                <input
                  type="date"
                  value={readiness.ops.due_date || ''}
                  onChange={(e) => onOpsChange('due_date', e.target.value)}
                  className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
          ) : null}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-2 text-xs text-zinc-500 leading-relaxed">
            <p className="text-zinc-400">How contracts work</p>
            <p>1. Seed splits & credits in Catalog (legal names for collabs).</p>
            <p>2. Add collaborator emails → Email for signing (Resend) or Copy contract.</p>
            <p>3. Mark approved when parties reply. SERGIK-only releases can use Approve SERGIK paperwork.</p>
            <p>Legal lock waits for intake, contracts, and DSP attestations.</p>
          </div>
        </div>
      </div>

      <div ref={attestationsRef} className="px-5 py-4 border-b border-zinc-800">
        <details open={!attestationsDone || move?.focus === 'attestations'} className="group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              DSP attestations
            </span>
            <span className={`text-[11px] ${attestationsDone ? 'text-emerald-300' : 'text-amber-200'}`}>
              {INGEST_ATTESTATION_FIELDS.filter((field) => attestations[field.id]).length}/
              {INGEST_ATTESTATION_FIELDS.length}
            </span>
          </summary>
          <div className="mt-3">
            <IngestAttestationsSection
              attestations={attestations}
              saving={saving}
              onChange={onAttestationsChange}
            />
          </div>
        </details>
      </div>

      <details open className="mx-5 mb-5 mt-4">
        <summary className="cursor-pointer list-none text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-2">
          <span>UGC pack {ugcOn ? '· enrolled' : '· optional'}</span>
          {ugcOn ? (
            <span
              className={`normal-case tracking-normal font-normal px-1.5 py-0.5 rounded ${
                readiness.ugc_pack?.status === 'live'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : readiness.ugc_pack?.status === 'ineligible'
                    ? 'bg-rose-500/15 text-rose-300'
                    : 'bg-sky-500/15 text-sky-300'
              }`}
            >
              {UGC_PACK_STATUSES.find((s) => s.id === readiness.ugc_pack?.status)?.short || 'Queued'}
              {' · '}
              {ugcPackPlatformCount(readiness.ugc_pack || DEFAULT_UGC_PACK)} platforms
            </span>
          ) : null}
        </summary>
        <div className="mt-3">
          <UgcPackSection
            pack={readiness.ugc_pack || DEFAULT_UGC_PACK}
            warnings={readiness.ugc?.warnings || []}
            sampleClearance={readiness.ops?.sample_clearance_status}
            masterRegistered={Boolean(readiness.checks?.master_registered)}
            compositionRegistered={Boolean(readiness.checks?.composition_registered)}
            saving={saving}
            onChange={onUgcChange}
          />
        </div>
      </details>
    </div>
  )
}

export function IngestAttestationsSection({
  attestations,
  saving,
  onChange,
}: {
  attestations: IngestAttestations
  saving?: boolean
  onChange?: (next: IngestAttestations) => void
}) {
  const remaining = INGEST_ATTESTATION_FIELDS.filter((field) => !attestations[field.id])

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <p className="text-xs text-zinc-500 max-w-xl">
          Stores need these statements before ingest. Confirming them is a rights act, not a DistroKid form.
        </p>
        {remaining.length && onChange ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (
                !confirm(
                  `Confirm ${remaining.length} remaining DSP rights attestation${remaining.length === 1 ? '' : 's'} for this package?`,
                )
              ) {
                return
              }
              const next = { ...attestations }
              for (const field of INGEST_ATTESTATION_FIELDS) next[field.id] = true
              onChange(next)
            }}
            className="text-[11px] text-violet-300 hover:text-violet-100 disabled:opacity-40"
          >
            Confirm remaining
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {INGEST_ATTESTATION_FIELDS.map((field) => (
          <label
            key={field.id}
            className="flex items-start gap-3 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer"
          >
            <input
              type="checkbox"
              disabled={saving || !onChange}
              checked={attestations[field.id]}
              onChange={(e) => onChange?.({ ...attestations, [field.id]: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-violet-600"
            />
            <span className="text-sm text-zinc-300 leading-relaxed">{field.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function UgcPackSection({
  pack,
  warnings,
  sampleClearance,
  masterRegistered,
  compositionRegistered,
  saving,
  onChange,
}: {
  pack: UgcPack
  warnings: string[]
  sampleClearance?: string | null
  masterRegistered?: boolean
  compositionRegistered?: boolean
  saving?: boolean
  onChange: (pack: UgcPack) => void
}) {
  const eligibility =
    warnings.length > 0
      ? { eligible: false, warnings }
      : ugcPackEligibility({
          pack,
          sampleClearance,
          masterRegistered,
          compositionRegistered,
        })
  const next = ugcPackNextAction({ pack, eligibility })
  const steps = ugcPackStatusSteps(pack.status, pack.opted_in)
  const platformCount = ugcPackPlatformCount(pack)

  function patch(partial: Partial<UgcPack>) {
    onChange(mergeUgcPack(pack, partial))
  }

  function enroll() {
    const hasPlatform = pack.youtube || pack.tiktok || pack.meta
    onChange(
      mergeUgcPack(pack, {
        opted_in: true,
        status: pack.status === 'live' ? 'live' : 'submitted',
        youtube: hasPlatform ? pack.youtube : true,
        tiktok: hasPlatform ? pack.tiktok : true,
        meta: hasPlatform ? pack.meta : true,
      })
    )
  }

  return (
    <div
      data-testid="ugc-pack-section"
      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <FaShareAlt className="text-sky-400 text-lg mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-zinc-200 font-medium">SERGIK UGC fingerprints</p>
            <p className="text-xs text-zinc-500 leading-relaxed mt-1">
              First-party Content ID / Music ID / Rights Manager for this master. Exclusive to
              SERGIK — do not also enroll DistroKid Social Media Pack on the same audio.
            </p>
          </div>
        </div>
        {!pack.opted_in ? (
          <button
            type="button"
            disabled={saving}
            onClick={enroll}
            data-testid="ugc-enroll"
            className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-50"
          >
            Enroll master
          </button>
        ) : pack.status === 'submitted' && eligibility.eligible ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => patch({ status: 'live' })}
            data-testid="ugc-mark-live"
            className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50"
          >
            Mark fingerprints live
          </button>
        ) : null}
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="UGC enrollment steps">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border ${
              step.state === 'done'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : step.state === 'current'
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-100'
                  : step.state === 'blocked'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-zinc-700 bg-zinc-900/80 text-zinc-500'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                step.state === 'done'
                  ? 'bg-emerald-400'
                  : step.state === 'current'
                    ? 'bg-sky-400'
                    : step.state === 'blocked'
                      ? 'bg-rose-400'
                      : 'bg-zinc-600'
              }`}
            />
            {step.label}
          </li>
        ))}
      </ol>

      <div
        data-testid="ugc-next-action"
        className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5"
      >
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">Next</p>
        <p className="text-sm text-zinc-200 mt-0.5">{next.label}</p>
        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{next.detail}</p>
      </div>

      <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
          What SERGIK does
        </p>
        <ul className="text-xs text-zinc-400 space-y-1.5 leading-relaxed">
          <li>Fingerprints the master after Rights clearance (not DistroKid Social Media Pack).</li>
          <li>Queues YouTube Content ID, TikTok Music ID, and Meta Rights Manager separately.</li>
          <li>Marks live only after registration confirms — Pipeline clears the UGC queue then.</li>
        </ul>
      </div>

      <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer">
        <input
          type="checkbox"
          disabled={saving}
          checked={pack.opted_in}
          onChange={(e) =>
            patch({
              opted_in: e.target.checked,
              status: e.target.checked
                ? pack.status === 'not_opted'
                  ? 'submitted'
                  : pack.status
                : 'not_opted',
            })
          }
          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-violet-600"
        />
        <span className="text-sm text-zinc-200">
          Enroll in SERGIK UGC
          {pack.opted_in ? (
            <span className="text-zinc-500 font-normal"> · {platformCount}/3 platforms</span>
          ) : null}
        </span>
      </label>

      <div className="grid sm:grid-cols-3 gap-2">
        {UGC_PACK_PLATFORMS.map((platform) => {
          const on = pack[platform.id]
          return (
            <label
              key={platform.id}
              data-testid={`ugc-platform-${platform.id}`}
              className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                on && pack.opted_in
                  ? 'border-sky-500/40 bg-sky-500/5'
                  : 'border-zinc-800 bg-zinc-950/40'
              } ${!pack.opted_in || saving ? 'opacity-60' : ''}`}
            >
              <span className="flex items-center gap-2 text-xs text-zinc-200">
                <input
                  type="checkbox"
                  disabled={saving || !pack.opted_in}
                  checked={on}
                  onChange={(e) => patch({ [platform.id]: e.target.checked })}
                  className="rounded border-zinc-600 bg-zinc-800 text-violet-600"
                />
                {platform.label}
                <span className="text-[10px] text-zinc-500 ml-auto">{platform.product}</span>
              </span>
              <span className="text-[11px] text-zinc-500 leading-snug pl-6">{platform.hint}</span>
            </label>
          )
        })}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">Status</span>
          <select
            disabled={saving || !pack.opted_in}
            value={pack.status}
            onChange={(e) => patch({ status: e.target.value as UgcPack['status'] })}
            data-testid="ugc-status"
            className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {UGC_PACK_STATUSES.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <div className="text-[11px] text-zinc-500 space-y-1 pt-5" data-testid="ugc-timestamps">
          {pack.enrolled_at ? (
            <p>Enrolled {new Date(pack.enrolled_at).toLocaleString()}</p>
          ) : (
            <p>Not enrolled yet</p>
          )}
          {pack.live_at ? <p>Live {new Date(pack.live_at).toLocaleString()}</p> : null}
        </div>
      </div>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">Ops notes</span>
        <textarea
          disabled={saving || !pack.opted_in}
          value={pack.notes || ''}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={2}
          placeholder="CMS conflict, sample hold, fingerprint ticket #…"
          data-testid="ugc-notes"
          className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 disabled:opacity-50"
        />
      </label>

      {eligibility.warnings.length > 0 ? (
        <ul
          data-testid="ugc-warnings"
          className="text-xs text-amber-200/90 space-y-1 list-disc list-inside"
        >
          {eligibility.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : pack.opted_in && pack.status === 'live' ? (
        <p className="text-xs text-emerald-300/90">
          Fingerprints live on {platformCount} platform{platformCount === 1 ? '' : 's'}. Pipeline UGC
          queue will clear this release.
        </p>
      ) : null}
    </div>
  )
}
