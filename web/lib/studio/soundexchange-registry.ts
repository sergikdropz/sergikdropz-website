import { createSupabaseServerClient } from '@/lib/supabase'
import {
  US_ISRC_REGISTRANT,
  buildUsisrcLockerCsv,
  currentIsrcYear,
  durationToSeconds,
  formatISRC,
  formatISRCDisplay,
  resolveIsrcPrefix,
  resolveSoundExchangeAccountId,
} from '@/lib/studio/isrc-format'
import {
  artistFromContributors,
  createSoundExchangeClient,
  latestSubmissionByIsrc,
  mergeRegistryStats,
  normalizeIsrcInput,
  soundExchangeConfigured,
  SX_DIRECT_HOME,
  trackToSxDirectSubmission,
  type LocalIsrcHit,
  type RegistryTrackRow,
  type SoundExchangeMode,
  type SoundExchangeSubmissionStatus,
} from '@/lib/studio/soundexchange'

type TrackRow = {
  id: string
  title: string
  version?: string | null
  duration?: number | null
  explicit?: boolean | null
  isrc_full?: string | null
  contributors?: unknown
  release_id?: string | null
}

type ReleaseRow = {
  id: string
  title?: string | null
  release_date?: string | null
  genre?: string | null
  album_artist?: string | null
}

type SubmissionRow = {
  id: string
  track_id?: string | null
  isrc: string
  status: SoundExchangeSubmissionStatus
  submitted_at?: string | null
  created_at?: string | null
  error?: string | null
  response?: unknown
}

export type EnrichedSubmission = SubmissionRow & {
  isrcDisplay: string
  trackTitle: string | null
  trackVersion: string | null
  artist: string | null
  releaseId: string | null
  releaseTitle: string | null
}

function enrichSubmissions(
  submissions: SubmissionRow[],
  tracksById: Map<string, TrackRow>,
  tracksByIsrc: Map<string, TrackRow>,
  releaseMap: Map<string, ReleaseRow>,
): EnrichedSubmission[] {
  return submissions.map((row) => {
    const isrc = normalizeIsrcInput(row.isrc) || String(row.isrc || '')
    const track =
      (row.track_id ? tracksById.get(row.track_id) : undefined) ||
      (isrc ? tracksByIsrc.get(isrc) : undefined) ||
      null
    const release = track?.release_id ? releaseMap.get(track.release_id) : null
    return {
      ...row,
      isrc,
      isrcDisplay: isrc ? formatISRCDisplay(isrc) : '',
      trackTitle: track?.title || null,
      trackVersion: track?.version || null,
      artist: track
        ? release?.album_artist ||
          artistFromContributors(track.contributors, US_ISRC_REGISTRANT.recordingArtist)
        : null,
      releaseId: track?.release_id || null,
      releaseTitle: release?.title || null,
    }
  })
}

export async function loadSoundExchangeRegistry(supabase = createSupabaseServerClient()) {
  const [{ data: tracks }, { data: submissions }] = await Promise.all([
    supabase
      .from('distribution_tracks')
      .select('id, title, version, duration, explicit, isrc_full, contributors, release_id')
      .not('isrc_full', 'is', null)
      .order('isrc_full', { ascending: true })
      .limit(500),
    supabase
      .from('soundexchange_submissions')
      .select('id, track_id, isrc, status, submitted_at, created_at, error, response')
      .order('submitted_at', { ascending: false })
      .limit(300),
  ])

  const trackRows = (tracks || []) as TrackRow[]
  const submissionRows = (submissions || []) as SubmissionRow[]

  const tracksById = new Map(trackRows.map((t) => [t.id, t]))
  const tracksByIsrc = new Map<string, TrackRow>()
  for (const track of trackRows) {
    const isrc = normalizeIsrcInput(track.isrc_full)
    if (isrc) tracksByIsrc.set(isrc, track)
  }

  // Pull any submission tracks missing from the ISRC catalog page (edge cases).
  const missingTrackIds = [
    ...new Set(
      submissionRows
        .map((row) => row.track_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0 && !tracksById.has(id)),
    ),
  ]
  if (missingTrackIds.length) {
    const { data: extra } = await supabase
      .from('distribution_tracks')
      .select('id, title, version, duration, explicit, isrc_full, contributors, release_id')
      .in('id', missingTrackIds)
    for (const track of (extra || []) as TrackRow[]) {
      tracksById.set(track.id, track)
      const isrc = normalizeIsrcInput(track.isrc_full)
      if (isrc) tracksByIsrc.set(isrc, track)
      trackRows.push(track)
    }
  }

  const releaseIds = [
    ...new Set(trackRows.map((t) => t.release_id).filter((id): id is string => Boolean(id))),
  ]

  let releases: ReleaseRow[] = []
  if (releaseIds.length) {
    const { data } = await supabase
      .from('distribution_releases')
      .select('id, title, release_date, genre, album_artist')
      .in('id', releaseIds)
    releases = (data || []) as ReleaseRow[]
  }
  const releaseMap = new Map(releases.map((r) => [r.id, r]))
  const subByIsrc = latestSubmissionByIsrc(submissionRows)

  const catalog: RegistryTrackRow[] = []
  for (const track of trackRows) {
    const isrc = normalizeIsrcInput(track.isrc_full)
    if (!isrc) continue
    const release = track.release_id ? releaseMap.get(track.release_id) : null
    const sub = subByIsrc.get(isrc)
    const status = (sub?.status as SoundExchangeSubmissionStatus | undefined) || null
    catalog.push({
      trackId: track.id,
      title: track.title,
      version: track.version,
      artist:
        release?.album_artist ||
        artistFromContributors(track.contributors, US_ISRC_REGISTRANT.recordingArtist),
      isrc,
      isrcDisplay: formatISRCDisplay(isrc),
      releaseId: track.release_id,
      releaseTitle: release?.title || null,
      releaseDate: release?.release_date || null,
      duration: track.duration,
      explicit: track.explicit,
      submissionStatus: status,
      submittedAt: sub?.submitted_at || null,
      selectable: !status || status === 'pending' || status === 'error' || status === 'rejected',
    })
  }

  const enrichedSubmissions = enrichSubmissions(submissionRows, tracksById, tracksByIsrc, releaseMap)

  const stats = mergeRegistryStats(catalog)
  const prefix = resolveIsrcPrefix()
  const year = currentIsrcYear()
  const example = formatISRC(prefix, year, 1)

  return {
    configured: soundExchangeConfigured(),
    mode: soundExchangeConfigured() ? 'remote' : 'local',
    accountId: resolveSoundExchangeAccountId(),
    registrant: US_ISRC_REGISTRANT,
    isrc: {
      prefix,
      year,
      example,
      exampleDisplay: formatISRCDisplay(example),
    },
    stats,
    catalog,
    submissions: enrichedSubmissions,
    pending: catalog.filter((row) => row.selectable),
  }
}

export function findCatalogHit(
  catalog: RegistryTrackRow[],
  isrcRaw: string,
): LocalIsrcHit | null {
  const isrc = normalizeIsrcInput(isrcRaw)
  if (!isrc) return null
  return catalog.find((row) => row.isrc === isrc) || null
}

export type SxDirectRegisterResult = {
  mode: SoundExchangeMode
  deskUrl: string
  total: number
  successful: number
  failed: number
  skipped: number
  persisted: boolean
  persistError: string | null
  results: Array<{
    isrc: string
    success: boolean
    error?: string
    submissionId?: string
    mode: SoundExchangeMode
    skipped?: boolean
  }>
}

/**
 * Register Catalog ISRCs with SX Direct (local registry always; remote when env is set).
 * Used by Pipeline batch-submit and automatically after Release Studio mints codes.
 */
export async function registerTracksWithSoundExchange(
  trackIds: string[],
  opts: { skipRegistered?: boolean; source?: 'mint' | 'manual' } = {},
  supabase = createSupabaseServerClient(),
): Promise<SxDirectRegisterResult> {
  const uniqueIds = [...new Set(trackIds.map(String).filter(Boolean))].slice(0, 100)
  const empty: SxDirectRegisterResult = {
    mode: soundExchangeConfigured() ? 'remote' : 'local',
    deskUrl: SX_DIRECT_HOME,
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    persisted: true,
    persistError: null,
    results: [],
  }
  if (!uniqueIds.length) return empty

  const { data: tracks, error: tracksError } = await supabase
    .from('distribution_tracks')
    .select('*')
    .in('id', uniqueIds)
    .not('isrc_full', 'is', null)

  if (tracksError) {
    throw new Error(tracksError.message)
  }
  if (!tracks?.length) {
    return empty
  }

  const releaseIds = tracks
    .map((t) => t.release_id)
    .filter((id): id is string => Boolean(id))

  let releases: Array<{
    id: string
    title?: string | null
    release_date?: string | null
    genre?: string | null
    album_artist?: string | null
  }> = []
  if (releaseIds.length) {
    const { data: releasesData } = await supabase
      .from('distribution_releases')
      .select('id, title, release_date, genre, album_artist')
      .in('id', releaseIds)
    releases = releasesData || []
  }
  const releaseMap = new Map(releases.map((r) => [r.id, r]))

  const isrcs = tracks
    .map((t) => normalizeIsrcInput(t.isrc_full))
    .filter((isrc): isrc is string => Boolean(isrc))

  const latestByIsrc = new Map<string, { status: string }>()
  if (opts.skipRegistered && isrcs.length) {
    const { data: existing } = await supabase
      .from('soundexchange_submissions')
      .select('isrc, status, submitted_at, created_at')
      .in('isrc', isrcs)
    for (const [isrc, row] of latestSubmissionByIsrc(existing || [])) {
      latestByIsrc.set(isrc, row)
    }
  }

  const soundExchange = createSoundExchangeClient()
  const submissionData: Array<{
    track: (typeof tracks)[number]
    payload: NonNullable<ReturnType<typeof trackToSxDirectSubmission>>
  }> = []
  const skippedResults: SxDirectRegisterResult['results'] = []

  for (const track of tracks) {
    const payload = trackToSxDirectSubmission(
      track,
      track.release_id ? releaseMap.get(track.release_id) : null,
    )
    if (!payload) continue
    const prior = latestByIsrc.get(payload.isrc)?.status
    if (opts.skipRegistered && (prior === 'submitted' || prior === 'accepted')) {
      skippedResults.push({
        isrc: payload.isrc,
        success: true,
        skipped: true,
        mode: soundExchange.mode,
        submissionId: `sx-skip-${payload.isrc}`,
      })
      continue
    }
    submissionData.push({ track, payload })
  }

  const submitted = submissionData.length
    ? await soundExchange.batchSubmitISRCs(submissionData.map((row) => row.payload))
    : []

  const now = new Date().toISOString()
  const rows = submitted.map((result, idx) => ({
    id: result.submissionId || `sx-${opts.source || 'manual'}-${submissionData[idx].payload.isrc}`,
    track_id: submissionData[idx].track.id,
    isrc: submissionData[idx].payload.isrc,
    status: result.success ? 'submitted' : 'error',
    submitted_at: now,
    response: {
      success: result.success,
      mode: result.mode,
      source: opts.source || 'manual',
      desk: 'SX Direct',
      sxDirect: submissionData[idx].payload.sxDirect,
    },
    error: result.error || null,
  }))

  let persistError: string | null = null
  if (rows.length) {
    const { error: insertError } = await supabase.from('soundexchange_submissions').upsert(rows, {
      onConflict: 'id',
    })
    persistError = insertError?.message || null
  }

  const results = [
    ...skippedResults,
    ...submitted.map((row) => ({ ...row, skipped: false as const })),
  ]
  const successful = results.filter((r) => r.success && !r.skipped).length
  const skipped = skippedResults.length
  const failed = results.filter((r) => !r.success).length

  return {
    mode: soundExchange.mode,
    deskUrl: SX_DIRECT_HOME,
    total: results.length,
    successful,
    failed,
    skipped,
    persisted: !persistError,
    persistError,
    results,
  }
}

/** Mint must succeed even if SX Direct queueing fails. */
export async function registerMintedIsrcsWithSxDirect(trackIds: string[]) {
  if (!trackIds.length) return null
  try {
    return await registerTracksWithSoundExchange(trackIds, { skipRegistered: true, source: 'mint' })
  } catch (err) {
    console.warn('[sx-direct] register after mint failed', err)
    return {
      mode: soundExchangeConfigured() ? 'remote' : 'local',
      deskUrl: SX_DIRECT_HOME,
      total: 0,
      successful: 0,
      failed: trackIds.length,
      skipped: 0,
      persisted: false,
      persistError: err instanceof Error ? err.message : 'SX Direct register failed',
      results: [],
    } satisfies SxDirectRegisterResult
  }
}

export function lockerCsvFromCatalog(rows: RegistryTrackRow[]): string {
  return buildUsisrcLockerCsv(
    rows.map((row) => ({
      isrc: row.isrc,
      title: row.title,
      version: row.version,
      artist: row.artist,
      explicit: row.explicit,
      durationSec: durationToSeconds(row.duration),
      yearOfProduction: row.releaseDate
        ? Number(String(row.releaseDate).slice(0, 4)) || undefined
        : undefined,
    })),
  )
}
