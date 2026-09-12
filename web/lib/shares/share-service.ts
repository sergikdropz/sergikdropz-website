import { createSupabaseServerClient } from '@/lib/supabase'
import { resolveVaultPlaybackUrl } from '@/lib/audio/resolve-vault-playback-url'
import { mapLibraryTrackToListItem } from '@/lib/music-library/track-list-fields'
import { normalizeVaultAudioUrl } from '@/utils/normalizeVaultAudioUrl'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import {
  createShareToken,
  embedHtmlSnippet,
  embedUrlForToken,
  isMissingShareTableError,
  isShareActive,
  listenUrlForToken,
  type MusicShareLinkRow,
  type ResolvedSharePayload,
  type ShareCollectionPayload,
  type ShareKind,
  type ShareTrackPayload,
  type ShareVisibility,
} from '@/lib/shares/types'

const SHARE_SELECT =
  'id,token,kind,target_id,visibility,title_override,created_by,expires_at,revoked_at,play_count,last_played_at,created_at,updated_at'

function missingTableResponse() {
  return {
    error: 'Share links are not set up yet. Apply migration add_music_share_links.sql.',
    code: 'SHARE_TABLE_MISSING' as const,
  }
}

function mapTrackRow(track: any, audio?: any, folder?: any): ShareTrackPayload {
  const mapped = mapLibraryTrackToListItem(track, {
    audio,
    folder: folder || track.music_library_folders || null,
    includeFullMetadata: false,
  })
  return {
    id: String(mapped.id),
    title: String(mapped.title || 'Untitled'),
    artist: String(mapped.artist || 'SERGIK'),
    duration: Number(mapped.duration) || 0,
    artwork: mapped.artwork || undefined,
    album: mapped.album || undefined,
    file: String(mapped.file || normalizeVaultAudioUrl(track.file_url || '') || ''),
    folderId: mapped.folderId || track.folder_id || undefined,
    audioFileId: mapped.audioFileId || track.audio_file_id || undefined,
  }
}

async function attachPlaybackUrls(tracks: ShareTrackPayload[]): Promise<ShareTrackPayload[]> {
  return Promise.all(
    tracks.map(async (track) => {
      if (!track.file) return { ...track, playbackUrl: null }
      try {
        const resolved = await resolveVaultPlaybackUrl(track.file)
        return { ...track, playbackUrl: resolved?.url || null }
      } catch {
        return { ...track, playbackUrl: null }
      }
    }),
  )
}

async function loadFolderShare(folderId: string): Promise<{
  collection: ShareCollectionPayload
  tracks: ShareTrackPayload[]
} | null> {
  const supabase = createSupabaseServerClient()
  const { data: folder, error } = await supabase
    .from('music_library_folders')
    .select('id,name,type,artwork_url,year,hidden,is_archived')
    .eq('id', folderId)
    .maybeSingle()

  if (error || !folder || folder.is_archived) return null

  // album_artist is optional (older schemas); fetch separately when present.
  let albumArtist: string | undefined
  {
    const artistProbe = await supabase
      .from('music_library_folders')
      .select('album_artist')
      .eq('id', folderId)
      .maybeSingle()
    if (!artistProbe.error && artistProbe.data?.album_artist) {
      albumArtist = String(artistProbe.data.album_artist)
    }
  }

  const { data: trackRows } = await supabase
    .from('music_library_tracks')
    .select(
      'id,title,artist,duration,year,artwork_url,file_url,folder_id,audio_file_id,display_order,track_number,bpm,key_signature,genre,subgenre,is_archived',
    )
    .eq('folder_id', folderId)
    .or('is_archived.is.null,is_archived.eq.false')
    .order('display_order', { ascending: true })
    .order('track_number', { ascending: true })
    .order('title', { ascending: true })

  const tracks = (trackRows || []).map((row) => mapTrackRow(row, null, folder))
  const artwork = folder.artwork_url
    ? resolveImageUrl(folder.artwork_url)
    : tracks.find((t) => t.artwork)?.artwork

  return {
    collection: {
      id: String(folder.id),
      title: String(folder.name || 'Untitled'),
      type: String(folder.type || 'folder'),
      artwork: artwork || undefined,
      artist: albumArtist || tracks[0]?.artist || 'SERGIK',
      year: folder.year ?? null,
      trackCount: tracks.length,
      hidden: !!folder.hidden,
    },
    tracks,
  }
}

async function loadTrackShare(trackId: string): Promise<{
  collection: ShareCollectionPayload | null
  tracks: ShareTrackPayload[]
} | null> {
  const supabase = createSupabaseServerClient()
  const { data: track, error } = await supabase
    .from('music_library_tracks')
    .select(
      'id,title,artist,duration,year,artwork_url,file_url,folder_id,audio_file_id,display_order,track_number,bpm,key_signature,genre,subgenre,is_archived,music_library_folders(id,name,type,artwork_url,year,hidden)',
    )
    .eq('id', trackId)
    .maybeSingle()

  if (error || !track || track.is_archived) return null

  const folderRaw = track.music_library_folders
  const folder = Array.isArray(folderRaw) ? folderRaw[0] : folderRaw
  const mapped = mapTrackRow(track, null, folder)
  const collection: ShareCollectionPayload | null = folder
    ? {
        id: String(folder.id),
        title: String(folder.name || ''),
        type: String(folder.type || 'folder'),
        artwork: folder.artwork_url ? resolveImageUrl(folder.artwork_url) : mapped.artwork,
        artist: mapped.artist,
        year: folder.year ?? null,
        trackCount: 1,
        hidden: !!folder.hidden,
      }
    : null

  return { collection, tracks: [mapped] }
}

function buildResolved(
  row: MusicShareLinkRow,
  collection: ShareCollectionPayload | null,
  tracks: ShareTrackPayload[],
  origin?: string,
): ResolvedSharePayload {
  const title =
    row.title_override ||
    (row.kind === 'folder' ? collection?.title : tracks[0]?.title) ||
    'SERGIK'
  const base = origin || undefined

  return {
    share: {
      token: row.token,
      kind: row.kind,
      visibility: row.visibility,
      title,
    },
    collection,
    tracks,
    urls: {
      listen: listenUrlForToken(row.token, base),
      embed: embedUrlForToken(row.token, base),
      embedHtml: embedHtmlSnippet(row.token, base),
    },
  }
}

export async function getActiveShareForTarget(
  kind: ShareKind,
  targetId: string,
): Promise<MusicShareLinkRow | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('music_share_links')
    .select(SHARE_SELECT)
    .eq('kind', kind)
    .eq('target_id', targetId)
    .is('revoked_at', null)
    .neq('visibility', 'disabled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingShareTableError(error)) throw Object.assign(new Error(missingTableResponse().error), missingTableResponse())
    throw error
  }
  if (!data || !isShareActive(data as MusicShareLinkRow)) return null
  return data as MusicShareLinkRow
}

export async function createOrGetShareLink(opts: {
  kind: ShareKind
  targetId: string
  visibility?: ShareVisibility
  createdBy?: string | null
  titleOverride?: string | null
}): Promise<MusicShareLinkRow> {
  const existing = await getActiveShareForTarget(opts.kind, opts.targetId)
  if (existing) {
    const nextVisibility = opts.visibility
    if (nextVisibility && nextVisibility !== existing.visibility && nextVisibility !== 'disabled') {
      const supabase = createSupabaseServerClient()
      const { data, error } = await supabase
        .from('music_share_links')
        .update({
          visibility: nextVisibility,
          updated_at: new Date().toISOString(),
          ...(opts.titleOverride != null ? { title_override: opts.titleOverride } : {}),
        })
        .eq('id', existing.id)
        .select(SHARE_SELECT)
        .single()
      if (error) throw error
      return data as MusicShareLinkRow
    }
    return existing
  }

  const visibility: ShareVisibility = opts.visibility === 'public' ? 'public' : 'unlisted'
  const token = createShareToken()
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('music_share_links')
    .insert({
      token,
      kind: opts.kind,
      target_id: opts.targetId,
      visibility,
      title_override: opts.titleOverride || null,
      created_by: opts.createdBy || null,
    })
    .select(SHARE_SELECT)
    .single()

  if (error) {
    if (isMissingShareTableError(error)) {
      throw Object.assign(new Error(missingTableResponse().error), missingTableResponse())
    }
    // Race: unique active target — fetch winner
    if (error.code === '23505') {
      const again = await getActiveShareForTarget(opts.kind, opts.targetId)
      if (again) return again
    }
    throw error
  }
  return data as MusicShareLinkRow
}

export async function revokeShareLink(token: string): Promise<boolean> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('music_share_links')
    .update({
      revoked_at: new Date().toISOString(),
      visibility: 'disabled',
      updated_at: new Date().toISOString(),
    })
    .eq('token', token)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    if (isMissingShareTableError(error)) {
      throw Object.assign(new Error(missingTableResponse().error), missingTableResponse())
    }
    throw error
  }
  return !!data
}

export async function resolveShareByToken(
  token: string,
  opts?: { includePlaybackUrls?: boolean; bumpPlayCount?: boolean; origin?: string },
): Promise<ResolvedSharePayload | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('music_share_links')
    .select(SHARE_SELECT)
    .eq('token', token)
    .maybeSingle()

  if (error) {
    if (isMissingShareTableError(error)) {
      throw Object.assign(new Error(missingTableResponse().error), missingTableResponse())
    }
    throw error
  }
  if (!data || !isShareActive(data as MusicShareLinkRow)) return null

  const row = data as MusicShareLinkRow
  const loaded =
    row.kind === 'folder' ? await loadFolderShare(row.target_id) : await loadTrackShare(row.target_id)
  if (!loaded || loaded.tracks.length === 0) return null

  // Hidden folders/tracks are only reachable via unlisted (or public) share tokens —
  // resolveShareByToken is the gate; no extra catalog visibility check here.

  let tracks = loaded.tracks
  if (opts?.includePlaybackUrls !== false) {
    tracks = await attachPlaybackUrls(tracks)
  }

  if (opts?.bumpPlayCount) {
    void Promise.resolve(
      supabase
        .from('music_share_links')
        .update({
          play_count: (row.play_count || 0) + 1,
          last_played_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id),
    ).catch(() => undefined)
  }

  return buildResolved(row, loaded.collection, tracks, opts?.origin)
}

export async function adminShareBundle(
  kind: ShareKind,
  targetId: string,
  opts?: { visibility?: ShareVisibility; createdBy?: string | null; origin?: string },
): Promise<ResolvedSharePayload> {
  // Prefer unlisted for hidden folders so they stay out of any future public indexes.
  let visibility = opts?.visibility
  if (!visibility && kind === 'folder') {
    const supabase = createSupabaseServerClient()
    const { data: folder } = await supabase
      .from('music_library_folders')
      .select('hidden')
      .eq('id', targetId)
      .maybeSingle()
    visibility = folder?.hidden ? 'unlisted' : 'public'
  }
  if (!visibility) visibility = 'unlisted'

  const row = await createOrGetShareLink({
    kind,
    targetId,
    visibility,
    createdBy: opts?.createdBy,
  })

  const loaded =
    kind === 'folder' ? await loadFolderShare(targetId) : await loadTrackShare(targetId)
  if (!loaded || loaded.tracks.length === 0) {
    throw Object.assign(new Error('Nothing to share — no playable tracks found.'), {
      code: 'SHARE_EMPTY',
    })
  }

  return buildResolved(row, loaded.collection, loaded.tracks, opts?.origin)
}
