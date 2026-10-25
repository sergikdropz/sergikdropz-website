import type { SupabaseClient } from '@supabase/supabase-js'
import { createShareToken } from '@/lib/shares/types'
import { promoBilledArtistByTrackId } from '@/lib/studio/promo-track-audio'
import {
  parseSocialPromoPlan,
  promoSharePath,
  readPromoShareToken,
  summarizeSocialPromo,
  type SocialPromoPlan,
  type SocialPromoSummary,
} from '@/lib/studio/social-promo'
import { parseBilledArtists } from '@/lib/studio/track-credits'

export type PromoReleaseCandidate = {
  id: string
  updatedAt?: string | null
  shareToken?: string | null
  /** Vault-folder match should outrank a loose track overlap. */
  score: number
}

/** Prefer a release that already has a promo link, then the strongest folder match. */
export function pickPromoReleaseId(rows: PromoReleaseCandidate[]): string | null {
  if (!rows.length) return null
  const sorted = [...rows].sort((a, b) => {
    const tokenDelta = Number(Boolean(b.shareToken)) - Number(Boolean(a.shareToken))
    if (tokenDelta) return tokenDelta
    if (b.score !== a.score) return b.score - a.score
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  })
  return sorted[0]?.id ?? null
}

export async function findReleaseIdForFolder(
  supabase: SupabaseClient,
  folderId: string,
): Promise<string | null> {
  const id = folderId.trim()
  if (!id) return null
  const scores = new Map<string, number>()

  const vault = await supabase
    .from('distribution_releases')
    .select('id')
    .contains('marketing_copy', { _vault: { folderId: id } })
    .limit(8)
  if (!vault.error) {
    for (const row of vault.data || []) {
      if (row?.id) scores.set(String(row.id), (scores.get(String(row.id)) || 0) + 100)
    }
  }

  const library = await supabase
    .from('music_library_tracks')
    .select('id')
    .eq('folder_id', id)
    .limit(200)
  const libraryIds = (library.data || []).map((row) => String(row.id || '')).filter(Boolean)
  if (libraryIds.length) {
    const linked = await supabase
      .from('distribution_tracks')
      .select('release_id')
      .in('music_library_track_id', libraryIds)
      .limit(200)
    if (!linked.error) {
      for (const row of linked.data || []) {
        const releaseId = String(row?.release_id || '')
        if (!releaseId) continue
        scores.set(releaseId, (scores.get(releaseId) || 0) + 1)
      }
    }
  }

  const ids = [...scores.keys()]
  if (!ids.length) return null

  const releases = await supabase
    .from('distribution_releases')
    .select('id, updated_at, social_promo')
    .in('id', ids)
  if (releases.error || !releases.data?.length) {
    return pickPromoReleaseId(ids.map((releaseId) => ({ id: releaseId, score: scores.get(releaseId) || 0 })))
  }

  return pickPromoReleaseId(
    releases.data.map((row) => ({
      id: String(row.id),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      shareToken: readPromoShareToken(parseSocialPromoPlan(row.social_promo).share_token),
      score: scores.get(String(row.id)) || 0,
    })),
  )
}

export type PromoSharePreview = {
  /** Release title — the EP, album, or single name. */
  title: string
  /** Every billed artist on the release, album credit first, then track credits. */
  artists: string[]
  /** Joined artist line for link-preview text. */
  artist: string
  /** EP, Single, or Album when the release type is known. */
  typeLabel: string
  artworkUrl: string | null
}

/** Unique billed names from album and track credit lines, keeping first-seen order. */
export function promoShareArtistNames(lines: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  const push = (name: string) => {
    const clean = name.trim()
    if (!clean) return
    const key = clean.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    names.push(clean)
  }
  for (const line of lines) {
    const billed = parseBilledArtists(line)
    for (const name of billed.primary) push(name)
    for (const name of billed.featured) push(name)
  }
  return names
}

export function promoReleaseTypeLabel(type: string | null | undefined): string {
  const value = String(type || '').trim().toLowerCase()
  if (value === 'ep') return 'EP'
  if (value === 'single') return 'Single'
  if (value === 'album') return 'Album'
  return ''
}

/** Link-preview description: EP name, then every artist. */
export function promoSharePreviewDescription(preview: {
  title: string
  artists?: string[]
  artist?: string
}): string {
  const title = preview.title.trim() || 'SERGIK'
  const names = (preview.artists || []).map((name) => name.trim()).filter(Boolean)
  const credit = names.length ? names.join(', ') : String(preview.artist || '').trim()
  return credit ? `${title} · ${credit}` : title
}

/** Release identity for the collaborator link preview. No schedule or Meta fields. */
export async function loadPromoSharePreview(
  supabase: SupabaseClient,
  token: string,
): Promise<PromoSharePreview | null> {
  const safe = readPromoShareToken(token)
  if (!safe) return null
  const { data, error } = await supabase
    .from('distribution_releases')
    .select('id, title, type, album_artist, artwork_url, artwork_dsp_url, marketing_copy, social_promo')
    .eq('social_promo->>share_token', safe)
    .maybeSingle()
  if (error || !data) return null
  if (readPromoShareToken(parseSocialPromoPlan(data.social_promo).share_token) !== safe) return null
  const marketing =
    data.marketing_copy && typeof data.marketing_copy === 'object'
      ? (data.marketing_copy as Record<string, unknown>)
      : {}
  const artwork =
    String(data.artwork_url || data.artwork_dsp_url || marketing.artwork_dsp_url || '').trim() || null
  const album = String(data.album_artist || '').trim()
  const artists = promoShareArtistNames([album, ...(await promoShareTrackArtistLines(supabase, data.id, album))])
  const credit = artists.length ? artists : album ? [album] : ['SERGIK']
  return {
    title: String(data.title || '').trim() || 'SERGIK',
    artists: credit,
    artist: credit.join(', '),
    typeLabel: promoReleaseTypeLabel(typeof data.type === 'string' ? data.type : ''),
    artworkUrl: artwork,
  }
}

async function promoShareTrackArtistLines(
  supabase: SupabaseClient,
  releaseId: unknown,
  albumArtist: string,
): Promise<string[]> {
  const id = String(releaseId || '').trim()
  if (!id) return []
  try {
    let trackQuery: { data: Record<string, any>[] | null; error: { message?: string } | null } = await supabase
      .from('distribution_tracks')
      .select('id, title, track_number, music_library_track_id, contributors')
      .eq('release_id', id)
      .order('track_number', { ascending: true })
    if (trackQuery.error && /music_library_track_id|contributors/i.test(trackQuery.error.message || '')) {
      trackQuery = await supabase
        .from('distribution_tracks')
        .select('id, title, track_number, contributors')
        .eq('release_id', id)
        .order('track_number', { ascending: true })
    }
    if (trackQuery.error) return []
    const tracks = (trackQuery.data || []).map((track) => ({
      id: String(track.id),
      title: track.title,
      contributors: 'contributors' in track ? track.contributors : null,
      music_library_track_id:
        'music_library_track_id' in track ? track.music_library_track_id : null,
    }))
    if (!tracks.length) return []
    const billed = await promoBilledArtistByTrackId(supabase, tracks, albumArtist || 'SERGIK')
    return tracks.map((track) => billed.get(track.id) || '').filter(Boolean)
  } catch {
    return []
  }
}

export type MintPromoShareResult =
  | { ok: true; token: string; path: string; plan: SocialPromoPlan; summary: SocialPromoSummary }
  | { ok: false; status: number; error: string }

/** Reuse or mint the collaborator promo path for one studio release. */
export async function mintPromoShareLink(
  supabase: SupabaseClient,
  releaseId: string,
): Promise<MintPromoShareResult> {
  const { data: current, error: loadError } = await supabase
    .from('distribution_releases')
    .select('id, social_promo')
    .eq('id', releaseId)
    .maybeSingle()

  if (loadError) {
    if (/social_promo/i.test(loadError.message || '')) {
      return {
        ok: false,
        status: 503,
        error: 'Apply web/supabase/migrations/add_social_promo_to_releases.sql',
      }
    }
    return { ok: false, status: 500, error: loadError.message }
  }
  if (!current) return { ok: false, status: 404, error: 'Release not found' }

  const plan = parseSocialPromoPlan(current.social_promo)
  const existing = readPromoShareToken(plan.share_token)
  if (!existing) {
    plan.share_token = createShareToken()
    const { error } = await supabase
      .from('distribution_releases')
      .update({ social_promo: plan, updated_at: new Date().toISOString() })
      .eq('id', releaseId)
    if (error) return { ok: false, status: 500, error: error.message }
  }

  const token = readPromoShareToken(plan.share_token)
  const path = token ? promoSharePath(token) : null
  if (!token || !path) {
    return { ok: false, status: 500, error: 'Could not create the collaborator link' }
  }

  return { ok: true, token, path, plan, summary: summarizeSocialPromo(plan) }
}
