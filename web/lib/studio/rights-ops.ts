import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import {
  equalSplitPercentages,
  normalizeSplitRows,
  type SplitRow,
} from '@/lib/studio/import-parse'
import { namesForRole, parseContributors } from '@/lib/studio/track-credits'
import { knownLegalName, seedWriterLegalRows } from '@/lib/studio/songwriter'
import { workflowStepForActionKind } from '@/lib/studio/studio-ia'
import type { WorkflowStepId } from '@/lib/studio/constants'
import {
  resolveCopyrightActionTarget,
  type RightsActionSection,
} from '@/lib/studio/rights-action-target'

export const DEFAULT_PUBLISHER = 'SERGIK Music'
const SERGIK_NAMES = new Set(['sergik', 'sergik music'])

export type RightsTrackLike = {
  id?: string
  title?: string
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

export type SplitSummary = {
  total: number | null
  ok: boolean
  names: string[]
  label: string
}

export type RightsRun =
  | 'assign_isrcs'
  | 'seed_splits'
  | 'open_cover'
  | 'open_pro'
  | 'open_contracts'
  | 'declare_no_samples'

export type RightsMove = {
  label: string
  step: WorkflowStepId
  patch?: Record<string, boolean | string>
  focus?: RightsActionSection
  trackId?: string
  party?: string
  run?: RightsRun
}

export function publisherFromAlbumArtist(albumArtist?: string | null): string {
  const head = String(albumArtist || 'SERGIK')
    .split(/\s+(?:feat\.?|ft\.?|x)\s+|,/i)[0]
    .trim() || 'SERGIK'
  if (/music$/i.test(head)) return head
  return `${head} Music`
}

export function summarizeSplits(raw: unknown): SplitSummary {
  const rows = normalizeSplitRows(raw)
  if (!rows.length) {
    return { total: null, ok: false, names: [], label: 'No splits' }
  }
  let total = 0
  const names: string[] = []
  for (const row of rows) {
    if (row.name) names.push(row.name)
    total += row.percentage
  }
  const ok = Math.abs(total - 100) < 0.01 && names.length > 0
  const parts = rows
    .filter((row) => row.name)
    .map((row) => {
      const legal = row.legal_name ? ` (${row.legal_name})` : ''
      return `${row.name}${legal} ${Math.round(row.percentage * 100) / 100}%`
    })
  return {
    total,
    ok,
    names,
    label: parts.length ? `${parts.join(' / ')} · ${Math.round(total)}%` : `${Math.round(total)}%`,
  }
}

export function splitsReady(tracks: RightsTrackLike[]): boolean {
  return tracks.length > 0 && tracks.every((track) => summarizeSplits(track.splits).ok)
}

export function sergikOnlySplits(tracks: RightsTrackLike[]): boolean {
  if (!tracks.length) return false
  return tracks.every((track) => {
    const summary = summarizeSplits(track.splits)
    return summary.ok && summary.names.every((name) => SERGIK_NAMES.has(name.toLowerCase()))
  })
}

export function suggestedSergikPaperwork(
  tracks: RightsTrackLike[],
  ops: Pick<CopyrightReadiness['ops'], 'split_sheet_status' | 'producer_agreement_status'>,
): Record<string, string> | null {
  if (!sergikOnlySplits(tracks)) return null
  const patch: Record<string, string> = {}
  if (ops.split_sheet_status !== 'approved') patch.split_sheet_status = 'approved'
  if (ops.producer_agreement_status !== 'approved') patch.producer_agreement_status = 'approved'
  return Object.keys(patch).length ? patch : null
}

export function billedSplitOwners(contributors: unknown): string[] {
  const names = namesForRole(parseContributors(contributors), 'primary')
  return names.length ? names : ['SERGIK']
}

export function splitsCoverBilled(raw: unknown, contributors: unknown): boolean {
  const owners = billedSplitOwners(contributors).map((name) => name.toLowerCase())
  const names = new Set(summarizeSplits(raw).names.map((name) => name.toLowerCase()))
  return owners.length > 0 && owners.every((name) => names.has(name))
}

export function splitsFromCredits(
  contributors: unknown,
  writerLegal?: unknown,
): SplitRow[] {
  const billed = billedSplitOwners(contributors)
  const legalRows = seedWriterLegalRows(contributors, writerLegal)
  const legalByStage = new Map(legalRows.map((row) => [row.stage.toLowerCase(), row.legal]))
  const percents = equalSplitPercentages(billed.length)
  return billed.map((name, index) => ({
    name,
    percentage: percents[index] ?? 0,
    legal_name: legalByStage.get(name.toLowerCase()) || knownLegalName(name) || null,
    role: 'performer',
    publisher: SERGIK_NAMES.has(name.toLowerCase()) ? DEFAULT_PUBLISHER : null,
    ipi: null,
    pro: null,
  }))
}

export function enrichSplitSheet(
  raw: unknown,
  contributors: unknown,
  writerLegal?: unknown,
): SplitRow[] {
  const current = normalizeSplitRows(raw)
  const seeded = splitsFromCredits(contributors, writerLegal)
  if (!current.length) return seeded
  const byName = new Map(current.map((row) => [row.name.toLowerCase(), row]))
  const missing = seeded.filter((row) => !byName.has(row.name.toLowerCase()))
  if (missing.length && current.length === 1 && SERGIK_NAMES.has(current[0].name.toLowerCase())) {
    return seeded
  }
  const legalByStage = new Map(
    seedWriterLegalRows(contributors, writerLegal).map((row) => [row.stage.toLowerCase(), row.legal]),
  )
  const merged = current.map((row) => ({
    ...row,
    legal_name: row.legal_name || legalByStage.get(row.name.toLowerCase()) || knownLegalName(row.name) || null,
    role: row.role || 'performer',
    publisher: row.publisher || (SERGIK_NAMES.has(row.name.toLowerCase()) ? DEFAULT_PUBLISHER : null),
  }))
  return missing.length ? [...merged, ...missing.map((row) => ({ ...row, percentage: 0 }))] : merged
}

export function tracksNeedingSplitSeed(tracks: RightsTrackLike[]): RightsTrackLike[] {
  return tracks.filter(
    (track) =>
      Boolean(track.id) &&
      (!summarizeSplits(track.splits).ok || !splitsCoverBilled(track.splits, track.contributors)),
  )
}

export function originalsWithoutSamples(tracks: RightsTrackLike[]): boolean {
  return (
    tracks.length > 0 &&
    tracks.every((track) => {
      const origin = String(track.origin || 'original').toLowerCase()
      return origin !== 'cover' && !track.contains_samples
    })
  )
}

export function suggestedNoSamplesClearance(
  tracks: RightsTrackLike[],
  ops: Pick<CopyrightReadiness['ops'], 'sample_clearance_status'>,
): Record<string, string> | null {
  if (ops.sample_clearance_status === 'approved') return null
  if (!originalsWithoutSamples(tracks)) return null
  return { sample_clearance_status: 'approved' }
}

export function coverPacketGaps(tracks: RightsTrackLike[]): RightsTrackLike[] {
  return tracks.filter((track) => {
    if (String(track.origin || '').toLowerCase() !== 'cover') return false
    return !String(track.cover_original_title || '').trim() || !String(track.cover_original_artist || '').trim() || track.mechanical_licensed !== true
  })
}

export function proPacketStatus(
  tracks: RightsTrackLike[],
  rights: Pick<CopyrightReadiness['rights'], 'publisher_name' | 'writer_ipi'>,
): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (!tracks.length) missing.push('Add tracks')
  if (tracks.some((track) => !track.isrc_full)) missing.push('Assign ISRCs')
  if (!String(rights.publisher_name || '').trim()) missing.push('Set publisher')
  const writers = tracks.some((track) => {
    if (String(track.writer_legal_names || '').trim()) return true
    return namesForRole(parseContributors(track.contributors), 'writer').length > 0
  })
  if (tracks.length && !writers) missing.push('Add writer credits')
  return { ok: missing.length === 0, missing }
}

export function resolveNextRightsMove(
  readiness: Pick<CopyrightReadiness, 'next_best_action' | 'checks' | 'ops' | 'rights'>,
  tracks: RightsTrackLike[] = [],
): RightsMove {
  const action = readiness.next_best_action
  const step = workflowStepForActionKind(action.kind)

  if (action.kind === 'assign_isrc') {
    return { label: 'Assign missing ISRC codes', step: 'rights', run: 'assign_isrcs' }
  }
  if (action.kind === 'fix_splits') {
    return { label: 'Seed splits from Catalog credits', step: 'rights', run: 'seed_splits' }
  }

  if (
    readiness.checks.tracks_have_isrc &&
    readiness.checks.splits_total_100 &&
    !readiness.checks.contracts_approved
  ) {
    const paperwork = suggestedSergikPaperwork(tracks, readiness.ops)
    if (paperwork) {
      return {
        label: 'Approve SERGIK-only split & producer paperwork',
        step: 'rights',
        patch: paperwork,
      }
    }
    const noSamples = suggestedNoSamplesClearance(tracks, readiness.ops)
    if (noSamples) {
      return {
        label: 'Declare originals have no uncleared samples',
        step: 'rights',
        patch: noSamples,
        run: 'declare_no_samples',
      }
    }
    return {
      label: 'Review & approve clearance packets',
      step: 'rights',
      run: 'open_contracts',
      focus: 'contracts',
    }
  }

  if (!readiness.rights.publisher_name && readiness.checks.splits_total_100 && readiness.checks.tracks_have_isrc) {
    return {
      label: `Fill publisher as ${DEFAULT_PUBLISHER}`,
      step: 'rights',
      patch: { publisher_name: DEFAULT_PUBLISHER },
      focus: 'publisher',
    }
  }

  if (
    action.kind === 'register_composition' ||
    action.kind === 'register_master' ||
    action.kind === 'register_pro'
  ) {
    return { label: 'Open PRO / SoundExchange packet', step: 'rights', run: 'open_pro', focus: 'pro' }
  }

  if (action.field) {
    return { label: action.label, step: 'rights', patch: { [action.field]: true } }
  }

  if (action.kind === 'complete_dsp_ingest') {
    const target = resolveCopyrightActionTarget({
      kind: action.kind,
      label: action.label,
      field: action.field,
      issue_id: action.issue_id,
    })
    if (target.section === 'cover') {
      const gap = coverPacketGaps(tracks)[0]
      return {
        label: action.label,
        step: 'rights',
        run: 'open_cover',
        focus: 'cover',
        trackId: target.trackId || gap?.id,
      }
    }
    if (target.step !== 'rights') {
      return {
        label: action.label,
        step: target.step,
        focus: target.section,
        trackId: target.trackId,
        party: target.party,
      }
    }
    return {
      label: action.label,
      step: 'rights',
      focus: target.section,
      trackId: target.trackId,
      party: target.party,
    }
  }

  if (action.kind === 'ready') {
    return { label: 'Continue to Launch', step: 'launch' }
  }

  return { label: action.label, step }
}

export function publisherApplyPatch(
  track: RightsTrackLike,
  publisher: { name: string; ipi?: string | null },
): Record<string, string | null> | null {
  const nextName = track.publisher_name?.trim() || publisher.name
  const nextIpi = track.publisher_ipi?.trim() || publisher.ipi?.trim() || null
  if (track.publisher_name === nextName && (track.publisher_ipi || null) === nextIpi) return null
  return { publisher_name: nextName, publisher_ipi: nextIpi }
}

function snapshotObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) }
  return {}
}

export function mergeRightsPacketSnapshot(
  currentSnapshot: unknown,
  packet: { mechanical_licensed?: boolean | null; contains_samples?: boolean | null },
): Record<string, unknown> {
  const snap = snapshotObject(currentSnapshot)
  if (typeof packet.mechanical_licensed === 'boolean') snap.mechanical_licensed = packet.mechanical_licensed
  if (typeof packet.contains_samples === 'boolean') snap.contains_samples = packet.contains_samples
  return snap
}

export function hydrateRightsPacket<T extends Record<string, unknown>>(track: T): T & {
  mechanical_licensed: boolean | null
  contains_samples: boolean | null
} {
  const snap = snapshotObject(track.sonic_snapshot)
  const mechanical =
    typeof track.mechanical_licensed === 'boolean'
      ? track.mechanical_licensed
      : typeof snap.mechanical_licensed === 'boolean'
        ? snap.mechanical_licensed
        : null
  const samples =
    typeof track.contains_samples === 'boolean'
      ? track.contains_samples
      : typeof snap.contains_samples === 'boolean'
        ? snap.contains_samples
        : false
  return { ...track, mechanical_licensed: mechanical, contains_samples: samples }
}

export function buildProPacketText(opts: {
  releaseTitle?: string
  albumArtist?: string | null
  publisherName?: string | null
  publisherIpi?: string | null
  writerIpi?: string | null
  tracks: RightsTrackLike[]
}): string {
  const lines = [
    `PRO / SoundExchange packet — ${opts.releaseTitle || 'Untitled'}`,
    `Album artist: ${opts.albumArtist || 'SERGIK'}`,
    `Publisher: ${[opts.publisherName || 'SERGIK Music', opts.publisherIpi ? `IPI ${opts.publisherIpi}` : '']
      .filter(Boolean)
      .join(' · ')}`,
    `Writer IPI: ${opts.writerIpi || '—'}`,
    '',
    'Tracks:',
  ]
  for (const track of opts.tracks) {
    const writers = seedWriterLegalRows(track.contributors, track.writer_legal_names)
    const writerLine =
      writers
        .map((row) => (row.legal ? `${row.stage} (${row.legal})` : row.stage))
        .join(', ') || namesForRole(parseContributors(track.contributors), 'writer').join(', ') || '—'
    lines.push(
      `- ${track.title || 'Untitled'} · ISRC ${track.isrc_full || '—'} · ISWC ${track.iswc || '—'} · writers ${writerLine}`,
    )
  }
  return lines.join('\n')
}
