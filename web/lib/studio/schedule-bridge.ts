import fs from 'fs'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ScheduleRelease = {
  id: string
  title: string
  type: string
  track_count?: number | null
  release_date: string
  presave_date?: string | null
  genre?: string | null
  status: string
  artwork?: string | null
  smart_link?: string | null
  description?: string | null
  /** Present when row originated from distribution_releases */
  source?: 'schedule' | 'distribution'
  distributor_status?: string | null
}

const SCHEDULE_PATH = path.join(process.cwd(), 'data', 'release-schedule.json')

export function getSchedulePath(): string {
  return SCHEDULE_PATH
}

export function readReleaseSchedule(): { schedule: ScheduleRelease[] } {
  const raw = fs.readFileSync(SCHEDULE_PATH, 'utf-8')
  const parsed = JSON.parse(raw) as { schedule?: ScheduleRelease[] }
  return { schedule: Array.isArray(parsed.schedule) ? parsed.schedule : [] }
}

export function writeReleaseSchedule(data: { schedule: ScheduleRelease[] }): void {
  fs.writeFileSync(SCHEDULE_PATH, `${JSON.stringify(data, null, 2)}\n`)
}

function mapDistributorStatusToSchedule(status: string | null | undefined): string {
  switch (status) {
    case 'live':
      return 'released'
    case 'delivered':
    case 'submitted':
      return 'scheduled'
    case 'error':
      return 'draft'
    default:
      return status || 'draft'
  }
}

export function distributionToScheduleShape(release: {
  id: string
  title: string
  type?: string | null
  release_date?: string | null
  artwork_url?: string | null
  genre?: string | null
  description?: string | null
  distributor_status?: string | null
}): ScheduleRelease {
  return {
    id: release.id,
    title: release.title,
    type: (release.type || 'single').replace(/^\w/, (c) => c.toUpperCase()),
    track_count: null,
    release_date: release.release_date || '',
    presave_date: null,
    genre: release.genre || null,
    status: mapDistributorStatusToSchedule(release.distributor_status),
    artwork: release.artwork_url || null,
    smart_link: null,
    description: release.description || null,
    source: 'distribution',
    distributor_status: release.distributor_status || null,
  }
}

/** Upsert a distribution release into the JSON calendar (non-destructive merge). */
export function upsertScheduleFromDistribution(release: {
  id: string
  title: string
  type?: string | null
  release_date?: string | null
  artwork_url?: string | null
  genre?: string | null
  description?: string | null
  distributor_status?: string | null
}): ScheduleRelease {
  const data = readReleaseSchedule()
  const mapped = distributionToScheduleShape(release)
  const index = data.schedule.findIndex((r) => r.id === release.id)

  if (index === -1) {
    data.schedule.push(mapped)
    writeReleaseSchedule(data)
    return mapped
  }

  const existing = data.schedule[index]!
  const merged: ScheduleRelease = {
    ...existing,
    title: mapped.title || existing.title,
    type: mapped.type || existing.type,
    release_date: mapped.release_date || existing.release_date,
    genre: mapped.genre ?? existing.genre,
    artwork: mapped.artwork || existing.artwork,
    description: mapped.description ?? existing.description,
    status:
      release.distributor_status === 'live'
        ? 'released'
        : existing.status || mapped.status,
    source: existing.source || 'schedule',
    distributor_status: mapped.distributor_status,
  }
  data.schedule[index] = merged
  writeReleaseSchedule(data)
  return merged
}

export type PipelineReleaseRef = {
  id: string
  title: string
  type: string
  release_date: string
  presave_date: string | null
  genre: string | null
  status: string
  artwork: string | null
  smart_link: string | null
  description: string | null
  source: 'schedule' | 'distribution'
}

/**
 * Resolve a release for pipeline campaign/smart-link actions.
 * Prefers JSON schedule, then distribution_releases.
 */
export async function resolvePipelineRelease(
  supabase: SupabaseClient,
  releaseId: string
): Promise<PipelineReleaseRef | null> {
  const { schedule } = readReleaseSchedule()
  const fromSchedule = schedule.find((r) => r.id === releaseId)
  if (fromSchedule) {
    return {
      id: fromSchedule.id,
      title: fromSchedule.title,
      type: fromSchedule.type,
      release_date: fromSchedule.release_date || '',
      presave_date: fromSchedule.presave_date || null,
      genre: fromSchedule.genre || null,
      status: fromSchedule.status,
      artwork: fromSchedule.artwork || null,
      smart_link: fromSchedule.smart_link || null,
      description: fromSchedule.description || null,
      source: 'schedule',
    }
  }

  const { data, error } = await supabase
    .from('distribution_releases')
    .select(
      'id, title, type, release_date, artwork_url, genre, description, distributor_status'
    )
    .eq('id', releaseId)
    .maybeSingle()

  if (error || !data) return null

  const mapped = distributionToScheduleShape(data)
  return {
    id: mapped.id,
    title: mapped.title,
    type: mapped.type,
    release_date: mapped.release_date,
    presave_date: null,
    genre: mapped.genre || null,
    status: mapped.status,
    artwork: mapped.artwork || null,
    smart_link: null,
    description: mapped.description || null,
    source: 'distribution',
  }
}

/**
 * Merge calendar JSON + distribution_releases for the marketing pipeline board.
 */
export async function listMergedPipelineReleases(
  supabase: SupabaseClient
): Promise<PipelineReleaseRef[]> {
  const { schedule } = readReleaseSchedule()
  const scheduleIds = new Set(schedule.map((r) => r.id))

  const { data: distReleases } = await supabase
    .from('distribution_releases')
    .select(
      'id, title, type, release_date, artwork_url, genre, description, distributor_status'
    )
    .order('release_date', { ascending: true })

  const merged: PipelineReleaseRef[] = schedule.map((r) => {
    const dist = distReleases?.find((d) => d.id === r.id)
    if (!dist) {
      return {
        id: r.id,
        title: r.title,
        type: r.type,
        release_date: r.release_date || '',
        presave_date: r.presave_date || null,
        genre: r.genre || null,
        status: r.status,
        artwork: r.artwork || null,
        smart_link: r.smart_link || null,
        description: r.description || null,
        source: 'schedule' as const,
      }
    }
    return {
      id: r.id,
      title: dist.title || r.title,
      type: dist.type || r.type,
      release_date: dist.release_date || r.release_date || '',
      presave_date: r.presave_date || null,
      genre: dist.genre || r.genre || null,
      status:
        dist.distributor_status === 'live'
          ? 'released'
          : r.status || mapDistributorStatusToSchedule(dist.distributor_status),
      artwork: dist.artwork_url || r.artwork || null,
      smart_link: r.smart_link || null,
      description: dist.description || r.description || null,
      source: 'schedule' as const,
    }
  })

  for (const dist of distReleases || []) {
    if (scheduleIds.has(dist.id)) continue
    // Skip pure drafts with no date — keep pipeline focused on dated/active work
    if (dist.distributor_status === 'draft' && !dist.release_date) continue
    const mapped = distributionToScheduleShape(dist)
    merged.push({
      id: mapped.id,
      title: mapped.title,
      type: mapped.type,
      release_date: mapped.release_date,
      presave_date: null,
      genre: mapped.genre || null,
      status: mapped.status,
      artwork: mapped.artwork || null,
      smart_link: null,
      description: mapped.description || null,
      source: 'distribution',
    })
  }

  return merged.sort((a, b) => {
    const da = a.release_date ? new Date(a.release_date).getTime() : Number.MAX_SAFE_INTEGER
    const db = b.release_date ? new Date(b.release_date).getTime() : Number.MAX_SAFE_INTEGER
    return da - db
  })
}
