import {
  DEFAULT_UGC_PACK,
  parseUgcPack,
  ugcPackEligibility,
  type UgcPack,
  type UgcPackEligibility,
} from '@/lib/studio/ugc-pack'
import {
  evaluateReleaseIngest,
  type DspIngestResult,
} from '@/lib/studio/dsp-ingest'
import { hydrateRightsPacket, publisherFromAlbumArtist } from '@/lib/studio/rights-ops'
import { parsePartyContacts } from '@/lib/studio/rights-contract-send'
import {
  parseRightsPacketDrafts,
  type RightsPacketDrafts,
} from '@/lib/studio/rights-packet-drafts'
import {
  ensureProducerCredits,
  namesForRole,
  parseContributors,
} from '@/lib/studio/track-credits'

type DistributionRelease = {
  id: string
  upc: string | null
  distributor_status: string | null
  title?: string | null
  artwork_url?: string | null
  genre?: string | null
  subgenre?: string | null
  release_date?: string | null
  previously_released?: boolean | null
  previous_isrc?: string | null
  previous_upc?: string | null
  language?: string | null
  youtube_artist_id?: string | null
  instagram_handle?: string | null
  facebook_page_id?: string | null
  ingest_attestations?: unknown
  artwork_owned?: boolean | null
  album_artist?: string | null
  marketing_copy?: Record<string, unknown> | null
}

type DistributionTrack = {
  id: string
  release_id: string
  title: string
  wav_url: string | null
  isrc_full: string | null
  splits: unknown
  contributors?: unknown
  version?: string | null
  origin?: string | null
  cover_original_title?: string | null
  cover_original_artist?: string | null
  writer_legal_names?: string | null
  ai_generated?: boolean | null
  radio_edit?: boolean | null
  paired_explicit_isrc?: string | null
  preview_start_seconds?: number | null
  explicit?: boolean | null
  mechanical_licensed?: boolean | null
  contains_samples?: boolean | null
}

type CopyrightChecklist = {
  release_id: string
  rights_intake_complete: boolean
  legal_locked: boolean
  composition_registered: boolean
  master_registered: boolean
  pro_registered: boolean
  monitoring_enabled: boolean
  owner_name: string | null
  role_queue: 'a_and_r' | 'legal' | 'metadata' | 'marketing' | null
  split_sheet_status: 'missing' | 'pending' | 'approved' | null
  producer_agreement_status: 'missing' | 'pending' | 'approved' | null
  sample_clearance_status: 'missing' | 'pending' | 'approved' | null
  due_date: string | null
  ugc_pack?: unknown
  party_contacts?: unknown
  rights_packets?: unknown
  publisher_name: string | null
  publisher_ipi: string | null
  writer_ipi: string | null
  updated_at?: string
}

export type CopyrightStage =
  | 'draft'
  | 'rights_intake'
  | 'legal_locked'
  | 'registered'
  | 'metadata_qa'
  | 'ready_to_distribute'
  | 'released'
  | 'monitoring'

export type CopyrightReadiness = {
  stage: CopyrightStage
  readiness_score: number
  stage_age_days: number
  next_best_action: {
    kind:
      | 'assign_tracks'
      | 'upload_audio'
      | 'assign_isrc'
      | 'fix_splits'
      | 'set_upc'
      | 'complete_rights_intake'
      | 'complete_legal_lock'
      | 'register_composition'
      | 'register_master'
      | 'register_pro'
      | 'enable_monitoring'
      | 'complete_dsp_ingest'
      | 'ready'
    label: string
    field: string | null
    issue_id?: string | null
  }
  ops: {
    owner_name: string | null
    role_queue: 'a_and_r' | 'legal' | 'metadata' | 'marketing' | null
    split_sheet_status: 'missing' | 'pending' | 'approved' | null
    producer_agreement_status: 'missing' | 'pending' | 'approved' | null
    sample_clearance_status: 'missing' | 'pending' | 'approved' | null
    due_date: string | null
  }
  rights: {
    publisher_name: string | null
    publisher_ipi: string | null
    writer_ipi: string | null
  }
  party_contacts: Array<{ stage: string; email: string }>
  rights_packets: RightsPacketDrafts
  blockers: string[]
  actions: Array<{
    kind: CopyrightReadiness['next_best_action']['kind']
    label: string
    field: string | null
    issue_id?: string | null
  }>
  checks: {
    has_tracks: boolean
    tracks_have_audio: boolean
    tracks_have_isrc: boolean
    splits_total_100: boolean
    has_upc: boolean
    rights_intake_complete: boolean
    legal_locked: boolean
    legal_lock_ready: boolean
    contracts_approved: boolean
    composition_registered: boolean
    master_registered: boolean
    pro_registered: boolean
    metadata_qa_passed: boolean
    dsp_ingest_passed: boolean
    ready_to_distribute: boolean
    released: boolean
    monitoring_enabled: boolean
  }
  ugc_pack: UgcPack
  ugc: UgcPackEligibility
  ingest: DspIngestResult
}

const DEFAULT_CHECKLIST: Omit<CopyrightChecklist, 'release_id'> = {
  rights_intake_complete: false,
  legal_locked: false,
  composition_registered: false,
  master_registered: false,
  pro_registered: false,
  monitoring_enabled: false,
  owner_name: null,
  role_queue: 'legal',
  split_sheet_status: 'missing',
  producer_agreement_status: 'missing',
  sample_clearance_status: 'missing',
  due_date: null,
  ugc_pack: DEFAULT_UGC_PACK,
  party_contacts: [],
  rights_packets: {},
  publisher_name: null,
  publisher_ipi: null,
  writer_ipi: null,
}

function readSplitsTotal(rawSplits: unknown): number | null {
  if (!Array.isArray(rawSplits)) return null
  let total = 0
  for (const split of rawSplits) {
    if (!split || typeof split !== 'object') continue
    const value = (split as { percentage?: unknown }).percentage
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric)) total += numeric
  }
  return total
}

function buildReadiness(
  release: DistributionRelease,
  tracks: DistributionTrack[],
  checklist: CopyrightChecklist,
  opts: { artworkReused?: boolean; ingestEnabled?: boolean; storeLinkCount?: number } = {},
): CopyrightReadiness {
  const hasTracks = tracks.length > 0
  const tracksHaveAudio = hasTracks && tracks.every((t) => Boolean(t.wav_url))
  const tracksHaveIsrc = hasTracks && tracks.every((t) => Boolean(t.isrc_full))
  const splitsTotals = tracks.map((t) => readSplitsTotal(t.splits))
  const splitsTotal100 =
    hasTracks &&
    splitsTotals.every(
      (total) => total !== null && Math.abs(total - 100) < 0.001
    )
  const hasUpc = Boolean(release.upc && release.upc.trim().length > 0)
  const metadataQaPassed =
    hasTracks && tracksHaveAudio && tracksHaveIsrc && splitsTotal100 && hasUpc
  const contractsApproved =
    checklist.split_sheet_status === 'approved' &&
    checklist.producer_agreement_status === 'approved' &&
    checklist.sample_clearance_status === 'approved'

  const ingestEnabled = opts.ingestEnabled !== false
  const marketingCopy =
    release.marketing_copy && typeof release.marketing_copy === 'object'
      ? release.marketing_copy
      : null
  const ingest = ingestEnabled
    ? evaluateReleaseIngest(
        {
          ...release,
          stream_continuity: marketingCopy?._stream_continuity ?? null,
          store_link_count: opts.storeLinkCount ?? null,
        },
        tracks,
        { artworkReused: opts.artworkReused },
      )
    : {
        ok: true,
        blockers: [] as string[],
        warnings: [] as string[],
        issues: [],
        checks: {
          titles_clean: true,
          apple_credits: true,
          legal_writers: true,
          collab_splits: true,
          ai_declared: true,
          origin_ok: true,
          previously_released_declared: true,
          attestations_complete: true,
          artwork_policy: true,
          dsp_genre: true,
          artist_profiles: true,
          street_date_lead: true,
          preview_clip: true,
          radio_pair: true,
          stream_continuity_masters: true,
          stream_continuity_isrcs: true,
        },
      }
  const dspIngestPassed = ingest.ok
  const legalLockReady =
    checklist.rights_intake_complete &&
    contractsApproved &&
    ingest.checks.attestations_complete

  const released = (release.distributor_status || 'draft') !== 'draft'
  const readyToDistribute =
    checklist.rights_intake_complete &&
    checklist.legal_locked &&
    contractsApproved &&
    checklist.composition_registered &&
    checklist.master_registered &&
    checklist.pro_registered &&
    metadataQaPassed &&
    dspIngestPassed

  const blockers: string[] = []
  const blockerActions: Array<{
    kind: CopyrightReadiness['next_best_action']['kind']
    label: string
    field: string | null
    issue_id?: string | null
  }> = []
  if (!hasTracks) {
    blockers.push('Add at least one track to the release.')
    blockerActions.push({
      kind: 'assign_tracks',
      label: 'Add tracks to this release',
      field: null,
    })
  }
  if (!tracksHaveAudio) {
    blockers.push('Every track must include a WAV file.')
    blockerActions.push({
      kind: 'upload_audio',
      label: 'Upload missing WAV files',
      field: null,
    })
  }
  if (!tracksHaveIsrc) {
    blockers.push('Assign ISRC codes to all tracks.')
    blockerActions.push({
      kind: 'assign_isrc',
      label: 'Assign missing ISRC codes',
      field: null,
    })
  }
  if (!splitsTotal100) {
    blockers.push('Track splits must total 100% for every track.')
    blockerActions.push({
      kind: 'fix_splits',
      label: 'Fix track split percentages',
      field: null,
    })
  }
  if (!hasUpc) {
    blockers.push('Set a UPC for this release.')
    blockerActions.push({
      kind: 'set_upc',
      label: 'Set release UPC',
      field: null,
    })
  }
  if (!checklist.rights_intake_complete) {
    blockers.push('Complete rights intake.')
    blockerActions.push({
      kind: 'complete_rights_intake',
      label: 'Mark rights intake complete',
      field: 'rights_intake_complete',
    })
  }
  if (!checklist.legal_locked) {
    if (legalLockReady) {
      blockers.push('Legal lock is not complete.')
      blockerActions.push({
        kind: 'complete_legal_lock',
        label: 'Lock this package',
        field: 'legal_locked',
      })
    }
  }
  if (!contractsApproved) {
    blockers.push('All contract statuses must be approved.')
    blockerActions.push({
      kind: 'complete_legal_lock',
      label: 'Approve split, producer, and clearance contracts',
      field: null,
    })
  }
  if (!checklist.composition_registered) {
    blockers.push('Composition copyright is not registered.')
    blockerActions.push({
      kind: 'register_composition',
      label: 'Open composition registration packet',
      field: null,
    })
  }
  if (!checklist.master_registered) {
    blockers.push('Master copyright is not registered.')
    blockerActions.push({
      kind: 'register_master',
      label: 'Open master registration packet',
      field: null,
    })
  }
  if (!checklist.pro_registered) {
    blockers.push('PRO registration is not complete.')
    blockerActions.push({
      kind: 'register_pro',
      label: 'Open PRO / SoundExchange packet',
      field: null,
    })
  }
  if (!dspIngestPassed) {
    for (const label of ingest.blockers.slice(0, 6)) blockers.push(label)
    const hardIssues = ingest.issues.filter((item) => item.hard)
    const slots = Math.max(1, 6 - blockerActions.length)
    const issueActions = (hardIssues.length ? hardIssues : [{ id: '', label: ingest.blockers[0] || 'Complete DSP ingest fields', hard: true as const }]).slice(
      0,
      slots,
    )
    for (const issue of issueActions) {
      blockerActions.push({
        kind: 'complete_dsp_ingest',
        label: issue.label,
        field: null,
        issue_id: issue.id || null,
      })
    }
  }

  let stage: CopyrightStage = 'draft'
  if (checklist.rights_intake_complete) stage = 'rights_intake'
  if (checklist.legal_locked) stage = 'legal_locked'
  if (
    checklist.composition_registered &&
    checklist.master_registered &&
    checklist.pro_registered
  ) {
    stage = 'registered'
  }
  if (metadataQaPassed) stage = 'metadata_qa'
  if (readyToDistribute) stage = 'ready_to_distribute'
  if (released) stage = 'released'
  if (released && checklist.monitoring_enabled) stage = 'monitoring'

  const scoreChecks = [
    hasTracks,
    tracksHaveAudio,
    tracksHaveIsrc,
    splitsTotal100,
    hasUpc,
    checklist.rights_intake_complete,
    checklist.legal_locked,
    contractsApproved,
    checklist.composition_registered,
    checklist.master_registered,
    checklist.pro_registered,
    metadataQaPassed,
    dspIngestPassed,
  ]
  const readinessScore = Math.round(
    (scoreChecks.filter(Boolean).length / scoreChecks.length) * 100
  )
  const stageAgeDays = checklist.updated_at
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(checklist.updated_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0
  const nextBestAction =
    blockerActions[0] ||
    (released && !checklist.monitoring_enabled
      ? {
          kind: 'enable_monitoring' as const,
          label: 'Enable post-release monitoring',
          field: 'monitoring_enabled',
        }
      : {
          kind: 'ready' as const,
          label: 'Release is ready for distribution',
          field: null,
        })

  const pack = parseUgcPack(checklist.ugc_pack)
  const partyContacts = parsePartyContacts(checklist.party_contacts)
  const rightsPackets = parseRightsPacketDrafts(checklist.rights_packets)
  const eligibility = ugcPackEligibility({
    pack,
    sampleClearance: checklist.sample_clearance_status,
    masterRegistered: checklist.master_registered,
    compositionRegistered: checklist.composition_registered,
  })

  return {
    stage,
    readiness_score: readinessScore,
    stage_age_days: stageAgeDays,
    next_best_action: nextBestAction,
    ops: {
      owner_name: checklist.owner_name,
      role_queue: checklist.role_queue,
      split_sheet_status: checklist.split_sheet_status,
      producer_agreement_status: checklist.producer_agreement_status,
      sample_clearance_status: checklist.sample_clearance_status,
      due_date: checklist.due_date,
    },
    rights: {
      publisher_name: checklist.publisher_name,
      publisher_ipi: checklist.publisher_ipi,
      writer_ipi: checklist.writer_ipi,
    },
    party_contacts: partyContacts,
    rights_packets: rightsPackets,
    blockers,
    actions: blockerActions,
    checks: {
      has_tracks: hasTracks,
      tracks_have_audio: tracksHaveAudio,
      tracks_have_isrc: tracksHaveIsrc,
      splits_total_100: splitsTotal100,
      has_upc: hasUpc,
      rights_intake_complete: checklist.rights_intake_complete,
      legal_locked: checklist.legal_locked,
      legal_lock_ready: legalLockReady,
      contracts_approved: contractsApproved,
      composition_registered: checklist.composition_registered,
      master_registered: checklist.master_registered,
      pro_registered: checklist.pro_registered,
      metadata_qa_passed: metadataQaPassed,
      dsp_ingest_passed: dspIngestPassed,
      ready_to_distribute: readyToDistribute,
      released,
      monitoring_enabled: checklist.monitoring_enabled,
    },
    ugc_pack: pack,
    ugc: eligibility,
    ingest,
  }
}

const CHECKLIST_SELECT =
  'release_id, rights_intake_complete, legal_locked, composition_registered, master_registered, pro_registered, monitoring_enabled, owner_name, role_queue, split_sheet_status, producer_agreement_status, sample_clearance_status, due_date, ugc_pack, party_contacts, rights_packets, publisher_name, publisher_ipi, writer_ipi, updated_at'

const CHECKLIST_SELECT_LEGACY =
  'release_id, rights_intake_complete, legal_locked, composition_registered, master_registered, pro_registered, monitoring_enabled, owner_name, role_queue, split_sheet_status, producer_agreement_status, sample_clearance_status, due_date, updated_at'

async function fetchCopyrightChecklists(supabase: any, releaseIds: string[]) {
  const withPack = await supabase
    .from('release_copyright_checklists')
    .select(CHECKLIST_SELECT)
    .in('release_id', releaseIds)

  if (!withPack.error) return withPack

  const message = String(withPack.error.message || '')
  const missingContacts = /party_contacts/i.test(message)
  if (missingContacts) {
    const withoutContacts = await supabase
      .from('release_copyright_checklists')
      .select(
        'release_id, rights_intake_complete, legal_locked, composition_registered, master_registered, pro_registered, monitoring_enabled, owner_name, role_queue, split_sheet_status, producer_agreement_status, sample_clearance_status, due_date, ugc_pack, publisher_name, publisher_ipi, writer_ipi, updated_at',
      )
      .in('release_id', releaseIds)
    if (!withoutContacts.error) return withoutContacts
  }
  const missingPackets = /rights_packets/i.test(message)
  if (missingPackets) {
    const withoutPackets = await supabase
      .from('release_copyright_checklists')
      .select(
        'release_id, rights_intake_complete, legal_locked, composition_registered, master_registered, pro_registered, monitoring_enabled, owner_name, role_queue, split_sheet_status, producer_agreement_status, sample_clearance_status, due_date, ugc_pack, party_contacts, publisher_name, publisher_ipi, writer_ipi, updated_at',
      )
      .in('release_id', releaseIds)
    if (!withoutPackets.error) return withoutPackets
  }
  const missingPackColumn = /ugc_pack|publisher_name|publisher_ipi|writer_ipi|party_contacts|rights_packets/i.test(message)
  const missingTable = /release_copyright_checklists/i.test(message)
  if (!missingPackColumn && !missingTable) throw withPack.error
  if (missingTable) return withPack

  return supabase
    .from('release_copyright_checklists')
    .select(CHECKLIST_SELECT_LEGACY)
    .in('release_id', releaseIds)
}

export async function getCopyrightReadinessByReleaseIds(
  supabase: any,
  releaseIds: string[]
) {
  const uniqueIds = Array.from(new Set(releaseIds))
  if (uniqueIds.length === 0) return {}

  const TRACK_SELECT =
    'id, release_id, title, wav_url, isrc_full, splits, iswc, publisher_name, publisher_ipi, contributors, version, origin, cover_original_title, cover_original_artist, writer_legal_names, ai_generated, radio_edit, paired_explicit_isrc, preview_start_seconds, explicit, mechanical_licensed, contains_samples, sonic_snapshot'
  const TRACK_SELECT_NO_PACKET_COLS =
    'id, release_id, title, wav_url, isrc_full, splits, iswc, publisher_name, publisher_ipi, contributors, version, origin, cover_original_title, cover_original_artist, writer_legal_names, ai_generated, radio_edit, paired_explicit_isrc, preview_start_seconds, explicit, sonic_snapshot'
  const TRACK_SELECT_MID =
    'id, release_id, title, wav_url, isrc_full, splits, iswc, publisher_name, publisher_ipi'
  const TRACK_SELECT_LEGACY = 'id, release_id, title, wav_url, isrc_full, splits'
  const RELEASE_SELECT =
    'id, upc, distributor_status, title, artwork_url, genre, subgenre, release_date, previously_released, previous_isrc, previous_upc, language, youtube_artist_id, instagram_handle, facebook_page_id, ingest_attestations, artwork_owned, album_artist, marketing_copy'
  const RELEASE_SELECT_LEGACY = 'id, upc, distributor_status, title, artwork_url, genre, release_date, album_artist'

  let ingestEnabled = true
  let tracksResult = await supabase
    .from('distribution_tracks')
    .select(TRACK_SELECT)
    .in('release_id', uniqueIds)
  if (tracksResult.error && /mechanical_licensed|contains_samples/i.test(String(tracksResult.error.message || ''))) {
    tracksResult = await supabase
      .from('distribution_tracks')
      .select(TRACK_SELECT_NO_PACKET_COLS)
      .in('release_id', uniqueIds)
  }
  if (tracksResult.error && /origin|writer_legal_names|ai_generated|contributors|iswc|publisher|sonic_snapshot/i.test(String(tracksResult.error.message || ''))) {
    ingestEnabled = !/origin|writer_legal_names|ai_generated/i.test(String(tracksResult.error.message || ''))
    tracksResult = await supabase
      .from('distribution_tracks')
      .select(TRACK_SELECT_MID)
      .in('release_id', uniqueIds)
  }
  if (tracksResult.error && /iswc|publisher_name|publisher_ipi/i.test(String(tracksResult.error.message || ''))) {
    ingestEnabled = false
    tracksResult = await supabase
      .from('distribution_tracks')
      .select(TRACK_SELECT_LEGACY)
      .in('release_id', uniqueIds)
  }

  let releasesResult = await supabase
    .from('distribution_releases')
    .select(RELEASE_SELECT)
    .in('id', uniqueIds)
  if (releasesResult.error && /previously_released|ingest_attestations|youtube_artist_id|artwork_owned/i.test(String(releasesResult.error.message || ''))) {
    ingestEnabled = false
    releasesResult = await supabase
      .from('distribution_releases')
      .select(RELEASE_SELECT_LEGACY)
      .in('id', uniqueIds)
  }

  const [checklistResult, artworkResult, storeLinksResult] = await Promise.all([
    fetchCopyrightChecklists(supabase, uniqueIds),
    supabase
      .from('distribution_releases')
      .select('id, artwork_url')
      .not('artwork_url', 'is', null),
    supabase
      .from('distribution_store_links')
      .select('release_id')
      .in('release_id', uniqueIds),
  ])

  if (releasesResult.error) throw releasesResult.error
  if (tracksResult.error) throw tracksResult.error

  const checklistMissingTable =
    checklistResult.error &&
    checklistResult.error.message?.includes('release_copyright_checklists')
  if (checklistResult.error && !checklistMissingTable) throw checklistResult.error

  const releaseMap = new Map<string, DistributionRelease>()
  for (const release of releasesResult.data || []) {
    releaseMap.set(release.id, release)
  }

  const tracksByRelease: Record<string, DistributionTrack[]> = {}
  for (const id of uniqueIds) tracksByRelease[id] = []
  const producerHeals: Array<{ id: string; contributors: ReturnType<typeof ensureProducerCredits> }> =
    []
  for (const track of tracksResult.data || []) {
    if (!tracksByRelease[track.release_id]) tracksByRelease[track.release_id] = []
    const hydrated = hydrateRightsPacket(track as Record<string, unknown>) as DistributionTrack
    const existing = parseContributors(hydrated.contributors)
    if (!namesForRole(existing, 'producer').length && namesForRole(existing, 'primary').length) {
      const contributors = ensureProducerCredits(existing)
      producerHeals.push({ id: hydrated.id, contributors })
      hydrated.contributors = contributors
    }
    tracksByRelease[track.release_id].push(hydrated)
  }

  if (producerHeals.length) {
    await Promise.all(
      producerHeals.map((row) =>
        supabase
          .from('distribution_tracks')
          .update({ contributors: row.contributors })
          .eq('id', row.id),
      ),
    )
  }

  const checklistByRelease: Record<string, CopyrightChecklist> = {}
  for (const id of uniqueIds) {
    checklistByRelease[id] = { release_id: id, ...DEFAULT_CHECKLIST }
  }
  for (const row of checklistResult.data || []) {
    checklistByRelease[row.release_id] = {
      release_id: row.release_id,
      ...DEFAULT_CHECKLIST,
      ...row,
    }
  }

  const artworkCounts = new Map<string, number>()
  for (const row of artworkResult.data || []) {
    const url = String(row.artwork_url || '').trim()
    if (!url) continue
    artworkCounts.set(url, (artworkCounts.get(url) || 0) + 1)
  }

  const storeLinkCounts = new Map<string, number>()
  for (const row of storeLinksResult.data || []) {
    const id = String(row.release_id || '')
    if (!id) continue
    storeLinkCounts.set(id, (storeLinkCounts.get(id) || 0) + 1)
  }

  const readinessByRelease: Record<string, CopyrightReadiness> = {}
  for (const id of uniqueIds) {
    const release = releaseMap.get(id)
    if (!release) continue
    const artUrl = String(release.artwork_url || '').trim()
    readinessByRelease[id] = buildReadiness(
      release,
      tracksByRelease[id] || [],
      checklistByRelease[id],
      {
        ingestEnabled,
        artworkReused: Boolean(artUrl && (artworkCounts.get(artUrl) || 0) > 1),
        storeLinkCount: storeLinkCounts.get(id) || 0,
      },
    )
  }

  return readinessByRelease
}

export async function getSingleReleaseCopyrightReadiness(
  supabase: any,
  releaseId: string
) {
  const readinessByRelease = await getCopyrightReadinessByReleaseIds(supabase, [
    releaseId,
  ])
  return readinessByRelease[releaseId] || null
}

export async function seedCopyrightChecklistDefaults(
  supabase: any,
  releaseId: string,
  copyright: CopyrightReadiness | null,
  opts: { ownerName?: string | null; albumArtist?: string | null } = {},
): Promise<CopyrightReadiness | null> {
  if (!copyright) return copyright
  const patch: Record<string, unknown> = {}
  const owner = String(opts.ownerName || '').trim()
  if (!copyright.ops.owner_name && owner) {
    patch.owner_name = owner
    patch.role_queue = copyright.ops.role_queue || 'legal'
  }
  if (!copyright.rights.publisher_name) {
    patch.publisher_name = publisherFromAlbumArtist(opts.albumArtist)
  }
  if (copyright.checks.legal_lock_ready && !copyright.checks.legal_locked) {
    patch.legal_locked = true
    patch.role_queue = 'legal'
  }
  if (!Object.keys(patch).length) return copyright
  const { error } = await supabase.from('release_copyright_checklists').upsert(
    { release_id: releaseId, ...patch },
    { onConflict: 'release_id' },
  )
  if (error) return copyright
  return (await getSingleReleaseCopyrightReadiness(supabase, releaseId)) || copyright
}
