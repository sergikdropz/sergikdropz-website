import type { SupabaseClient } from '@supabase/supabase-js'
import { importVaultFolderToStudio } from '@/lib/studio/vault-import-server'
import { vaultFolderIdFromMarketingCopy } from '@/lib/studio/vault-import'
import {
  distributionToScheduleShape,
  readReleaseSchedule,
  writeReleaseSchedule,
  type ScheduleRelease,
} from '@/lib/studio/schedule-bridge'

/** Legacy JSON schedule stub id → Music Vault EP folder id */
export const LEGACY_SCHEDULE_TO_VAULT_FOLDER: Record<string, string> = {
  'are-we-awake': 'collection-unreleased-eps-sergik---are-we-awake-',
  'vice-and-virtues': 'collection-unreleased-eps-sergik---vice---virtues-',
  'in-the-streets': 'collection-unreleased-eps-sergik---in-the-streets-',
  inspire: 'collection-unreleased-eps-sergik---inspire-',
  'the-world-dont-stop': 'collection-unreleased-eps-sergik---the-world-dont-stop-',
  utopia: 'collection-unreleased-eps-sergik---utopia-',
  daze: 'collection-unreleased-eps-sergik---daze-',
  'staying-a-vibe': 'collection-unreleased-eps-sergik---staying-a-vibe-',
}

export function normalizeReleaseTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(ep|album|single)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isLegacyScheduleStub(entry: ScheduleRelease): boolean {
  if (entry.source === 'distribution') return false
  if (entry.id.startsWith('release-')) return false
  return Boolean(LEGACY_SCHEDULE_TO_VAULT_FOLDER[entry.id])
}

type DistRow = {
  id: string
  title: string
  type?: string | null
  release_date?: string | null
  artwork_url?: string | null
  genre?: string | null
  description?: string | null
  distributor_status?: string | null
  marketing_copy?: Record<string, unknown> | null
}

/**
 * Resolve an existing distribution release for a vault EP folder.
 * Prefers exact vault-folder meta, then stable ID prefix, then title.
 * Rejects poisoned folder meta when the release title clearly belongs to another EP
 * (e.g. In The Streets stamped with the Inspire folder id).
 */
export function findReleaseForFolder(
  releases: DistRow[],
  folderId: string,
  scheduleTitle: string,
): DistRow | null {
  const want = normalizeReleaseTitle(scheduleTitle)
  const titleMatch = (r: DistRow) =>
    Boolean(want) && normalizeReleaseTitle(r.title || '') === want

  const byFolder = releases.filter(
    (r) => vaultFolderIdFromMarketingCopy(r.marketing_copy || null) === folderId,
  )
  if (byFolder.length === 1) {
    const hit = byFolder[0]
    // Trust unique folder meta unless the title is an obvious mismatch.
    if (!want || titleMatch(hit)) return hit
  } else if (byFolder.length > 1) {
    return byFolder.find(titleMatch) || null
  }

  const safeFolderKey = folderId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40)
  const prefix = `release-${safeFolderKey}`
  const byIdPrefix = releases.filter(
    (r) => r.id === prefix || r.id.startsWith(`${prefix}-`),
  )
  if (byIdPrefix.length === 1) {
    const hit = byIdPrefix[0]
    if (!want || titleMatch(hit)) return hit
  } else if (byIdPrefix.length > 1) {
    return byIdPrefix.find(titleMatch) || null
  }

  return releases.find(titleMatch) || null
}

export type MigrateScheduledEpResult = {
  releaseId: string
  scheduleId: string
  folderId: string
  title: string
  action: 'created' | 'linked' | 'skipped'
  trackCount?: number
  message?: string
}

export type MigrateScheduledEpsSummary = {
  results: MigrateScheduledEpResult[]
  scheduleCount: number
}

/**
 * Import every legacy schedule stub into Release Studio (distribution draft / pending)
 * the same way Are We Awake was processed, then rewrite the calendar JSON.
 */
export async function migrateLegacyScheduledEpsToPending(
  supabase: SupabaseClient,
): Promise<MigrateScheduledEpsSummary> {
  const { schedule } = readReleaseSchedule()
  const stubs = schedule.filter(isLegacyScheduleStub)

  const { data: distRows, error: distError } = await supabase
    .from('distribution_releases')
    .select(
      'id, title, type, release_date, artwork_url, genre, description, distributor_status, marketing_copy',
    )

  if (distError) throw new Error(distError.message)

  const releases = (distRows || []) as DistRow[]
  const results: MigrateScheduledEpResult[] = []
  const keepByReleaseId = new Map<string, ScheduleRelease>()

  // Preserve any existing distribution-sourced calendar rows (and their presave dates).
  for (const row of schedule) {
    if (row.source === 'distribution' || row.id.startsWith('release-')) {
      keepByReleaseId.set(row.id, { ...row, status: row.status === 'scheduled' ? 'pending' : row.status })
    }
  }

  for (const stub of stubs) {
    const folderId = LEGACY_SCHEDULE_TO_VAULT_FOLDER[stub.id]
    if (!folderId) {
      results.push({
        releaseId: '',
        scheduleId: stub.id,
        folderId: '',
        title: stub.title,
        action: 'skipped',
        message: 'No vault folder mapping',
      })
      continue
    }

    let existing = findReleaseForFolder(releases, folderId, stub.title)
    let action: MigrateScheduledEpResult['action'] = existing ? 'linked' : 'created'
    let trackCount = 0

    if (!existing) {
      const imported = await importVaultFolderToStudio(supabase, { folderId })
      existing = imported.release as DistRow
      trackCount = imported.tracks.filter((t) => t.status === 'created' || t.status === 'linked').length
      releases.push(existing)
      action = imported.created ? 'created' : 'linked'
    } else {
      // Refresh draft fields / tracks from vault without clobbering filled studio work.
      const filled = await importVaultFolderToStudio(supabase, {
        folderId,
        releaseId: existing.id,
        fillEmptyOnly: true,
      })
      existing = filled.release as DistRow
      trackCount = filled.tracks.filter((t) => t.status === 'created' || t.status === 'linked').length
      const idx = releases.findIndex((r) => r.id === existing!.id)
      if (idx >= 0) releases[idx] = existing
      else releases.push(existing)
    }

    const updates: Record<string, unknown> = {
      distributor_status: existing.distributor_status === 'live' ? 'live' : 'draft',
    }
    // Prefer calendar street dates from the legacy schedule over vault year defaults.
    if (stub.release_date) updates.release_date = stub.release_date
    if (stub.genre && !existing.genre) updates.genre = stub.genre
    if (stub.description && (!existing.description || existing.description.length < 40)) {
      updates.description = stub.description
    }
    if (stub.artwork && !existing.artwork_url) updates.artwork_url = stub.artwork
    if (stub.type && !existing.type) {
      updates.type = String(stub.type).toLowerCase()
    }

    const { data: updated, error: updateError } = await supabase
      .from('distribution_releases')
      .update(updates)
      .eq('id', existing.id)
      .select(
        'id, title, type, release_date, artwork_url, genre, description, distributor_status, marketing_copy',
      )
      .single()

    if (updateError) throw new Error(updateError.message)
    existing = updated as DistRow

    const mapped = distributionToScheduleShape(existing)
    const previous = keepByReleaseId.get(existing.id)
    keepByReleaseId.set(existing.id, {
      ...mapped,
      status: existing.distributor_status === 'live' ? 'released' : 'pending',
      release_date: mapped.release_date || stub.release_date || previous?.release_date || '',
      presave_date: stub.presave_date ?? previous?.presave_date ?? null,
      genre: mapped.genre || stub.genre || previous?.genre || null,
      artwork: mapped.artwork || stub.artwork || previous?.artwork || null,
      description: mapped.description || stub.description || previous?.description || null,
      smart_link: previous?.smart_link || stub.smart_link || null,
      source: 'distribution',
      distributor_status: existing.distributor_status || 'draft',
    })

    results.push({
      releaseId: existing.id,
      scheduleId: stub.id,
      folderId,
      title: existing.title,
      action,
      trackCount,
    })
  }

  // Drop legacy stubs; keep only distribution-backed pending/released rows.
  const nextSchedule = Array.from(keepByReleaseId.values()).sort((a, b) => {
    const da = a.release_date ? new Date(a.release_date).getTime() : Number.MAX_SAFE_INTEGER
    const db = b.release_date ? new Date(b.release_date).getTime() : Number.MAX_SAFE_INTEGER
    return da - db
  })

  writeReleaseSchedule({ schedule: nextSchedule })

  return { results, scheduleCount: nextSchedule.length }
}
