/**
 * DistroKid catalog → distribution_releases / tracks / store_links (server).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ALL_DSP_STORE_IDS, orderDspStoreIds } from '@/lib/studio/constants'
import {
  buildDistroKidCatalogDrafts,
  distroKidAlbumuuidFromMarketingCopy,
  marketingCopyWithDistroKidMeta,
  normalizeTitleKey,
  parseDistroKidCatalogJson,
  type DistroKidCatalogExport,
  type DistroKidReleaseDraft,
  type DistroKidTrackDraft,
} from '@/lib/studio/distrokid-import'

export type DistroKidImportOptions = {
  catalog: DistroKidCatalogExport | unknown
  dryRun?: boolean
  fillEmptyOnly?: boolean
  matchVault?: boolean
}

export type DistroKidTrackImportResult = {
  title: string
  track_number: number
  isrc_full: string | null
  distribution_track_id: string | null
  status: 'created' | 'updated' | 'skipped' | 'would_create' | 'would_update' | 'error'
  vault_match?: { id: string; title: string } | null
  message?: string
}

export type DistroKidReleaseImportResult = {
  albumuuid: string
  title: string
  release_id: string | null
  status: 'created' | 'updated' | 'would_create' | 'would_update' | 'error'
  upc: string | null
  tracks: DistroKidTrackImportResult[]
  store_links: { store: string; status: string }[]
  message?: string
}

export type DistroKidImportResult = {
  dryRun: boolean
  created: number
  updated: number
  releases: DistroKidReleaseImportResult[]
}

type VaultHit = {
  id: string
  title: string
  file_url: string | null
  artwork_url: string | null
  duration: number | null
  isrc?: string | null
  source?: string | null
}

function maybeSet(
  updates: Record<string, unknown>,
  existing: Record<string, unknown>,
  key: string,
  value: unknown,
  fillEmptyOnly: boolean,
) {
  if (value == null || value === '') return
  if (fillEmptyOnly && existing[key] != null && existing[key] !== '') return
  updates[key] = value
}

async function findExistingRelease(
  supabase: SupabaseClient,
  draft: DistroKidReleaseDraft,
): Promise<Record<string, unknown> | null> {
  if (draft.upc) {
    const { data } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('upc', draft.upc)
      .maybeSingle()
    if (data) return data as Record<string, unknown>
  }

  const { data: candidates } = await supabase
    .from('distribution_releases')
    .select('id, title, upc, marketing_copy')
    .limit(500)

  for (const row of candidates || []) {
    const uuid = distroKidAlbumuuidFromMarketingCopy(
      (row.marketing_copy as Record<string, unknown>) || null,
    )
    if (uuid && uuid === draft.albumuuid) {
      const { data: full } = await supabase
        .from('distribution_releases')
        .select('*')
        .eq('id', row.id)
        .single()
      return (full as Record<string, unknown>) || null
    }
  }
  return null
}

async function loadVaultTitleIndex(
  supabase: SupabaseClient,
): Promise<Map<string, VaultHit[]>> {
  const { data } = await supabase
    .from('music_library_tracks')
    .select('id, title, file_url, artwork_url, duration, metadata')
    .or('is_archived.is.null,is_archived.eq.false')
    .limit(5000)

  const index = new Map<string, VaultHit[]>()
  for (const row of data || []) {
    const title = String(row.title || '')
    const key = normalizeTitleKey(title)
    if (!key) continue
    const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
      string,
      unknown
    >
    const hit: VaultHit = {
      id: String(row.id),
      title,
      file_url: (row.file_url as string | null) || null,
      artwork_url: (row.artwork_url as string | null) || null,
      duration: typeof row.duration === 'number' ? row.duration : null,
      isrc: typeof meta.isrc === 'string' ? meta.isrc.replace(/-/g, '').toUpperCase() : null,
      source: typeof meta.source === 'string' ? meta.source : null,
    }
    const list = index.get(key) || []
    list.push(hit)
    index.set(key, list)
  }
  return index
}

function scoreVaultHit(hit: VaultHit, isrc?: string | null): number {
  let score = 0
  const url = hit.file_url || ''
  if (/\/distrokid\//i.test(url) || hit.id.startsWith('track-dk-')) score += 40
  if (hit.source === 'distrokid-wav' || hit.source === 'distrokid') score += 30
  if (isrc && hit.isrc && hit.isrc === isrc.replace(/-/g, '').toUpperCase()) score += 100
  if (/\.wav(\?|$)/i.test(url)) score += 10
  return score
}

function matchVaultTrack(
  index: Map<string, VaultHit[]>,
  title: string,
  isrc?: string | null,
): VaultHit | null {
  const key = normalizeTitleKey(title)
  const hits = index.get(key) || []
  if (!hits.length) return null
  if (hits.length === 1) return hits[0]
  const ranked = [...hits].sort((a, b) => scoreVaultHit(b, isrc) - scoreVaultHit(a, isrc))
  if (scoreVaultHit(ranked[0], isrc) > scoreVaultHit(ranked[1], isrc)) return ranked[0]
  // Prefer DistroKid R2 masters when tied on title-only duplicates
  const dk = ranked.find((h) => scoreVaultHit(h, isrc) >= 40)
  return dk || null
}

async function persistStoreLinks(
  supabase: SupabaseClient,
  releaseId: string,
  links: DistroKidReleaseDraft['store_links'],
  dryRun: boolean,
): Promise<{ store: string; status: string }[]> {
  const results: { store: string; status: string }[] = []
  if (!links.length) return results

  const { data: existing } = await supabase
    .from('distribution_store_links')
    .select('id, store, url')
    .eq('release_id', releaseId)

  const byStore = new Map((existing || []).map((row) => [row.store as string, row]))

  for (const link of links) {
    const prev = byStore.get(link.store)
    if (dryRun) {
      results.push({
        store: link.store,
        status: prev ? (prev.url === link.url ? 'unchanged' : 'would_update') : 'would_add',
      })
      continue
    }
    if (!prev) {
      const { error } = await supabase.from('distribution_store_links').insert({
        id: `${releaseId}-${link.store}`,
        release_id: releaseId,
        store: link.store,
        url: link.url,
        verification_status: 'unverified',
        verification_detail: null,
        verified_at: null,
      })
      results.push({ store: link.store, status: error ? `error:${error.message}` : 'added' })
      continue
    }
    if (prev.url === link.url) {
      results.push({ store: link.store, status: 'unchanged' })
      continue
    }
    const { error } = await supabase
      .from('distribution_store_links')
      .update({
        url: link.url,
        verification_status: 'unverified',
        verification_detail: null,
        verified_at: null,
      })
      .eq('id', prev.id)
    results.push({ store: link.store, status: error ? `error:${error.message}` : 'updated' })
  }
  return results
}

async function upsertTrack(
  supabase: SupabaseClient,
  releaseId: string,
  track: DistroKidTrackDraft,
  opts: {
    dryRun: boolean
    fillEmptyOnly: boolean
    artwork_url: string | null
    vault: VaultHit | null
  },
): Promise<DistroKidTrackImportResult> {
  const base: DistroKidTrackImportResult = {
    title: track.title,
    track_number: track.track_number,
    isrc_full: track.isrc_full,
    distribution_track_id: null,
    status: 'would_create',
    vault_match: opts.vault ? { id: opts.vault.id, title: opts.vault.title } : null,
  }

  let existing: Record<string, unknown> | null = null
  if (track.isrc_full) {
    const { data } = await supabase
      .from('distribution_tracks')
      .select('*')
      .eq('isrc_full', track.isrc_full)
      .maybeSingle()
    if (data) existing = data as Record<string, unknown>
  }
  if (!existing) {
    const { data } = await supabase
      .from('distribution_tracks')
      .select('*')
      .eq('release_id', releaseId)
      .eq('track_number', track.track_number)
      .maybeSingle()
    if (data) existing = data as Record<string, unknown>
  }

  const payload: Record<string, unknown> = {
    release_id: releaseId,
    title: track.title,
    track_number: track.track_number,
    language: 'en',
    explicit: false,
    instrumental: false,
    artwork_url: opts.artwork_url || opts.vault?.artwork_url || null,
  }
  if (track.isrc_full) {
    payload.isrc_full = track.isrc_full
    payload.isrc_prefix = track.isrc_prefix
    payload.isrc_year = track.isrc_year
    payload.isrc_serial = track.isrc_serial
  }
  if (opts.vault) {
    payload.music_library_track_id = opts.vault.id
    if (opts.vault.file_url) payload.wav_url = opts.vault.file_url
    if (opts.vault.duration != null) payload.duration = opts.vault.duration
  }

  if (existing) {
    if (existing.release_id && existing.release_id !== releaseId) {
      return {
        ...base,
        distribution_track_id: String(existing.id),
        status: 'skipped',
        message: 'Already on another release',
      }
    }
    if (opts.dryRun) {
      return {
        ...base,
        distribution_track_id: String(existing.id),
        status: 'would_update',
      }
    }
    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
      maybeSet(updates, existing, key, value, opts.fillEmptyOnly)
    }
    // Always re-attach to this release when orphaned
    updates.release_id = releaseId
    const { error } = await supabase
      .from('distribution_tracks')
      .update(updates)
      .eq('id', existing.id)
    if (error) {
      return {
        ...base,
        distribution_track_id: String(existing.id),
        status: 'error',
        message: error.message,
      }
    }
    return {
      ...base,
      distribution_track_id: String(existing.id),
      status: 'updated',
    }
  }

  if (opts.dryRun) {
    return { ...base, status: 'would_create' }
  }

  const idSeed = track.isrc_full
    ? `dtrack-dk-${track.isrc_full}`
    : `dtrack-dk-${releaseId}-${track.track_number}`
  const id = idSeed.slice(0, 80)
  const { data: inserted, error } = await supabase
    .from('distribution_tracks')
    .insert({
      id,
      ...payload,
      contributors: [],
      splits: [],
      wav_url: opts.vault?.file_url || '',
    })
    .select('id')
    .single()

  if (error) {
    const altId = `${id}-${Date.now().toString(36)}`.slice(0, 80)
    const { data: inserted2, error: error2 } = await supabase
      .from('distribution_tracks')
      .insert({
        id: altId,
        ...payload,
        contributors: [],
        splits: [],
        wav_url: opts.vault?.file_url || '',
      })
      .select('id')
      .single()
    if (error2) {
      return { ...base, status: 'error', message: error2.message }
    }
    return {
      ...base,
      distribution_track_id: inserted2!.id,
      status: 'created',
    }
  }

  return {
    ...base,
    distribution_track_id: inserted!.id,
    status: 'created',
  }
}

async function importOneRelease(
  supabase: SupabaseClient,
  draft: DistroKidReleaseDraft,
  opts: {
    dryRun: boolean
    fillEmptyOnly: boolean
    matchVault: boolean
    vaultIndex: Map<string, VaultHit[]>
  },
): Promise<DistroKidReleaseImportResult> {
  const existing = await findExistingRelease(supabase, draft)
  const result: DistroKidReleaseImportResult = {
    albumuuid: draft.albumuuid,
    title: draft.title,
    release_id: existing ? String(existing.id) : draft.id,
    status: existing ? (opts.dryRun ? 'would_update' : 'updated') : opts.dryRun ? 'would_create' : 'created',
    upc: draft.upc,
    tracks: [],
    store_links: [],
  }

  if (opts.dryRun && !existing) {
    result.tracks = draft.tracks.map((t) => ({
      title: t.title,
      track_number: t.track_number,
      isrc_full: t.isrc_full,
      distribution_track_id: null,
      status: 'would_create' as const,
      vault_match: opts.matchVault
        ? (() => {
            const hit = matchVaultTrack(opts.vaultIndex, t.title, t.isrc_full)
            return hit ? { id: hit.id, title: hit.title } : null
          })()
        : null,
    }))
    result.store_links = draft.store_links.map((l) => ({
      store: l.store,
      status: 'would_add',
    }))
    return result
  }

  let releaseId = existing ? String(existing.id) : draft.id
  let persisted: Record<string, unknown> | null = existing

  if (!existing) {
    if (opts.dryRun) return result
    const { data, error } = await supabase
      .from('distribution_releases')
      .insert({
        id: draft.id,
        title: draft.title,
        type: draft.type,
        release_date: draft.release_date,
        original_release_date: draft.original_release_date,
        artwork_url: draft.artwork_url,
        album_artist: draft.album_artist,
        label_name: draft.label_name,
        upc: draft.upc,
        previous_upc: draft.previous_upc,
        previously_released: true,
        explicit: false,
        language: 'en',
        marketing_copy: marketingCopyWithDistroKidMeta({}, draft.marketing_meta),
        distribution_mode: 'self',
        target_stores: draft.target_stores.length ? draft.target_stores : ALL_DSP_STORE_IDS,
        distributor_status: 'draft',
      })
      .select('*')
      .single()

    if (error) {
      result.status = 'error'
      result.message = error.message
      result.release_id = null
      return result
    }
    persisted = data as Record<string, unknown>
    releaseId = String(data.id)
    result.release_id = releaseId
    result.status = 'created'
  } else if (!opts.dryRun) {
    const updates: Record<string, unknown> = {
      marketing_copy: marketingCopyWithDistroKidMeta(
        (existing.marketing_copy as Record<string, unknown>) || {},
        draft.marketing_meta,
      ),
      previously_released: true,
    }
    maybeSet(updates, existing, 'title', draft.title, opts.fillEmptyOnly)
    maybeSet(updates, existing, 'type', draft.type, opts.fillEmptyOnly)
    maybeSet(updates, existing, 'artwork_url', draft.artwork_url, opts.fillEmptyOnly)
    maybeSet(updates, existing, 'album_artist', draft.album_artist, opts.fillEmptyOnly)
    maybeSet(updates, existing, 'label_name', draft.label_name, opts.fillEmptyOnly)
    maybeSet(updates, existing, 'release_date', draft.release_date, opts.fillEmptyOnly)
    maybeSet(updates, existing, 'original_release_date', draft.original_release_date, opts.fillEmptyOnly)
    maybeSet(updates, existing, 'upc', draft.upc, opts.fillEmptyOnly)
    maybeSet(updates, existing, 'previous_upc', draft.previous_upc, opts.fillEmptyOnly)
    if (draft.target_stores.length) {
      const prevTargets = Array.isArray(existing.target_stores) ? existing.target_stores : []
      if (!opts.fillEmptyOnly || prevTargets.length === 0) {
        updates.target_stores = draft.target_stores
      } else {
        // Union DistroKid submitted set into existing targets without wiping operator picks
        updates.target_stores = orderDspStoreIds([...prevTargets, ...draft.target_stores])
      }
    }

    const { data, error } = await supabase
      .from('distribution_releases')
      .update(updates)
      .eq('id', releaseId)
      .select('*')
      .single()

    if (error) {
      result.status = 'error'
      result.message = error.message
      return result
    }
    persisted = data as Record<string, unknown>
    result.status = 'updated'
  }

  for (const track of draft.tracks) {
    const vault = opts.matchVault
      ? matchVaultTrack(opts.vaultIndex, track.title, track.isrc_full)
      : null
    const trackResult = await upsertTrack(supabase, releaseId, track, {
      dryRun: opts.dryRun,
      fillEmptyOnly: opts.fillEmptyOnly,
      artwork_url: draft.artwork_url,
      vault,
    })
    result.tracks.push(trackResult)
  }

  result.store_links = await persistStoreLinks(
    supabase,
    releaseId,
    draft.store_links,
    opts.dryRun,
  )

  void persisted
  return result
}

/**
 * Import a DistroKid catalog export into Release Studio.
 */
export async function importDistroKidCatalogToStudio(
  supabase: SupabaseClient,
  opts: DistroKidImportOptions,
): Promise<DistroKidImportResult> {
  const catalog = parseDistroKidCatalogJson(opts.catalog)
  const dryRun = Boolean(opts.dryRun)
  const fillEmptyOnly = opts.fillEmptyOnly !== false
  const matchVault = opts.matchVault !== false
  const drafts = buildDistroKidCatalogDrafts(catalog)
  const vaultIndex = matchVault ? await loadVaultTitleIndex(supabase) : new Map()

  const releases: DistroKidReleaseImportResult[] = []
  for (const draft of drafts) {
    releases.push(
      await importOneRelease(supabase, draft, {
        dryRun,
        fillEmptyOnly,
        matchVault,
        vaultIndex,
      }),
    )
  }

  return {
    dryRun,
    created: releases.filter((r) => r.status === 'created' || r.status === 'would_create').length,
    updated: releases.filter((r) => r.status === 'updated' || r.status === 'would_update').length,
    releases,
  }
}
