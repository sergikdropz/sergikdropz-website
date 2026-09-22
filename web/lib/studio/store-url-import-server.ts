/**
 * Store URL → distribution_releases / tracks / store_links (server).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ALL_DSP_STORE_IDS } from '@/lib/studio/constants'
import { normalizeTitleKey } from '@/lib/studio/distrokid-import'
import {
  marketingCopyWithStoreUrlMeta,
  resolveStoreUrlToReleaseDraft,
  type StoreUrlReleaseDraft,
  type StoreUrlTrackDraft,
} from '@/lib/studio/store-url-import'
import { emptyStreamContinuity, marketingCopyWithStreamContinuity } from '@/lib/studio/stream-continuity'

export type StoreUrlImportOptions = {
  seedUrl: string
  dryRun?: boolean
  fillEmptyOnly?: boolean
  matchVault?: boolean
  fetchImpl?: typeof fetch
}

export type StoreUrlTrackImportResult = {
  title: string
  track_number: number
  isrc_full: string | null
  distribution_track_id: string | null
  status: 'created' | 'updated' | 'skipped' | 'would_create' | 'would_update' | 'error'
  vault_match?: { id: string; title: string } | null
  message?: string
}

export type StoreUrlImportResult = {
  dryRun: boolean
  created: number
  updated: number
  release_id: string | null
  status: 'created' | 'updated' | 'would_create' | 'would_update' | 'error'
  draft: StoreUrlReleaseDraft
  tracks: StoreUrlTrackImportResult[]
  store_links: { store: string; status: string }[]
  message?: string
}

type VaultHit = {
  id: string
  title: string
  file_url: string | null
  artwork_url: string | null
  duration: number | null
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
  draft: StoreUrlReleaseDraft,
): Promise<Record<string, unknown> | null> {
  if (draft.upc) {
    const { data } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('upc', draft.upc)
      .maybeSingle()
    if (data) return data as Record<string, unknown>
  }

  const firstIsrc = draft.tracks.find((t) => t.isrc_full)?.isrc_full
  if (firstIsrc) {
    const { data: track } = await supabase
      .from('distribution_tracks')
      .select('release_id')
      .eq('isrc_full', firstIsrc)
      .maybeSingle()
    if (track?.release_id) {
      const { data: full } = await supabase
        .from('distribution_releases')
        .select('*')
        .eq('id', track.release_id)
        .maybeSingle()
      if (full) return full as Record<string, unknown>
    }
  }

  const seed = draft.seed_url
  const { data: candidates } = await supabase
    .from('distribution_releases')
    .select('id, title, upc, marketing_copy')
    .limit(400)

  for (const row of candidates || []) {
    const copy = (row.marketing_copy as Record<string, unknown>) || null
    const storeMeta = copy?._store_url
    if (storeMeta && typeof storeMeta === 'object') {
      const metaSeed = String((storeMeta as { seed_url?: string }).seed_url || '')
      if (metaSeed && metaSeed === seed) {
        const { data: full } = await supabase
          .from('distribution_releases')
          .select('*')
          .eq('id', row.id)
          .single()
        return (full as Record<string, unknown>) || null
      }
    }
  }
  return null
}

async function loadVaultTitleIndex(
  supabase: SupabaseClient,
): Promise<Map<string, VaultHit[]>> {
  const { data } = await supabase
    .from('music_library_tracks')
    .select('id, title, file_url, artwork_url, duration')
    .or('is_archived.is.null,is_archived.eq.false')
    .limit(5000)

  const index = new Map<string, VaultHit[]>()
  for (const row of data || []) {
    const title = String(row.title || '')
    const key = normalizeTitleKey(title)
    if (!key) continue
    const hit: VaultHit = {
      id: String(row.id),
      title,
      file_url: (row.file_url as string | null) || null,
      artwork_url: (row.artwork_url as string | null) || null,
      duration: typeof row.duration === 'number' ? row.duration : null,
    }
    const list = index.get(key) || []
    list.push(hit)
    index.set(key, list)
  }
  return index
}

function matchVaultTrack(index: Map<string, VaultHit[]>, title: string): VaultHit | null {
  const hits = index.get(normalizeTitleKey(title)) || []
  return hits.length === 1 ? hits[0] : null
}

async function persistStoreLinks(
  supabase: SupabaseClient,
  releaseId: string,
  links: StoreUrlReleaseDraft['store_links'],
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
  track: StoreUrlTrackDraft,
  opts: {
    dryRun: boolean
    fillEmptyOnly: boolean
    artwork_url: string | null
    vault: VaultHit | null
  },
): Promise<StoreUrlTrackImportResult> {
  const base: StoreUrlTrackImportResult = {
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
  if (track.duration_ms != null && Number.isFinite(track.duration_ms)) {
    payload.duration = Math.round(track.duration_ms / 1000)
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
    updates.release_id = releaseId
    const { error } = await supabase.from('distribution_tracks').update(updates).eq('id', existing.id)
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
    ? `dtrack-url-${track.isrc_full}`
    : `dtrack-url-${releaseId}-${track.track_number}`
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

export async function importReleaseFromStoreUrl(
  supabase: SupabaseClient,
  options: StoreUrlImportOptions,
): Promise<StoreUrlImportResult> {
  const dryRun = Boolean(options.dryRun)
  const fillEmptyOnly = options.fillEmptyOnly !== false
  const matchVault = options.matchVault !== false

  const draft = await resolveStoreUrlToReleaseDraft(options.seedUrl, {
    fetchImpl: options.fetchImpl,
  })

  const existing = await findExistingRelease(supabase, draft)
  const vaultIndex = matchVault ? await loadVaultTitleIndex(supabase) : new Map<string, VaultHit[]>()

  const result: StoreUrlImportResult = {
    dryRun,
    created: 0,
    updated: 0,
    release_id: existing ? String(existing.id) : draft.id,
    status: existing
      ? dryRun
        ? 'would_update'
        : 'updated'
      : dryRun
        ? 'would_create'
        : 'created',
    draft,
    tracks: [],
    store_links: [],
  }

  if (dryRun && !existing) {
    result.tracks = draft.tracks.map((t) => {
      const hit = matchVault ? matchVaultTrack(vaultIndex, t.title) : null
      return {
        title: t.title,
        track_number: t.track_number,
        isrc_full: t.isrc_full,
        distribution_track_id: null,
        status: 'would_create' as const,
        vault_match: hit ? { id: hit.id, title: hit.title } : null,
      }
    })
    result.store_links = draft.store_links.map((l) => ({ store: l.store, status: 'would_add' }))
    return result
  }

  let releaseId = existing ? String(existing.id) : draft.id

  if (!existing) {
    if (dryRun) return result
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
        upc: draft.upc,
        previous_upc: draft.previous_upc,
        previous_isrc: draft.previous_isrc,
        previously_released: true,
        explicit: false,
        language: 'en',
        marketing_copy: marketingCopyWithStoreUrlMeta({}, draft),
        distribution_mode: 'self',
        target_stores: ALL_DSP_STORE_IDS,
        distributor_status: 'draft',
      })
      .select('*')
      .single()

    if (error) {
      result.status = 'error'
      result.message = error.message
      return result
    }
    releaseId = String(data.id)
    result.release_id = releaseId
    result.created = 1
  } else {
    result.release_id = releaseId
    if (!dryRun) {
      const updates: Record<string, unknown> = {}
      maybeSet(updates, existing, 'title', draft.title, fillEmptyOnly)
      maybeSet(updates, existing, 'artwork_url', draft.artwork_url, fillEmptyOnly)
      maybeSet(updates, existing, 'album_artist', draft.album_artist, fillEmptyOnly)
      maybeSet(updates, existing, 'upc', draft.upc, fillEmptyOnly)
      maybeSet(updates, existing, 'previous_upc', draft.previous_upc, fillEmptyOnly)
      maybeSet(updates, existing, 'previous_isrc', draft.previous_isrc, fillEmptyOnly)
      maybeSet(updates, existing, 'release_date', draft.release_date, fillEmptyOnly)
      maybeSet(updates, existing, 'original_release_date', draft.original_release_date, fillEmptyOnly)
      updates.previously_released = true

      const existingCopy = (existing.marketing_copy as Record<string, unknown>) || {}
      updates.marketing_copy = marketingCopyWithStreamContinuity(
        marketingCopyWithStoreUrlMeta(existingCopy, draft),
        {
          ...emptyStreamContinuity('store_url'),
          seed_url: draft.seed_url,
          old_distributor:
            streamContinuityOldDistributor(existingCopy) || 'prior',
          phases: {
            captured: true,
            identity_verified: Boolean(
              draft.upc || draft.tracks.some((t) => t.isrc_full) || draft.store_links.length,
            ),
          },
        },
      )

      const { error } = await supabase
        .from('distribution_releases')
        .update(updates)
        .eq('id', releaseId)
      if (error) {
        result.status = 'error'
        result.message = error.message
        return result
      }
      result.updated = 1
    }
  }

  for (const track of draft.tracks) {
    const vault = matchVault ? matchVaultTrack(vaultIndex, track.title) : null
    const trackResult = await upsertTrack(supabase, releaseId, track, {
      dryRun,
      fillEmptyOnly,
      artwork_url: draft.artwork_url,
      vault,
    })
    result.tracks.push(trackResult)
  }

  result.store_links = await persistStoreLinks(supabase, releaseId, draft.store_links, dryRun)
  return result
}

function streamContinuityOldDistributor(copy: Record<string, unknown>): string | null {
  if (copy._distrokid) return 'distrokid'
  const continuity = copy._stream_continuity
  if (continuity && typeof continuity === 'object') {
    const old = (continuity as { old_distributor?: string }).old_distributor
    return old || null
  }
  return null
}
