import type { SupabaseClient } from '@supabase/supabase-js'
import { catalogPlaybackSource } from '@/lib/audio/catalog-playback-file'
import { billedArtistLine } from '@/lib/studio/track-credits'
import { normalizeVaultAudioUrl } from '@/utils/normalizeVaultAudioUrl'

type DistTrack = {
  id: string
  title?: string | null
  wav_url?: string | null
  music_library_track_id?: string | null
}

/** Playable URL per distribution track, using the linked catalog file when the stored WAV is another song. */
export async function promoPlaybackUrlByTrackId(
  supabase: SupabaseClient,
  tracks: DistTrack[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const libraryIds = [
    ...new Set(tracks.map((track) => String(track.music_library_track_id || '').trim()).filter(Boolean)),
  ]

  const libraryById = new Map<string, { file_url?: string | null; audio_file_id?: string | null }>()
  if (libraryIds.length) {
    const library = await supabase
      .from('music_library_tracks')
      .select('id, file_url, audio_file_id')
      .in('id', libraryIds)
    for (const row of library.data || []) {
      if (row?.id) libraryById.set(String(row.id), row)
    }
  }

  const audioIds = [
    ...new Set(
      [...libraryById.values()].map((row) => String(row.audio_file_id || '').trim()).filter(Boolean),
    ),
  ]
  const audioById = new Map<string, { file_path?: string | null; file_url?: string | null }>()
  if (audioIds.length) {
    const audio = await supabase
      .from('audio_files')
      .select('id, file_path, file_url')
      .in('id', audioIds)
    for (const row of audio.data || []) {
      if (row?.id) audioById.set(String(row.id), row)
    }
  }

  for (const track of tracks) {
    const library = libraryById.get(String(track.music_library_track_id || ''))
    const audio = library?.audio_file_id ? audioById.get(String(library.audio_file_id)) : null
    const source = catalogPlaybackSource({
      libraryFileUrl: library?.file_url || track.wav_url,
      audioFilePath: audio?.file_path,
      audioFileUrl: audio?.file_url,
    })
    const playable = source ? normalizeVaultAudioUrl(source) || source : ''
    if (playable) out.set(track.id, playable)
  }
  return out
}

type CreditTrack = DistTrack & {
  contributors?: unknown
}

/** Billed artist per track, including collaborators stored on the track or its catalog row. */
export async function promoBilledArtistByTrackId(
  supabase: SupabaseClient,
  tracks: CreditTrack[],
  fallback?: string | null,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const libraryIds = [
    ...new Set(tracks.map((track) => String(track.music_library_track_id || '').trim()).filter(Boolean)),
  ]
  const libraryById = new Map<string, { artist?: string | null; title?: string | null }>()
  if (libraryIds.length) {
    const library = await supabase
      .from('music_library_tracks')
      .select('id, artist, title')
      .in('id', libraryIds)
    for (const row of library.data || []) {
      if (row?.id) libraryById.set(String(row.id), row)
    }
  }

  for (const track of tracks) {
    const library = libraryById.get(String(track.music_library_track_id || ''))
    out.set(
      track.id,
      billedArtistLine({
        contributors: track.contributors,
        libraryArtist: library?.artist,
        title: library?.title || track.title,
        fallback,
      }),
    )
  }
  return out
}

export type PromoLibraryMeta = {
  bpm: number | null
  durationSec: number | null
}

/** Catalog tempo and length for the 8-bar story tape. */
export async function promoLibraryMetaByTrackId(
  supabase: SupabaseClient,
  tracks: DistTrack[],
): Promise<Map<string, PromoLibraryMeta>> {
  const out = new Map<string, PromoLibraryMeta>()
  const libraryIds = [
    ...new Set(tracks.map((track) => String(track.music_library_track_id || '').trim()).filter(Boolean)),
  ]
  const libraryById = new Map<string, { bpm?: number | null; duration?: number | null }>()
  if (libraryIds.length) {
    const library = await supabase.from('music_library_tracks').select('id, bpm, duration').in('id', libraryIds)
    if (!library.error) {
      for (const row of library.data || []) {
        if (row?.id) libraryById.set(String(row.id), row)
      }
    }
  }
  for (const track of tracks) {
    const library = libraryById.get(String(track.music_library_track_id || ''))
    const bpm = Number(library?.bpm)
    const duration = Number(library?.duration)
    out.set(track.id, {
      bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
      durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
    })
  }
  return out
}
