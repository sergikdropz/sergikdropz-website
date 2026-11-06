import { createSupabaseServerClient } from '@/lib/supabase'
import { supabaseIsReachable } from '@/lib/supabaseReachability'
import { promoPlaybackUrlByTrackId } from '@/lib/studio/promo-track-audio'
import type { TvReleaseItem, TvTrackItem } from '@/lib/tv/catalog'
import { mergePlaybackTracks, playableAudioUrl } from '@/lib/tv/playback'

type TrackRow = {
  id: string
  release_id?: string | null
  title?: string | null
  duration?: number | null
  track_number?: number | null
  wav_url?: string | null
  music_library_track_id?: string | null
}

/** Attach the same vault files the catalog player uses. Titles stay when a file is missing. */
export async function attachTvPlayback(releases: TvReleaseItem[]): Promise<TvReleaseItem[]> {
  if (releases.length === 0) return releases
  try {
    if (!(await supabaseIsReachable())) return releases
    const supabase = createSupabaseServerClient()
    const ids = releases.map((release) => release.id).filter(Boolean)
    if (ids.length === 0) return releases

    const { data, error } = await supabase
      .from('distribution_tracks')
      .select('id, release_id, title, duration, track_number, wav_url, music_library_track_id')
      .in('release_id', ids)

    if (error || !data?.length) return releases

    const rows = data as TrackRow[]
    const playback = await promoPlaybackUrlByTrackId(supabase, rows)
    const byReleaseId: Record<string, TvTrackItem[]> = {}

    const ordered = [...rows].sort((a, b) => {
      const an = typeof a.track_number === 'number' ? a.track_number : Number.MAX_SAFE_INTEGER
      const bn = typeof b.track_number === 'number' ? b.track_number : Number.MAX_SAFE_INTEGER
      if (an !== bn) return an - bn
      return String(a.title || '').localeCompare(String(b.title || ''))
    })

    for (const row of ordered) {
      const releaseId = String(row.release_id || '')
      const title = String(row.title || '').trim()
      if (!releaseId || !title) continue
      const duration = typeof row.duration === 'number' && row.duration > 0 ? row.duration : null
      const audioUrl = playableAudioUrl(playback.get(String(row.id)))
      const list = byReleaseId[releaseId] || []
      list.push({ title, duration, audioUrl })
      byReleaseId[releaseId] = list
    }

    return mergePlaybackTracks(releases, byReleaseId)
  } catch (error) {
    console.error('[attachTvPlayback]', error)
    return releases
  }
}
