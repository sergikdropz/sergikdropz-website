/**
 * Load a SoundCloud upload packet from Supabase.
 * File bytes are the objects named by database URLs. This does not scan a local drive.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase'
import { namesForRole, parseContributors } from '@/lib/studio/track-credits'
import {
  buildSoundCloudUploadPacket,
  isDatabaseMediaReference,
  pickDatabaseAudioUrl,
  type SoundCloudUploadPacket,
} from '@/lib/ai/soundcloud-upload'

const RELEASE_SELECT =
  'id, title, type, genre, subgenre, album_artist, artwork_url, artwork_dsp_url, description, marketing_copy'

const TRACK_SELECT = 'id, title, track_number, wav_url, artwork_url, music_library_track_id, contributors'

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function marketingText(marketing: Record<string, unknown>): string {
  for (const key of ['store_description', 'description', 'youtube_description']) {
    const value = marketing[key]
    if (typeof value === 'string' && value.trim().length > 20) return value.trim()
  }
  return ''
}

function featuringLine(contributors: unknown): string {
  const names = namesForRole(parseContributors(contributors), 'featured')
  if (names.length === 2 && /^the\s+/i.test(names[1] || '')) return `${names[0]} and ${names[1]}`
  return names.join(', ')
}

export async function loadSoundCloudUploadPacket(
  releaseId: string,
  supabase: SupabaseClient = createSupabaseServerClient(),
): Promise<{ packet: SoundCloudUploadPacket | null; error: string | null }> {
  const id = clean(releaseId)
  if (!id) return { packet: null, error: 'Open the release in this chat so SoundCloud can read its files from the database.' }

  const { data: release, error: releaseError } = await supabase
    .from('distribution_releases')
    .select(RELEASE_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (releaseError) return { packet: null, error: releaseError.message }
  if (!release) return { packet: null, error: 'Release not found.' }

  const { data: trackRows, error: trackError } = await supabase
    .from('distribution_tracks')
    .select(TRACK_SELECT)
    .eq('release_id', id)
  if (trackError) return { packet: null, error: trackError.message }

  const tracks = (trackRows || []) as Array<Record<string, unknown>>
  const libraryIds = [
    ...new Set(
      tracks
        .map((track) => clean(track.music_library_track_id))
        .filter(Boolean),
    ),
  ]
  const libraryById = new Map<string, { file_url: string; artwork_url: string; audio_file_id: string }>()
  if (libraryIds.length) {
    const { data: libraryRows, error: libraryError } = await supabase
      .from('music_library_tracks')
      .select('id, file_url, artwork_url, audio_file_id')
      .in('id', libraryIds)
    if (libraryError) return { packet: null, error: libraryError.message }
    for (const row of libraryRows || []) {
      const item = row as Record<string, unknown>
      libraryById.set(clean(item.id), {
        file_url: clean(item.file_url),
        artwork_url: clean(item.artwork_url),
        audio_file_id: clean(item.audio_file_id),
      })
    }
  }

  const audioIds = [...new Set([...libraryById.values()].map((row) => row.audio_file_id).filter(Boolean))]
  const audioById = new Map<string, string>()
  if (audioIds.length) {
    const { data: audioRows, error: audioError } = await supabase
      .from('audio_files')
      .select('id, file_url')
      .in('id', audioIds)
    if (audioError) return { packet: null, error: audioError.message }
    for (const row of audioRows || []) {
      const item = row as Record<string, unknown>
      audioById.set(clean(item.id), clean(item.file_url))
    }
  }

  const row = release as Record<string, unknown>
  const marketing =
    row.marketing_copy && typeof row.marketing_copy === 'object'
      ? (row.marketing_copy as Record<string, unknown>)
      : {}
  const releaseArt = [clean(row.artwork_dsp_url), clean(row.artwork_url)].find((url) => isDatabaseMediaReference(url)) || ''

  const packetTracks = tracks.map((track, index) => {
    const library = libraryById.get(clean(track.music_library_track_id))
    const audio = pickDatabaseAudioUrl({
      wavUrl: clean(track.wav_url),
      libraryFileUrl: library?.file_url,
      audioFileUrl: library ? audioById.get(library.audio_file_id) : '',
    })
    return {
      track_number: Number(track.track_number) || index + 1,
      title: clean(track.title),
      featuring: featuringLine(track.contributors),
      audio_url: audio?.url || '',
      audio_source: audio?.source,
      description: '',
    }
  })

  const trackArt = tracks
    .map((track) => clean(track.artwork_url))
    .concat([...libraryById.values()].map((item) => item.artwork_url))
    .find((url) => isDatabaseMediaReference(url))

  const packet = buildSoundCloudUploadPacket({
    title: clean(row.title),
    artist: clean(row.album_artist) || 'SERGIK',
    type: clean(row.type),
    genre: clean(row.genre),
    subgenre: clean(row.subgenre),
    description: clean(row.description) || marketingText(marketing),
    artwork_url: releaseArt || trackArt || '',
    tracks: packetTracks,
  })
  return { packet, error: packet.ok ? null : packet.blockers[0] || 'SoundCloud packet is missing database files.' }
}
