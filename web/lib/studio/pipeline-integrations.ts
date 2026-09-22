import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import type { WorkflowStepId } from '@/lib/studio/constants'
import { workflowStepForActionKind } from '@/lib/studio/studio-ia'

export type IntegrationTone = 'ok' | 'warn' | 'bad' | 'muted'

export type IntegrationChip = {
  id: string
  label: string
  detail: string
  tone: IntegrationTone
  step?: WorkflowStepId
  hrefKind?: 'release' | 'collab' | 'marketing' | 'delivery'
}

export type PipelineCollabMeta = {
  collaboratorCount: number
  pendingReviews: number
  messageCount?: number
}

/** Full readiness or a slim API slice used by Marketing pipeline. */
export type PipelineCopyrightSlice = {
  checks?: {
    dsp_ingest_passed?: boolean
    contracts_approved?: boolean
  }
  ugc_pack?: {
    opted_in?: boolean
    status?: string
  } | null
  ops?: {
    split_sheet_status?: 'missing' | 'pending' | 'approved' | null
    producer_agreement_status?: 'missing' | 'pending' | 'approved' | null
    sample_clearance_status?: 'missing' | 'pending' | 'approved' | null
  } | null
  party_contacts?: Array<{ stage: string; email: string }>
  ingest?: { blockers?: string[] } | null
  next_best_action?: { kind?: string; label?: string } | null
}

export type PipelineIntegrationInput = {
  copyright: PipelineCopyrightSlice | CopyrightReadiness | null | undefined
  storeLinkCount?: number
  /** Verified live|reachable store links (preferred over raw URL count). */
  storeLiveCount?: number
  targetStoreCount?: number
  collab?: PipelineCollabMeta | null
  hasCampaign?: boolean
  hasSmartLink?: boolean
  distributorStatus?: string | null
  hasPress?: boolean
  copyFilled?: number
}

function contractTone(
  status: 'missing' | 'pending' | 'approved' | null | undefined
): IntegrationTone {
  if (status === 'approved') return 'ok'
  if (status === 'pending') return 'warn'
  return 'bad'
}

function ugcChip(copyright: PipelineCopyrightSlice | null | undefined): IntegrationChip {
  const pack = copyright?.ugc_pack
  if (!pack?.opted_in) {
    return {
      id: 'ugc',
      label: 'UGC',
      detail: 'Off',
      tone: 'muted',
      step: 'rights',
      hrefKind: 'release',
    }
  }
  if (pack.status === 'live') {
    return {
      id: 'ugc',
      label: 'UGC',
      detail: 'Live',
      tone: 'ok',
      step: 'rights',
      hrefKind: 'release',
    }
  }
  return {
    id: 'ugc',
    label: 'UGC',
    detail: pack.status === 'submitted' ? 'Queued' : String(pack.status || 'Queued'),
    tone: 'warn',
    step: 'rights',
    hrefKind: 'release',
  }
}

function dspIngestChip(copyright: PipelineCopyrightSlice | null | undefined): IntegrationChip {
  if (!copyright) {
    return {
      id: 'ingest',
      label: 'DSP ingest',
      detail: 'Unknown',
      tone: 'muted',
      step: 'rights',
      hrefKind: 'release',
    }
  }
  if (copyright.checks?.dsp_ingest_passed) {
    return {
      id: 'ingest',
      label: 'DSP ingest',
      detail: 'Ready',
      tone: 'ok',
      step: 'rights',
      hrefKind: 'release',
    }
  }
  const blocker =
    copyright.ingest?.blockers?.[0] || copyright.next_best_action?.label || 'Gaps'
  return {
    id: 'ingest',
    label: 'DSP ingest',
    detail: blocker.length > 42 ? `${blocker.slice(0, 40)}…` : blocker,
    tone: 'bad',
    step: workflowStepForActionKind(copyright.next_best_action?.kind),
    hrefKind: 'release',
  }
}

function contractsChip(copyright: PipelineCopyrightSlice | null | undefined): IntegrationChip {
  const ops = copyright?.ops
  const contacts = copyright?.party_contacts?.length ?? 0
  if (copyright?.checks?.contracts_approved === true && !ops) {
    return {
      id: 'contracts',
      label: 'Contracts',
      detail: contacts ? `${contacts} email(s)` : 'Approved',
      tone: 'ok',
      step: 'rights',
      hrefKind: 'release',
    }
  }
  if (copyright?.checks?.contracts_approved === false && !ops) {
    return {
      id: 'contracts',
      label: 'Contracts',
      detail: 'Open',
      tone: 'warn',
      step: 'rights',
      hrefKind: 'release',
    }
  }
  const statuses = [
    ops?.split_sheet_status,
    ops?.producer_agreement_status,
    ops?.sample_clearance_status,
  ]
  const approved = statuses.every((s) => s === 'approved')
  const anyPending = statuses.some((s) => s === 'pending')
  const anyMissing = statuses.some((s) => !s || s === 'missing')

  if (approved) {
    return {
      id: 'contracts',
      label: 'Contracts',
      detail: contacts ? `${contacts} email(s)` : 'Approved',
      tone: 'ok',
      step: 'rights',
      hrefKind: 'release',
    }
  }

  const tone: IntegrationTone = anyPending
    ? 'warn'
    : anyMissing
      ? contractTone('missing')
      : 'warn'
  const detailParts: string[] = []
  if (anyMissing) detailParts.push('Missing')
  else if (anyPending) detailParts.push('Pending')
  if (contacts === 0 && !approved) detailParts.push('no emails')
  else if (contacts > 0) detailParts.push(`${contacts} email(s)`)

  return {
    id: 'contracts',
    label: 'Contracts',
    detail: detailParts.join(' · ') || 'Open',
    tone,
    step: 'rights',
    hrefKind: 'release',
  }
}

function deliveryChip(input: PipelineIntegrationInput): IntegrationChip {
  const live = input.storeLiveCount ?? 0
  const links = input.storeLinkCount ?? 0
  const targets = input.targetStoreCount ?? 0
  if (live > 0) {
    return {
      id: 'delivery',
      label: 'Stores',
      detail: `${live} live`,
      tone: 'ok',
      step: 'delivery',
      hrefKind: 'delivery',
    }
  }
  if (links > 0) {
    return {
      id: 'delivery',
      label: 'Stores',
      detail: `${links} linked · verify`,
      tone: 'warn',
      step: 'delivery',
      hrefKind: 'delivery',
    }
  }
  if (targets > 0) {
    return {
      id: 'delivery',
      label: 'Stores',
      detail: `${targets} target(s)`,
      tone: 'warn',
      step: 'delivery',
      hrefKind: 'delivery',
    }
  }
  return {
    id: 'delivery',
    label: 'Stores',
    detail: 'None',
    tone: input.distributorStatus === 'live' ? 'warn' : 'muted',
    step: 'delivery',
    hrefKind: 'delivery',
  }
}

function collabChip(collab: PipelineCollabMeta | null | undefined): IntegrationChip {
  if (!collab || (collab.collaboratorCount <= 0 && !collab.pendingReviews)) {
    return {
      id: 'collab',
      label: 'Collab',
      detail: 'None',
      tone: 'muted',
      hrefKind: 'collab',
    }
  }
  if (collab.pendingReviews > 0) {
    return {
      id: 'collab',
      label: 'Collab',
      detail: `${collab.pendingReviews} pending`,
      tone: 'warn',
      hrefKind: 'collab',
    }
  }
  return {
    id: 'collab',
    label: 'Collab',
    detail: `${collab.collaboratorCount} party`,
    tone: 'ok',
    hrefKind: 'collab',
  }
}

function marketingChip(input: PipelineIntegrationInput): IntegrationChip {
  const campaign = Boolean(input.hasCampaign)
  const link = Boolean(input.hasSmartLink)
  if (campaign && link) {
    return {
      id: 'marketing',
      label: 'Marketing',
      detail: 'Campaign + link',
      tone: 'ok',
      step: 'launch',
      hrefKind: 'marketing',
    }
  }
  if (campaign || link) {
    return {
      id: 'marketing',
      label: 'Marketing',
      detail: campaign ? 'Campaign only' : 'Link only',
      tone: 'warn',
      step: 'launch',
      hrefKind: 'marketing',
    }
  }
  return {
    id: 'marketing',
    label: 'Marketing',
    detail: 'Not launched',
    tone: 'muted',
    step: 'launch',
    hrefKind: 'marketing',
  }
}

function pressChip(input: PipelineIntegrationInput): IntegrationChip {
  if (input.hasPress) {
    return {
      id: 'press',
      label: 'Press',
      detail: input.copyFilled ? `${input.copyFilled} fields` : 'Ready',
      tone: 'ok',
      step: 'copy',
      hrefKind: 'release',
    }
  }
  return {
    id: 'press',
    label: 'Press',
    detail: 'Needed',
    tone: 'warn',
    step: 'copy',
    hrefKind: 'release',
  }
}

/** Cross-release integration chips for Pipeline Ops / Marketing rows. */
export function buildPipelineIntegrationChips(
  input: PipelineIntegrationInput
): IntegrationChip[] {
  return [
    marketingChip(input),
    pressChip(input),
    deliveryChip(input),
    dspIngestChip(input.copyright),
    contractsChip(input.copyright),
    ugcChip(input.copyright),
    collabChip(input.collab),
  ]
}

export type PipelineIntegrationAlerts = {
  dsp_gap_count: number
  ugc_queued_count: number
  collab_pending_count: number
  contracts_open_count: number
  stores_empty_count: number
}

export function summarizePipelineIntegrationAlerts(
  rows: PipelineIntegrationInput[]
): PipelineIntegrationAlerts {
  let dsp_gap_count = 0
  let ugc_queued_count = 0
  let collab_pending_count = 0
  let contracts_open_count = 0
  let stores_empty_count = 0

  for (const row of rows) {
    if (row.copyright && row.copyright.checks?.dsp_ingest_passed === false) dsp_gap_count += 1
    if (row.copyright?.ugc_pack?.opted_in && row.copyright.ugc_pack.status !== 'live') {
      ugc_queued_count += 1
    }
    const pending = row.collab?.pendingReviews ?? 0
    if (pending > 0) collab_pending_count += pending
    if (row.copyright && row.copyright.checks?.contracts_approved === false) {
      contracts_open_count += 1
    }
    if ((row.storeLiveCount ?? row.storeLinkCount ?? 0) === 0 && (row.targetStoreCount ?? 0) === 0) {
      if (row.distributorStatus !== 'live') stores_empty_count += 1
    }
  }

  return {
    dsp_gap_count,
    ugc_queued_count,
    collab_pending_count,
    contracts_open_count,
    stores_empty_count,
  }
}

/** Extra risk points from new integrations (capped by caller). */
export function integrationRiskBoost(input: PipelineIntegrationInput, etaDays: number): number {
  let boost = 0
  if (input.copyright && input.copyright.checks?.dsp_ingest_passed === false && etaDays <= 21) {
    boost += 15
  }
  if (input.copyright?.ugc_pack?.opted_in && input.copyright.ugc_pack.status !== 'live') {
    boost += 5
  }
  if ((input.collab?.pendingReviews ?? 0) > 0) {
    boost += 10
  }
  if (
    input.copyright &&
    input.copyright.checks?.contracts_approved === false &&
    (input.copyright.party_contacts?.length ?? 0) === 0 &&
    etaDays <= 14
  ) {
    boost += 8
  }
  return boost
}

export function nextActionStep(
  copyright: PipelineCopyrightSlice | CopyrightReadiness | null | undefined
): WorkflowStepId {
  return workflowStepForActionKind(copyright?.next_best_action?.kind)
}
